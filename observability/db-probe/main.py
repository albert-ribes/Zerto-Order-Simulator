"""
db-probe: microservei mínim que testeja PostgreSQL directament.
Exposa GET /db/ping sense autenticació.
"""
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://zerto:zerto@db:5432/zerto")


def _parse_dsn(url):
    """Parse postgresql://user:pass@host:port/dbname"""
    url = url.replace("postgresql://", "")
    userpass, rest = url.split("@", 1)
    user, password = userpass.split(":", 1)
    hostport, dbname = rest.split("/", 1)
    if ":" in hostport:
        host, port = hostport.split(":", 1)
        port = int(port)
    else:
        host, port = hostport, 5432
    return {"host": host, "port": port, "user": user, "password": password, "dbname": dbname}


def probe():
    dsn = _parse_dsn(DATABASE_URL)
    try:
        t0 = time.monotonic()
        conn = psycopg2.connect(connect_timeout=3, **dsn)
        tcp_ms = round((time.monotonic() - t0) * 1000)
        cur = conn.cursor()
        t1 = time.monotonic()
        cur.execute("SELECT 1")
        sql_ms = round((time.monotonic() - t1) * 1000)
        cur.close()
        conn.close()
        return 200, {"status": "ok", "tcp_ms": tcp_ms, "sql_ms": sql_ms}
    except Exception as e:
        return 503, {"status": "error", "detail": str(e)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # silence access log

    def do_GET(self):
        if self.path == "/db/ping":
            code, body = probe()
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(data))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 5000), Handler)
    print("db-probe listening on :5000")
    server.serve_forever()
