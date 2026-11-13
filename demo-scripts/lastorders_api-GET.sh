#!/bin/bash
# ==============================================================================
# lastorders_api-GET.sh  —  Fetch recent records from each demo app API
#
#   · Processed Meat   GET /orders                 (port 8000, JWT auth)
#   · Hospital HDM     GET /api/discharges/recent  (port 8001, no auth)
#   · Flight Booking   GET /api/bookings           (port 8002, no auth)
#
# Usage:
#   ./lastorders_api-GET.sh                 — all 3 apps, last 3 records
#   ./lastorders_api-GET.sh 5               — all 3 apps, last 5 records
#   ./lastorders_api-GET.sh pm              — Processed Meat only, last 3
#   ./lastorders_api-GET.sh hdm fb          — Hospital + Flight Booking, last 3
#   ./lastorders_api-GET.sh 5 pm fb         — Processed Meat + FB, last 5
#   ./lastorders_api-GET.sh all 10          — all 3 apps, last 10 (order free)
# ==============================================================================

PM_API="http://10.20.0.147:8000"
HDM_API="http://10.20.0.147:8001"
FB_API="http://10.20.0.147:8002"

TMPFILE=$(mktemp /tmp/_api_last.XXXXXX)
trap 'rm -f "$TMPFILE"' EXIT

GRN='\033[0;32m' RED='\033[0;31m' YEL='\033[1;33m'
BLU='\033[0;34m' BLD='\033[1m' DIM='\033[2m' RST='\033[0m'

# ── Argument parsing (numeric → LIMIT, keyword → app selector) ───────────────
LIMIT=""
APPS=""
for arg in "$@"; do
  if [[ "$arg" =~ ^[1-9][0-9]*$ ]]; then
    LIMIT="$arg"
  else
    case "$arg" in
      pm|hdm|fb|all) APPS="$APPS $arg " ;;
      *)
        echo "Usage: $0 [LIMIT] [pm|hdm|fb|all] [...]"
        echo "  LIMIT: positive integer (default 3)"
        echo "  Apps:  pm  hdm  fb  all  (default: all, order-free)"
        exit 1
        ;;
    esac
  fi
done
LIMIT="${LIMIT:-3}"
[ -z "$APPS" ] && APPS=" all "

should_run() { [[ "$APPS" == *" all "* ]] || [[ "$APPS" == *" $1 "* ]]; }

TOTAL_APPS=0
should_run pm  && TOTAL_APPS=$((TOTAL_APPS+1))
should_run hdm && TOTAL_APPS=$((TOTAL_APPS+1))
should_run fb  && TOTAL_APPS=$((TOTAL_APPS+1))
STEP=0

# ── Helpers ───────────────────────────────────────────────────────────────────
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

# ── Header ────────────────────────────────────────────────────────────────────
APP_LABEL=""
should_run pm  && APP_LABEL="${APP_LABEL}pm "
should_run hdm && APP_LABEL="${APP_LABEL}hdm "
should_run fb  && APP_LABEL="${APP_LABEL}fb "
APP_LABEL="${APP_LABEL% }"

echo ""
echo -e "${BLD}╔══════════════════════════════════════════════════╗${RST}"
echo -e "${BLD}║   GET — Last ${LIMIT} records · failover test            ║${RST}"
echo -e "${BLD}║   Apps: ${APP_LABEL}$(printf '%*s' $((40 - ${#APP_LABEL})) '')║${RST}"
echo -e "${BLD}╚══════════════════════════════════════════════════╝${RST}"

# ══════════════════════════════════════════════════════════════════════════════
# PROCESSED MEAT — GET /orders
# ══════════════════════════════════════════════════════════════════════════════
if should_run pm; then
  STEP=$((STEP+1))
  echo ""
  echo -e "${YEL}${BLD}[${STEP}/${TOTAL_APPS}] Processed Meat${RST}  ${DIM}${PM_API}/orders?limit=${LIMIT}${RST}"

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
fi

# ══════════════════════════════════════════════════════════════════════════════
# HOSPITAL HDM — GET /api/discharges/recent
# ══════════════════════════════════════════════════════════════════════════════
if should_run hdm; then
  STEP=$((STEP+1))
  echo ""
  echo -e "${GRN}${BLD}[${STEP}/${TOTAL_APPS}] Hospital HDM${RST}  ${DIM}${HDM_API}/api/discharges/recent?n=${LIMIT}${RST}"

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
fi

# ══════════════════════════════════════════════════════════════════════════════
# FLIGHT BOOKING — GET /api/bookings
# ══════════════════════════════════════════════════════════════════════════════
if should_run fb; then
  STEP=$((STEP+1))
  echo ""
  echo -e "${BLU}${BLD}[${STEP}/${TOTAL_APPS}] Flight Booking${RST}  ${DIM}${FB_API}/api/bookings${RST}"

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
