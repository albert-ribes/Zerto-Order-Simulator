#!/bin/bash
# ==============================================================================
# insert_api-POST.sh  —  Create one record via the API of each demo app
#
# Tests all 3 backends during a failover test:
#   · Processed Meat   POST /orders          (port 8000, JWT auth)
#   · Hospital HDM     POST /api/discharges  (port 8001, no auth)
#   · Flight Booking   POST /api/bookings    (port 8002, no auth)
#
# Usage:
#   ./insert_api-POST.sh
# ==============================================================================

PM_API="http://10.20.0.147:8000"
HDM_API="http://10.20.0.147:8001"
FB_API="http://10.20.0.147:8002"

TMPFILE=$(mktemp /tmp/_api_insert.XXXXXX)
trap 'rm -f "$TMPFILE"' EXIT

GRN='\033[0;32m' RED='\033[0;31m' CYA='\033[0;36m' YEL='\033[1;33m'
BLU='\033[0;34m' MAG='\033[0;35m' BLD='\033[1m' DIM='\033[2m' RST='\033[0m'

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
echo -e "${BLD}║   POST — Insert record · 3-app failover test     ║${RST}"
echo -e "${BLD}╚══════════════════════════════════════════════════╝${RST}"

# ══════════════════════════════════════════════════════════════════════════════
# 1. PROCESSED MEAT — POST /orders
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${YEL}${BLD}[1/3] Processed Meat${RST}  ${DIM}${PM_API}/orders${RST}"

AUTH=$(curl -sf -X POST "${PM_API}/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin" 2>/dev/null)
TOKEN=$(echo "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  result fail "Auth failed — backend unreachable or wrong credentials"
else
  result ok "Auth OK  ${DIM}(${TOKEN:0:18}...)${RST}"

  PAYLOAD='{"client_id": 16, "product_id": 39, "quantity": 10}'
  HTTP=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
    -X POST "${PM_API}/orders" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")
  RESP=$(cat "$TMPFILE")

  if [ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]; then
    OID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))" 2>/dev/null)
    result ok "Order created  id=${YEL}${OID}${RST}  (HTTP ${HTTP})"
  else
    result fail "POST /orders failed (HTTP ${HTTP})" "$RESP"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# 2. HOSPITAL HDM — POST /api/discharges
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GRN}${BLD}[2/3] Hospital HDM${RST}  ${DIM}${HDM_API}/api/discharges${RST}"

TS=$(date +%s)
PID="T$(echo $TS | tail -c 8)"   # patient_id max 12 chars → "T" + 7 digits
TODAY=$(date +%Y-%m-%d)
PAYLOAD=$(python3 -c "
import json
print(json.dumps({
  'patient_id':            '${PID}',
  'patient_name':          'Pacient Test Failover',
  'ward':                  'MEDICINA_INTERNA',
  'bed_number':            'T-01',
  'admission_date':        '${TODAY}',
  'discharge_type':        'DOMICILIO',
  'diagnosis_code':        'Z00.0',
  'diagnosis_description': 'Alta de proves failover',
  'attending_unit':        'TEST',
  'destination':           'Domicili',
  'processing_time_min':   5
}))")

HTTP=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
  -X POST "${HDM_API}/api/discharges" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
RESP=$(cat "$TMPFILE")

if [ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]; then
  DID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id','?'))" 2>/dev/null)
  result ok "Discharge created  id=${YEL}${DID}${RST}  (HTTP ${HTTP})"
else
  result fail "POST /api/discharges failed (HTTP ${HTTP})" "$RESP"
fi

# ══════════════════════════════════════════════════════════════════════════════
# 3. FLIGHT BOOKING — POST /api/bookings
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BLU}${BLD}[3/3] Flight Booking${RST}  ${DIM}${FB_API}/api/bookings${RST}"

TS=$(date +%s)
PAYLOAD=$(python3 -c "
import json, time
ts = '${TS}'
print(json.dumps({
  'flight_id': 9,
  'seat_class_code': 'TOURIST',
  'customer': {
    'full_name':   'Test Failover',
    'email':       f'failover.{ts}@test.local',
    'phone':       '+34600000000',
    'document_id': f'TEST{ts}'
  }
}))")

HTTP=$(curl -s -o "$TMPFILE" -w "%{http_code}" \
  -X POST "${FB_API}/api/bookings" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
RESP=$(cat "$TMPFILE")

if [ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]; then
  BID=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('booking_reference', d.get('id','?')))" 2>/dev/null)
  result ok "Booking created  ref=${YEL}${BID}${RST}  (HTTP ${HTTP})"
else
  result fail "POST /api/bookings failed (HTTP ${HTTP})" "$RESP"
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
