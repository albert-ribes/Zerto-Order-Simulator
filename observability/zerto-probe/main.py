"""
zerto-probe: microservei que consulta les APIs dels Zerto Virtual Managers.
Port 5002.

Endpoints:
  GET /zerto/data   – dades completes (VPG, VMs, alertes, events)
  GET /zerto/ping   – estat de connectivitat
"""
import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from base64 import b64encode
from http.server import BaseHTTPRequestHandler, HTTPServer

# ── Configuració ZVMs ─────────────────────────────────────────────────────────
ZVMS = [
    {
        "id": "tec",
        "name": "ZVM TEC",
        "host": os.environ.get("ZVM1_HOST", "10.20.0.152"),
        "port": int(os.environ.get("ZVM1_PORT", "443")),
        "client_id": os.environ.get("ZVM1_CLIENT_ID", "grafana-client"),
        "client_secret": os.environ.get("ZVM1_CLIENT_SECRET", "zL1MhzdSebevQMxFZmbFmjqwSCfn1zHe"),
        "username": os.environ.get("ZVM1_USERNAME", "admin"),
        "password": os.environ.get("ZVM1_PASSWORD", 'Z3rt0d"t"162534'),
    },
    {
        "id": "recovery",
        "name": "ZVM Recovery",
        "host": os.environ.get("ZVM2_HOST", "10.20.0.121"),
        "port": int(os.environ.get("ZVM2_PORT", "443")),
        "client_id": os.environ.get("ZVM2_CLIENT_ID", "grafana-client"),
        "client_secret": os.environ.get("ZVM2_CLIENT_SECRET", "dGrmOabeoccdgnK4DxXgq6fMSUBNpUQq"),
        "username": os.environ.get("ZVM2_USERNAME", "admin"),
        "password": os.environ.get("ZVM2_PASSWORD", "Z3rt0d@t@123456"),
    },
]

VPG_NAME  = os.environ.get("ZVM_VPG_NAME", "ResilienceApp")
CACHE_TTL = int(os.environ.get("SCRAPE_SPEED", "20"))

# ── SSL (ZVMs usen certs autosignats) ─────────────────────────────────────────
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode    = ssl.CERT_NONE

# ── Token cache ───────────────────────────────────────────────────────────────
_tokens   = {}
_tok_lock = threading.Lock()


def _get_token(zvm):
    zid = zvm["id"]
    now = time.time()
    with _tok_lock:
        t = _tokens.get(zid)
        if t and t["expires"] > now + 30:
            return t["token"]

    token_url = f"https://{zvm['host']}:{zvm['port']}/auth/realms/zerto/protocol/openid-connect/token"

    def _try_oauth(payload):
        req = urllib.request.Request(token_url, data=urllib.parse.urlencode(payload).encode(), method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, context=_ssl_ctx, timeout=10) as r:
            body = json.loads(r.read())
            if "access_token" not in body:
                raise ValueError(body.get("error_description", "no access_token"))
            return body["access_token"], body.get("expires_in", 300)

    # Intent 1: OAuth2 client_credentials
    try:
        token, exp_in = _try_oauth({
            "grant_type": "client_credentials",
            "client_id": zvm["client_id"],
            "client_secret": zvm["client_secret"],
        })
        with _tok_lock:
            _tokens[zid] = {"token": token, "expires": now + exp_in - 15}
        return token
    except Exception:
        pass

    # Intent 2: OAuth2 password grant (quan client_credentials no és habilitat)
    try:
        token, exp_in = _try_oauth({
            "grant_type":    "password",
            "client_id":     zvm["client_id"],
            "client_secret": zvm["client_secret"],
            "username":      zvm["username"],
            "password":      zvm["password"],
            "scope":         "openid",
        })
        with _tok_lock:
            _tokens[zid] = {"token": token, "expires": now + exp_in - 15}
        return token
    except Exception:
        pass

    # Fallback: session auth (Zerto < 9)
    creds = b64encode(f"{zvm['username']}:{zvm['password']}".encode()).decode()
    url2  = f"https://{zvm['host']}:{zvm['port']}/v1/session/add"
    req2  = urllib.request.Request(url2, data=b"", method="POST")
    req2.add_header("Authorization", f"Basic {creds}")
    req2.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req2, context=_ssl_ctx, timeout=10) as r:
        tok = r.getheader("x-zerto-session")
        if tok:
            with _tok_lock:
                _tokens[zid] = {"token": tok, "expires": now + 3600}
            return tok
    raise RuntimeError(f"Auth failed for {zvm['name']}")


def _api(zvm, path):
    token = _get_token(zvm)
    url   = f"https://{zvm['host']}:{zvm['port']}{path}"
    req   = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, context=_ssl_ctx, timeout=10) as r:
        return json.loads(r.read())


# ── Per-ZVM fetch ─────────────────────────────────────────────────────────────
def _fetch_zvm(zvm):
    res = {
        "id": zvm["id"], "name": zvm["name"],
        "status": "error", "error": None,
        "vpg": None, "vms": [], "alerts": [], "events": [],
    }
    try:
        vpgs = _api(zvm, "/v1/vpgs")
        vpg  = next((v for v in vpgs if v.get("VpgName") == VPG_NAME), None)
        res["status"] = "ok"

        if not vpg:
            return res

        vpg_id = vpg["VpgIdentifier"]
        hist   = vpg.get("HistoryStatusApi") or {}
        fsafe  = vpg.get("FailSafeHistory")  or {}

        res["vpg"] = {
            "name":              vpg.get("VpgName"),
            "id":                vpg_id,
            "status":            vpg.get("Status", 0),
            "status_desc":       vpg.get("StatusDescription", ""),
            "sub_status":        vpg.get("SubStatus", 0),
            "sub_status_desc":   vpg.get("SubStatusDescription", ""),
            "rpo_actual_s":      vpg.get("ActualRPO", 0),
            "rpo_config_s":      vpg.get("ConfiguredRpoSeconds", 300),
            "history_actual_m":  hist.get("ActualHistoryInMinutes", 0),
            "history_config_m":  hist.get("ConfiguredHistoryInMinutes", 0),
            "failsafe_actual_m": fsafe.get("ActualFailSafeHistory", 0),
            "failsafe_config_m": fsafe.get("ConfiguredFailSafeHistory", 0),
            "alert_status":      vpg.get("AlertStatus", 0),
            "vms_count":         vpg.get("VmsCount", 0),
            "source_site":       vpg.get("ProtectedSiteName", ""),
            "target_site":       vpg.get("RecoverySiteName", ""),
            "iops":              round(vpg.get("IOPs", 0)),
            "throughput_mb":     round(vpg.get("ThroughputInMB", 0), 3),
            "used_storage_mb":   vpg.get("UsedStorageInMB", 0),
            "last_test":         vpg.get("LastTest"),
        }

        # VMs
        try:
            vms_raw = _api(zvm, f"/v1/vms?vpgName={urllib.parse.quote(VPG_NAME)}")
            res["vms"] = [
                {
                    "name":            vm.get("VmName", ""),
                    "status":          vm.get("Status", 0),
                    "status_desc":     vm.get("StatusDescription", ""),
                    "rpo_actual_s":    vm.get("ActualRPO", 0),
                    "used_storage_mb": vm.get("UsedStorageInMB", 0),
                    "journal_mb":      vm.get("JournalUsedStorageMb", 0),
                    "iops":            round(vm.get("IOPs", 0)),
                    "throughput_mb":   round(vm.get("ThroughputInMB", 0), 3),
                }
                for vm in vms_raw
            ]
        except Exception:
            pass

        # Alerts (totes, filtrarem al JS per VPG)
        try:
            alerts_raw = _api(zvm, "/v1/alerts")
            for a in alerts_raw:
                affected = [x.get("identifier") for x in (a.get("AffectedVpgs") or [])]
                if not affected or vpg_id in affected:
                    res["alerts"].append({
                        "level":       a.get("Level", ""),
                        "description": a.get("Description", ""),
                        "entity":      a.get("Entity", ""),
                        "help_id":     a.get("HelpIdentifier", ""),
                        "turned_on":   a.get("TurnedOn", ""),
                        "dismissed":   a.get("IsDismissed", False),
                    })
        except Exception:
            pass

        # Events (filtrats per VPG)
        try:
            events_raw = _api(zvm, f"/v1/events?vpgIdentifier={vpg_id}&count=15")
            for e in events_raw:
                res["events"].append({
                    "description": e.get("Description", ""),
                    "occurred_on": e.get("OccurredOn", ""),
                    "event_type":  e.get("EventType", 0),
                    "category":    e.get("EventCategory", ""),
                    "site":        e.get("SiteName", ""),
                    "user":        e.get("UserName", ""),
                    "success":     e.get("EventCompletedSuccessfully"),
                })
        except Exception:
            pass

    except Exception as e:
        res["status"] = "error"
        res["error"]  = str(e)
        with _tok_lock:
            _tokens.pop(zvm["id"], None)

    return res


def _ransomware_detected(zvms_data):
    for zd in zvms_data:
        if zd.get("vpg"):
            sub = (zd["vpg"].get("sub_status_desc") or "").lower()
            if "ransomware" in sub:
                return True
        for e in (zd.get("events") or []):
            if "ransomware" in (e.get("description") or "").lower():
                return True
            if e.get("event_type", 0) in (800, 801, 802, 803):
                return True
        for a in (zd.get("alerts") or []):
            if "ransomware" in (a.get("description") or "").lower():
                return True
    return False


# ── Data cache & background refresh ──────────────────────────────────────────
_data_cache = None
_data_ts    = 0.0
_data_lock  = threading.Lock()
_fetch_lock = threading.Lock()


def fetch_all():
    results = [None] * len(ZVMS)

    def worker(i, zvm):
        results[i] = _fetch_zvm(zvm)

    threads = [threading.Thread(target=worker, args=(i, z), daemon=True)
               for i, z in enumerate(ZVMS)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=15)

    zvms_data = [r for r in results if r is not None]
    return {
        "ts":        time.time(),
        "vpg_name":  VPG_NAME,
        "zvms":      zvms_data,
        "ransomware": _ransomware_detected(zvms_data),
    }


def get_cached():
    global _data_cache, _data_ts
    now = time.time()
    with _data_lock:
        if _data_cache and (now - _data_ts) < CACHE_TTL:
            return _data_cache
    with _fetch_lock:
        with _data_lock:
            if _data_cache and (now - _data_ts) < CACHE_TTL:
                return _data_cache
        data = fetch_all()
        with _data_lock:
            _data_cache = data
            _data_ts    = time.time()
        return data


def _bg_refresh():
    global _data_cache, _data_ts
    time.sleep(2)  # warm-up
    while True:
        try:
            data = fetch_all()
            with _data_lock:
                _data_cache = data
                _data_ts    = time.time()
        except Exception:
            pass
        time.sleep(CACHE_TTL)


# ── HTTP server ───────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(data))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/zerto/data":
            try:
                self._send(200, get_cached())
            except Exception as e:
                self._send(503, {"status": "error", "detail": str(e)})
        elif self.path == "/zerto/ping":
            self._send(200, {"status": "ok", "ts": time.time()})
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    threading.Thread(target=_bg_refresh, daemon=True).start()
    server = HTTPServer(("0.0.0.0", 5002), Handler)
    print(f"zerto-probe listening on :5002  (VPG={VPG_NAME}, cache={CACHE_TTL}s)")
    server.serve_forever()
