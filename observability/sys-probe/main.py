"""
sys-probe: microservei mínim que exposa mètriques del sistema operatiu.
Exposa GET /sys/metrics sense autenticació.
"""
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import psutil


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
            "disk_total_gb": round(disk.total / 1024**3, 1),
            "disk_used_gb":  round(disk.used  / 1024**3, 1),
            "disk_percent":  round(disk.percent, 1),
            "uptime_s":      uptime_s,
        }
    except Exception as e:
        return 503, {"status": "error", "detail": str(e)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # silence access log

    def do_GET(self):
        if self.path == "/sys/metrics":
            code, body = sys_metrics()
        else:
            self.send_response(404)
            self.end_headers()
            return

        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(data))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 5001), Handler)
    print("sys-probe listening on :5001")
    server.serve_forever()
