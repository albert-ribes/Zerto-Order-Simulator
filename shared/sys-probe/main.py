"""
sys-probe: microservei mínim que exposa mètriques del sistema operatiu.
Exposa GET /sys/metrics sense autenticació.
Opcional: GET /containers (estat + últimes 30 línies de log) només per als
contenidors llistats a PROBE_CONTAINERS i si hi ha /var/run/docker.sock muntat.
"""
import http.client
import os
import re
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import psutil

DOCKER_SOCK = "/var/run/docker.sock"
NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$")
PROBE_CONTAINERS = [n for n in (s.strip() for s in os.environ.get("PROBE_CONTAINERS", "").split(",")) if NAME_RE.match(n)]


class DockerConnection(http.client.HTTPConnection):
    def __init__(self):
        super().__init__("localhost", timeout=5)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(5)
        self.sock.connect(DOCKER_SOCK)


def docker_get(path):
    conn = DockerConnection()
    try:
        conn.request("GET", path)
        resp = conn.getresponse()
        return resp.status, resp.read()
    finally:
        conn.close()


def demux_logs(raw, tty):
    if tty:
        return raw.decode("utf-8", "replace")
    out, i = [], 0
    while i + 8 <= len(raw):
        size = int.from_bytes(raw[i + 4:i + 8], "big")
        out.append(raw[i + 8:i + 8 + size].decode("utf-8", "replace"))
        i += 8 + size
    return "".join(out)


def container_status(name):
    code, body = docker_get(f"/containers/{name}/json")
    if code == 404:
        return {"name": name, "state": "missing", "running": False}
    if code != 200:
        return {"name": name, "state": "error", "running": False, "detail": f"docker api {code}"}
    info = json.loads(body)
    state = info.get("State", {})
    _, logs = docker_get(f"/containers/{name}/logs?stdout=1&stderr=1&timestamps=1&tail=30")
    return {
        "name": name,
        "image": info.get("Config", {}).get("Image"),
        "state": state.get("Status"),
        "running": bool(state.get("Running")),
        "restarting": bool(state.get("Restarting")),
        "exitCode": state.get("ExitCode"),
        "startedAt": state.get("StartedAt"),
        "finishedAt": state.get("FinishedAt"),
        "restartCount": info.get("RestartCount"),
        "health": (state.get("Health") or {}).get("Status"),
        "logs": demux_logs(logs, info.get("Config", {}).get("Tty", False))[-6000:],
    }


def containers():
    if not PROBE_CONTAINERS:
        return 404, {"status": "error", "detail": "PROBE_CONTAINERS not configured"}
    if not os.path.exists(DOCKER_SOCK):
        return 503, {"status": "error", "detail": "docker socket not mounted"}
    try:
        return 200, [container_status(name) for name in PROBE_CONTAINERS]
    except Exception as e:
        return 503, {"status": "error", "detail": str(e)}


def sys_metrics():
    try:
        cpu  = psutil.cpu_percent(interval=0.2)
        mem  = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        uptime_s = int(time.time() - psutil.boot_time())
        return 200, {
            "status":        "ok",
            "cpu_percent":   round(cpu, 1),
            "mem_total_mb":  round(mem.total  / 1024**2),
            "mem_used_mb":   round(mem.used   / 1024**2),
            "mem_percent":   round(mem.percent, 1),
            # aliases for clients that use ram_* / uptime_seconds naming
            "ram_total_mb":  round(mem.total  / 1024**2),
            "ram_used_mb":   round(mem.used   / 1024**2),
            "disk_total_gb": round(disk.total / 1024**3, 1),
            "disk_used_gb":  round(disk.used  / 1024**3, 1),
            "disk_percent":  round(disk.percent, 1),
            "uptime_s":        uptime_s,
            "uptime_seconds":  uptime_s,
        }
    except Exception as e:
        return 503, {"status": "error", "detail": str(e)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # silence access log

    def do_GET(self):
        if self.path == "/sys/metrics":
            code, body = sys_metrics()
        elif self.path == "/containers":
            code, body = containers()
        else:
            self.send_response(404)
            self.end_headers()
            return

        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(data))
        # Logs are not exposed to browsers on other origins.
        if self.path == "/sys/metrics":
            self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 5001), Handler)
    print("sys-probe listening on :5001")
    server.serve_forever()
