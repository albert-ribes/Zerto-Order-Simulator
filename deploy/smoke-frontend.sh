#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# smoke-frontend.sh — Comprova que el frontend és operatiu
#
# Ús:
#   ./smoke-frontend.sh              → comprova frontend.tec.bcn (producció)
#   ./smoke-frontend.sh http://host  → comprova una URL base personalitzada
#
# Retorna exit 0 si tots els checks passen, exit 1 si algun falla.
# ─────────────────────────────────────────────────────────────────────────────

BASE="${1:-http://frontend}"
PASS=0; FAIL=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
section() { echo -e "\n${YELLOW}── $1${NC}"; }

# ── Helper: HTTP status code ──────────────────────────────────────────────────
status() { curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$1"; }

# ── Helper: JSON field ────────────────────────────────────────────────────────
json_get() { echo "$1" | grep -o "\"$2\":[^,}]*" | head -1 | cut -d: -f2 | tr -d ' "'; }

echo -e "\n🔍 Smoke test frontend: ${BASE}"

# ─────────────────────────────────────────────────────────────────────────────
section "Pàgina principal i assets estàtics"
# ─────────────────────────────────────────────────────────────────────────────

code=$(status "$BASE/")
[ "$code" = "200" ] && ok "GET /  →  $code" || fail "GET /  →  $code (esperat 200)"

body=$(curl -s --max-time 5 "$BASE/")
echo "$body" | grep -q "<title>" \
  && ok "/ retorna HTML (conté <title>)" \
  || fail "/ no retorna HTML vàlid"

for asset in /css/style.css /js/app.js /js/i18n.js; do
  code=$(status "$BASE$asset")
  [ "$code" = "200" ] && ok "GET $asset  →  $code" || fail "GET $asset  →  $code (esperat 200)"
done

# ─────────────────────────────────────────────────────────────────────────────
section "Proxy API → Backend"
# ─────────────────────────────────────────────────────────────────────────────

# /api/ping ha de retornar {"pong":true}
ping_body=$(curl -s --max-time 5 "$BASE/api/ping")
echo "$ping_body" | grep -q '"pong"' \
  && ok "GET /api/ping  →  pong" \
  || fail "GET /api/ping  →  resposta inesperada: $ping_body"

# /api/generator/status ha de retornar {"running":...}
gen_body=$(curl -s --max-time 5 "$BASE/api/generator/status")
echo "$gen_body" | grep -q '"running"' \
  && ok "GET /api/generator/status  →  ok" \
  || fail "GET /api/generator/status  →  resposta inesperada: $gen_body"

# /api/auth/login ha de retornar token vàlid
token_body=$(curl -s --max-time 5 -X POST "$BASE/api/auth/login" \
  -d "username=admin&password=admin")
TOKEN=$(json_get "$token_body" "access_token")
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] \
  && ok "POST /api/auth/login  →  token obtingut" \
  || fail "POST /api/auth/login  →  no s'ha obtingut token: $token_body"

# /api/clients (autenticat) ha de retornar llista
if [ -n "$TOKEN" ]; then
  clients_body=$(curl -s --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/api/clients")
  echo "$clients_body" | grep -q '\[' \
    && ok "GET /api/clients (autenticat)  →  llista rebuda" \
    || fail "GET /api/clients (autenticat)  →  resposta inesperada: ${clients_body:0:80}"

  products_body=$(curl -s --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/api/products")
  echo "$products_body" | grep -q '\[' \
    && ok "GET /api/products (autenticat)  →  llista rebuda" \
    || fail "GET /api/products (autenticat)  →  resposta inesperada: ${products_body:0:80}"

  orders_body=$(curl -s --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/api/orders")
  echo "$orders_body" | grep -q '"items"' \
    && ok "GET /api/orders (autenticat)  →  items rebuts" \
    || fail "GET /api/orders (autenticat)  →  resposta inesperada: ${orders_body:0:80}"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "Proxy API → Mètriques de sistema"
# ─────────────────────────────────────────────────────────────────────────────

metrics_body=$(curl -s --max-time 5 "$BASE/api/system/metrics")
echo "$metrics_body" | grep -q '"cpu_percent"' \
  && ok "GET /api/system/metrics  →  cpu_percent present" \
  || fail "GET /api/system/metrics  →  resposta inesperada: ${metrics_body:0:80}"

# ─────────────────────────────────────────────────────────────────────────────
section "SPA routing i rutes API inexistents"
# ─────────────────────────────────────────────────────────────────────────────

# Rutes de la SPA (frontend) han de retornar 200 + HTML (nginx try_files)
code=$(status "$BASE/qualsevol-ruta-spa")
[ "$code" = "200" ] && ok "GET /ruta-spa  →  200 (SPA fallback correcte)" || fail "GET /ruta-spa  →  $code (esperat 200 SPA)"

# Rutes d'API inexistents han de retornar un codi no-200 (404 o 401/422 si auth va primer)
code=$(status "$BASE/api/endpoint-inexistent-xyz")
[ "$code" != "200" ] && ok "GET /api/inexistent  →  $code (no-200, proxy actiu)" || fail "GET /api/inexistent  →  $code (no hauria de retornar 200)"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}✅ Tots els checks han passat ($PASS/$TOTAL)${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAIL/$TOTAL checks han fallat${NC}"
  exit 1
fi
