#!/bin/bash
# ==============================================================================
# lastorders_api-GET.sh  —  Fetch recent records from each demo app API
#
# Tests all 3 backends during a failover test:
#   · Processed Meat   GET /orders                 (port 8000, JWT auth)
#   · Hospital HDM     GET /api/discharges/recent  (port 8001, no auth)
#   · Flight Booking   GET /api/bookings           (port 8002, no auth)
#
# Usage:
#   ./lastorders_api-GET.sh [LIMIT]     (default: 3)
# ==============================================================================

PM_API="http://10.20.0.147:8000"
HDM_API="http://10.20.0.147:8001"
FB_API="http://10.20.0.147:8002"

LIMIT="${1:-3}"
TMPFILE=$(mktemp /tmp/_api_last.XXXXXX)
trap 'rm -f "$TMPFILE"' EXIT

if ! [[ "$LIMIT" =~ ^[1-9][0-9]*$ ]]; then
  echo "Usage: $0 [LIMIT]   (positive integer, default 3)"
  exit 1
fi

GRN='\033[0;32m' RED='\033[0;31m' CYA='\033[0;36m' YEL='\033[1;33m'
BLU='\033[0;34m' BLD='\033[1m' DIM='\033[2m' RST='\033[0m'

PASS=0
FAIL=0

result() {
  if [ "$1" = "ok" ]; then
    echo -e "  ${GRN}✔  $2${RST}"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗  $2${RST}"
    [ -n "$3" ] && echo -e "     ${DIM}${3}${RST}"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo -e "${BLD}╔══════════════════════════════════════════════════╗${RST}"
echo -e "${BLD}║   GET — Last ${LIMIT} records · 3-app failover test    ║${RST}"
echo -e "${BLD}╚══════════════════════════════════════════════════╝${RST}"

# ══════════════════════════════════════════════════════════════════════════════
# 1. PROCESSED MEAT — GET /orders
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YEL}${BLD}[1/3] Processed Meat${RST}  ${DIM}${PM_API}/orders?limit=${LIMIT}${RST}"

AUTH=$(curl -sf -X POST "${PM_API}/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin" 2>/dev/null)
TOKEN=$(echo "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  result fail "Auth failed — backend unreachable or wrong credentials"
else
  result ok "Auth OK  ${DIM}(${TOKEN:0:18}...)${RST}"

  HTTP=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
    "${PM_API}/orders?limit=${LIMIT}&offset=0" \
    -H "Authorization: Bearer ${TOKEN}")
  RESP=$(cat "$TMPFILE")

  if [ "$HTTP" = "200" ]; then
    COUNT=$(echo "$RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
items = d.get('items', d) if isinstance(d,dict) else d
print(len(items) if isinstance(items,list) else '?')" 2>/dev/null)
    TOTAL=$(echo "$RESP" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d.get('total','?')) if isinstance(d,dict) else print('?')" 2>/dev/null)
    result ok "${COUNT} orders returned  ${DIM}(total in DB: ${TOTAL})${RST}  (HTTP ${HTTP})"
    echo "$RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=d.get('items',d) if isinstance(d,dict) else d
if isinstance(items,list):
  for o in items[:${LIMIT}]:
    print(f\"     id={o.get('id','?')}  client={o.get('client_name',o.get('client_id','?'))}  qty={o.get('quantity','?')}  {o.get('created_at','')[:16]}\")" 2>/dev/null
  else
    result fail "GET /orders failed (HTTP ${HTTP})" "$RESP"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# 2. HOSPITAL HDM — GET /api/discharges/recent
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GRN}${BLD}[2/3] Hospital HDM${RST}  ${DIM}${HDM_API}/api/discharges/recent?n=${LIMIT}${RST}"

HTTP=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
  "${HDM_API}/api/discharges/recent?n=${LIMIT}")
RESP=$(cat "$TMPFILE")

if [ "$HTTP" = "200" ]; then
  COUNT=$(echo "$RESP" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  result ok "${COUNT} discharges returned  (HTTP ${HTTP})"
  echo "$RESP" | python3 -c "
import sys,json
for d in json.load(sys.stdin)[:${LIMIT}]:
  print(f\"     id={d.get('id','?')}  patient={d.get('patient_name','?')[:30]}  ward={d.get('ward','?')}  {str(d.get('discharge_date',''))[:10]}\")" 2>/dev/null
else
  result fail "GET /api/discharges/recent failed (HTTP ${HTTP})" "$RESP"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 3. FLIGHT BOOKING — GET /api/bookings
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLU}${BLD}[3/3] Flight Booking${RST}  ${DIM}${FB_API}/api/bookings${RST}"

HTTP=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
  "${FB_API}/api/bookings?limit=${LIMIT}")
RESP=$(cat "$TMPFILE")

if [ "$HTTP" = "200" ]; then
  COUNT=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('items',d.get('bookings',[]))))" 2>/dev/null)
  result ok "${COUNT} bookings returned  (HTTP ${HTTP})"
  echo "$RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=d if isinstance(d,list) else d.get('items',d.get('bookings',[]))
for b in items[:${LIMIT}]:
  cust=b.get('customer',{})
  fl=b.get('flight',{})
  orig=fl.get('origin',{}).get('iata_code','?')
  dest=fl.get('destination',{}).get('iata_code','?')
  print(f\"     ref={b.get('booking_reference',b.get('id','?'))}  {cust.get('full_name','?')[:25]}  {orig}->{dest}  {b.get('status','?')}\")" 2>/dev/null
else
  result fail "GET /api/bookings failed (HTTP ${HTTP})" "$RESP"
fi

# ══════════════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${DIM}──────────────────────────────────────────────────${RST}"
TOTAL=$((PASS+FAIL))
if [ "$FAIL" = "0" ]; then
  echo -e "  ${GRN}${BLD}All ${TOTAL} checks passed${RST} — APIs operational"
  echo ""
  exit 0
else
  echo -e "  ${RED}${BLD}${FAIL}/${TOTAL} checks failed${RST} — verify affected services"
  echo ""
  exit 1
fi
