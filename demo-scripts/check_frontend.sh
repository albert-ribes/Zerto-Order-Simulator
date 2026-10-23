#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# check_frontend.sh — Verify that the frontend is operational
#
# Usage:
#   ./check_frontend.sh              → checks frontend.tec.bcn (production)
#   ./check_frontend.sh http://host  → checks a custom base URL
#
# Returns exit 0 if all checks pass, exit 1 if any fail.
# ─────────────────────────────────────────────────────────────────────────────

BASE="${1:-http://frontend}"
PASS=0; FAIL=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()      { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS+1)); }
fail()    { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL+1)); }
section() { echo -e "\n${YELLOW}── $1${NC}"; }

# ── Helper: HTTP status code ──────────────────────────────────────────────────
status() { curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$1"; }

# ── Helper: JSON field ────────────────────────────────────────────────────────
json_get() { echo "$1" | grep -o "\"$2\":[^,}]*" | head -1 | cut -d: -f2 | tr -d ' "'; }

echo -e "\n🔍 Frontend smoke test: ${BASE}"

# ─────────────────────────────────────────────────────────────────────────────
section "Main page and static assets"
# ─────────────────────────────────────────────────────────────────────────────

code=$(status "$BASE/")
[ "$code" = "200" ] && ok "GET /  →  $code" || fail "GET /  →  $code (expected 200)"

body=$(curl -s --max-time 5 "$BASE/")
echo "$body" | grep -q "<title>" \
  && ok "/ returns HTML (contains <title>)" \
  || fail "/ does not return valid HTML"

for asset in /css/style.css /js/app.js /js/i18n.js; do
  code=$(status "$BASE$asset")
  [ "$code" = "200" ] && ok "GET $asset  →  $code" || fail "GET $asset  →  $code (expected 200)"
done

# ─────────────────────────────────────────────────────────────────────────────
section "API proxy → Backend"
# ─────────────────────────────────────────────────────────────────────────────

# /api/ping should return {"pong":true}
ping_body=$(curl -s --max-time 5 "$BASE/api/ping")
echo "$ping_body" | grep -q '"pong"' \
  && ok "GET /api/ping  →  pong" \
  || fail "GET /api/ping  →  unexpected response: $ping_body"

# /api/generator/status should return {"running":...}
gen_body=$(curl -s --max-time 5 "$BASE/api/generator/status")
echo "$gen_body" | grep -q '"running"' \
  && ok "GET /api/generator/status  →  ok" \
  || fail "GET /api/generator/status  →  unexpected response: $gen_body"

# /api/auth/login should return a valid token
token_body=$(curl -s --max-time 5 -X POST "$BASE/api/auth/login" \
  -d "username=admin&password=admin")
TOKEN=$(json_get "$token_body" "access_token")
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] \
  && ok "POST /api/auth/login  →  token obtained" \
  || fail "POST /api/auth/login  →  no token received: $token_body"

# /api/clients (authenticated) should return a list
if [ -n "$TOKEN" ]; then
  clients_body=$(curl -s --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/api/clients")
  echo "$clients_body" | grep -q '\[' \
    && ok "GET /api/clients (authenticated)  →  list received" \
    || fail "GET /api/clients (authenticated)  →  unexpected response: ${clients_body:0:80}"

  products_body=$(curl -s --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/api/products")
  echo "$products_body" | grep -q '\[' \
    && ok "GET /api/products (authenticated)  →  list received" \
    || fail "GET /api/products (authenticated)  →  unexpected response: ${products_body:0:80}"

  orders_body=$(curl -s --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/api/orders")
  echo "$orders_body" | grep -q '"items"' \
    && ok "GET /api/orders (authenticated)  →  items received" \
    || fail "GET /api/orders (authenticated)  →  unexpected response: ${orders_body:0:80}"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "API proxy → System metrics"
# ─────────────────────────────────────────────────────────────────────────────

metrics_body=$(curl -s --max-time 5 "$BASE/api/system/metrics")
echo "$metrics_body" | grep -q '"cpu_percent"' \
  && ok "GET /api/system/metrics  →  cpu_percent present" \
  || fail "GET /api/system/metrics  →  unexpected response: ${metrics_body:0:80}"

# ─────────────────────────────────────────────────────────────────────────────
section "SPA routing and unknown API endpoints"
# ─────────────────────────────────────────────────────────────────────────────

# SPA routes should return 200 + HTML (nginx try_files fallback)
code=$(status "$BASE/any-spa-route")
[ "$code" = "200" ] && ok "GET /any-spa-route  →  200 (SPA fallback OK)" || fail "GET /any-spa-route  →  $code (expected 200)"

# Unknown API endpoints should return non-200 (404 or 401/422 if auth runs first)
code=$(status "$BASE/api/nonexistent-endpoint-xyz")
[ "$code" != "200" ] && ok "GET /api/nonexistent  →  $code (non-200, proxy active)" || fail "GET /api/nonexistent  →  $code (should not return 200)"

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed ($PASS/$TOTAL)${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAIL/$TOTAL checks failed${NC}"
  exit 1
fi
