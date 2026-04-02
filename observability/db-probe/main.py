"""
db-probe: microservei mínim que testeja PostgreSQL directament.
Exposa GET /db/ping i GET /db/metrics sense autenticació.
"""
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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


def db_metrics():
    dsn = _parse_dsn(DATABASE_URL)
    try:
        conn = psycopg2.connect(connect_timeout=3, **dsn)
        cur = conn.cursor()

        cur.execute("SELECT count(*) FROM pg_stat_activity")
        total_conn = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")
        active_conn = cur.fetchone()[0]

        cur.execute("SHOW max_connections")
        max_conn = int(cur.fetchone()[0])

        cur.execute("SELECT pg_database_size(current_database())")
        db_size_bytes = cur.fetchone()[0]

        cur.execute("""
            SELECT round(
                100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 1
            )
            FROM pg_stat_database WHERE datname = current_database()
        """)
        row = cur.fetchone()
        cache_hit = float(row[0]) if row and row[0] is not None else None

        cur.execute("""
            SELECT round(xact_commit + xact_rollback)
            FROM pg_stat_database WHERE datname = current_database()
        """)
        row2 = cur.fetchone()
        transactions = int(row2[0]) if row2 and row2[0] is not None else None

        cur.close()
        conn.close()

        conn_pct = round(100.0 * total_conn / max_conn, 1) if max_conn else 0

        return 200, {
            "status": "ok",
            "total_connections":   total_conn,
            "active_connections":  active_conn,
            "max_connections":     max_conn,
            "connections_percent": conn_pct,
            "db_size_mb":          round(db_size_bytes / 1024**2, 1),
            "cache_hit_ratio":     cache_hit,
            "transactions":        transactions,
        }
    except Exception as e:
        return 503, {"status": "error", "detail": str(e)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # silence access log

    def do_GET(self):
        if self.path == "/db/ping":
            code, body = probe()
        elif self.path == "/db/metrics":
            code, body = db_metrics()
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
    server = ThreadingHTTPServer(("0.0.0.0", 5000), Handler)
    print("db-probe listening on :5000")
    server.serve_forever()
