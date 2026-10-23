#!/usr/bin/env python3
import os

DEST = "/home/adminhpe/scripts"

# ── insert_api-POST.sh ────────────────────────────────────────────────────────
insert = r"""#!/bin/bash
# ==============================================================================
# insert_api-POST.sh  -  Create a new order via the backend API
#
# Usage:
#   ./insert_api-POST.sh [CLIENT_ID] [PRODUCT_ID] [QUANTITY]
#   ./insert_api-POST.sh 16 39 30        (defaults)
# ==============================================================================

API="http://backend.tec.bcn:8000"
CLIENT_ID="${1:-16}"
PRODUCT_ID="${2:-39}"
QUANTITY="${3:-30}"
TMPFILE=$(mktemp /tmp/_api_insert.XXXXXX)
trap 'rm -f "$TMPFILE"' EXIT

GRN='\033[0;32m' RED='\033[0;31m' CYA='\033[0;36m' YEL='\033[1;33m'
BLD='\033[1m' DIM='\033[2m' RST='\033[0m'

echo ""
echo -e "${BLD}POST /orders  —  Create new order${RST}"
echo -e "${DIM}─────────────────────────────────────────────${RST}"
echo -e "  Endpoint  : ${CYA}${API}/orders${RST}"
echo -e "  Payload   : client_id=${YEL}${CLIENT_ID}${RST}  product_id=${YEL}${PRODUCT_ID}${RST}  quantity=${YEL}${QUANTITY}${RST}"
echo ""

# -- [1/2] Authenticate -------------------------------------------------------
echo -e "${BLD}[1/2]${RST} Authenticating..."
AUTH_RESPONSE=$(curl -sf -X POST "${API}/auth/login" \
  -d "username=admin&password=admin" 2>&1)

if [ $? -ne 0 ] || [ -z "$AUTH_RESPONSE" ]; then
  echo -e "      ${RED}✗  Authentication failed — backend unreachable${RST}"
  exit 1
fi

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo -e "      ${RED}✗  No token received${RST}"
  echo "      Response: $AUTH_RESPONSE"
  exit 1
fi
echo -e "      ${GRN}✔  Token obtained${RST}  ${DIM}(${TOKEN:0:20}...)${RST}"

# -- [2/2] Create order -------------------------------------------------------
echo -e "${BLD}[2/2]${RST} Creating order..."
PAYLOAD="{\"client_id\": ${CLIENT_ID}, \"product_id\": ${PRODUCT_ID}, \"quantity\": ${QUANTITY}}"

HTTP_CODE=$(curl -s -o $TMPFILE -w "%{http_code}" \
  -X POST "${API}/orders" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

RESPONSE=$(cat $TMPFILE)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  ORDER_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','?'))" 2>/dev/null)
  CLIENT=$(echo "$RESPONSE"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('client_name', d.get('client_id','?')))" 2>/dev/null)
  PRODUCT=$(echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('product_name', d.get('product_id','?')))" 2>/dev/null)
  TOTAL=$(echo "$RESPONSE"    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total_price','?'))" 2>/dev/null)
  echo -e "      ${GRN}✔  Order created  (HTTP ${HTTP_CODE})${RST}"
  echo ""
  echo -e "${DIM}─────────────────────────────────────────────${RST}"
  echo -e "  Order ID    : ${YEL}${ORDER_ID}${RST}"
  echo -e "  Client      : ${YEL}${CLIENT}${RST}"
  echo -e "  Product     : ${YEL}${PRODUCT}${RST}"
  echo -e "  Total price : ${YEL}${TOTAL}${RST}"
  echo -e "${DIM}─────────────────────────────────────────────${RST}"
  echo ""
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=4))"
else
  echo -e "      ${RED}✗  Request failed  (HTTP ${HTTP_CODE})${RST}"
  echo ""
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=4))" 2>/dev/null || echo "$RESPONSE"
  exit 1
fi
echo ""
"""

# ── get_order_api-GET.sh ──────────────────────────────────────────────────────
get_order = r"""#!/bin/bash
# ==============================================================================
# get_order_api-GET.sh  -  Fetch a single order by ID from the backend API
#
# Usage:
#   ./get_order_api-GET.sh [ORDER_ID]     (default: latest order in DB)
# ==============================================================================

API="http://backend.tec.bcn:8000"
TMPFILE=$(mktemp /tmp/_api_get.XXXXXX)
trap 'rm -f "$TMPFILE"' EXIT

GRN='\033[0;32m' RED='\033[0;31m' CYA='\033[0;36m' YEL='\033[1;33m'
BLD='\033[1m' DIM='\033[2m' RST='\033[0m'

# -- [1/3] Authenticate -------------------------------------------------------
echo ""
echo -e "${BLD}[1/3]${RST} Authenticating..."
AUTH_RESPONSE=$(curl -sf -X POST "${API}/auth/login" \
  -d "username=admin&password=admin" 2>&1)

if [ $? -ne 0 ] || [ -z "$AUTH_RESPONSE" ]; then
  echo -e "      ${RED}✗  Authentication failed — backend unreachable${RST}"
  exit 1
fi

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo -e "      ${RED}✗  No token received${RST}"
  echo "      Response: $AUTH_RESPONSE"
  exit 1
fi
echo -e "      ${GRN}✔  Token obtained${RST}  ${DIM}(${TOKEN:0:20}...)${RST}"

# -- [2/3] Resolve ORDER_ID (auto-detect latest if not provided) ---------------
if [ -n "$1" ]; then
  ORDER_ID="$1"
  echo -e "${BLD}[2/3]${RST} Using provided ID: ${YEL}${ORDER_ID}${RST}"
else
  echo -e "${BLD}[2/3]${RST} No ID provided — resolving latest order..."
  LATEST=$(curl -s "${API}/orders?limit=1&offset=0" \
    -H "Authorization: Bearer ${TOKEN}")
  ORDER_ID=$(echo "$LATEST" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', [])
print(items[0]['id'] if items else '')
" 2>/dev/null)
  if [ -z "$ORDER_ID" ]; then
    echo -e "      ${RED}✗  Could not resolve latest order ID${RST}"
    exit 1
  fi
  echo -e "      ${GRN}✔  Latest order ID: ${YEL}${ORDER_ID}${RST}"
fi

echo ""
echo -e "${BLD}GET /orders/${ORDER_ID}  —  Fetch order by ID${RST}"
echo -e "${DIM}─────────────────────────────────────────────${RST}"
echo -e "  Endpoint  : ${CYA}${API}/orders/${ORDER_ID}${RST}"
echo ""

# -- [3/3] Fetch order --------------------------------------------------------
echo -e "${BLD}[3/3]${RST} Fetching order ${YEL}#${ORDER_ID}${RST}..."

HTTP_CODE=$(curl -s -o $TMPFILE -w "%{http_code}" \
  "${API}/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

RESPONSE=$(cat $TMPFILE)

if [ "$HTTP_CODE" = "200" ]; then
  CLIENT=$(echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('client_name', d.get('client_id','?')))" 2>/dev/null)
  PRODUCT=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('product_name', d.get('product_id','?')))" 2>/dev/null)
  QTY=$(echo "$RESPONSE"     | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('quantity','?'))" 2>/dev/null)
  TOTAL=$(echo "$RESPONSE"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total_price','?'))" 2>/dev/null)
  DATE=$(echo "$RESPONSE"    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('created_at','?')[:19].replace('T',' '))" 2>/dev/null)
  echo -e "      ${GRN}✔  Order found  (HTTP ${HTTP_CODE})${RST}"
  echo ""
  echo -e "${DIM}─────────────────────────────────────────────${RST}"
  echo -e "  Order ID    : ${YEL}${ORDER_ID}${RST}"
  echo -e "  Client      : ${YEL}${CLIENT}${RST}"
  echo -e "  Product     : ${YEL}${PRODUCT}${RST}"
  echo -e "  Quantity    : ${YEL}${QTY}${RST}"
  echo -e "  Total price : ${YEL}${TOTAL}${RST}"
  echo -e "  Created at  : ${YEL}${DATE}${RST}"
  echo -e "${DIM}─────────────────────────────────────────────${RST}"
  echo ""
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=4))"
elif [ "$HTTP_CODE" = "404" ]; then
  echo -e "      ${RED}✗  Order #${ORDER_ID} not found  (HTTP 404)${RST}"
  exit 1
else
  echo -e "      ${RED}✗  Request failed  (HTTP ${HTTP_CODE})${RST}"
  echo ""
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=4))" 2>/dev/null || echo "$RESPONSE"
  exit 1
fi
echo ""
"""

# ── lastorders_api-GET.sh ─────────────────────────────────────────────────────
lastorders = r"""#!/bin/bash
# ==============================================================================
# lastorders_api-GET.sh  -  Fetch the most recent orders from the backend API
#
# Usage:
#   ./lastorders_api-GET.sh [LIMIT]     (default: 3)
# ==============================================================================

API="http://backend.tec.bcn:8000"
LIMIT="${1:-3}"
TMPFILE=$(mktemp /tmp/_api_last.XXXXXX)
trap 'rm -f "$TMPFILE"' EXIT

# Validate LIMIT is a positive integer
if ! [[ "$LIMIT" =~ ^[1-9][0-9]*$ ]]; then
  echo "Usage: $0 [LIMIT]"
  echo "  LIMIT must be a positive integer (default: 3)"
  exit 1
fi

GRN='\033[0;32m' RED='\033[0;31m' CYA='\033[0;36m' YEL='\033[1;33m'
BLD='\033[1m' DIM='\033[2m' RST='\033[0m'

echo ""
echo -e "${BLD}GET /orders  —  Last ${LIMIT} orders${RST}"
echo -e "${DIM}─────────────────────────────────────────────${RST}"
echo -e "  Endpoint  : ${CYA}${API}/orders?limit=${LIMIT}&offset=0${RST}"
echo ""

# -- [1/2] Authenticate -------------------------------------------------------
echo -e "${BLD}[1/2]${RST} Authenticating..."
AUTH_RESPONSE=$(curl -sf -X POST "${API}/auth/login" \
  -d "username=admin&password=admin" 2>&1)

if [ $? -ne 0 ] || [ -z "$AUTH_RESPONSE" ]; then
  echo -e "      ${RED}✗  Authentication failed — backend unreachable${RST}"
  exit 1
fi

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo -e "      ${RED}✗  No token received${RST}"
  echo "      Response: $AUTH_RESPONSE"
  exit 1
fi
echo -e "      ${GRN}✔  Token obtained${RST}  ${DIM}(${TOKEN:0:20}...)${RST}"

# -- [2/2] Fetch orders -------------------------------------------------------
echo -e "${BLD}[2/2]${RST} Fetching last ${YEL}${LIMIT}${RST} orders..."

HTTP_CODE=$(curl -s -o $TMPFILE -w "%{http_code}" \
  "${API}/orders?limit=${LIMIT}&offset=0" \
  -H "Authorization: Bearer ${TOKEN}")

RESPONSE=$(cat $TMPFILE)

if [ "$HTTP_CODE" = "200" ]; then
  COUNT=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d.get('items', d) if isinstance(d, dict) else d
print(len(items) if isinstance(items, list) else '?')
" 2>/dev/null)
  TOTAL=$(echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('total', '?')) if isinstance(d, dict) else print('?')
" 2>/dev/null)

  echo -e "      ${GRN}✔  ${COUNT} orders returned  (HTTP ${HTTP_CODE})${RST}"
  [ "$TOTAL" != "?" ] && echo -e "      ${DIM}Total orders in DB: ${TOTAL}${RST}"
  echo ""
  echo -e "${DIM}─────────────────────────────────────────────${RST}"
  echo ""
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=4))"
else
  echo -e "      ${RED}✗  Request failed  (HTTP ${HTTP_CODE})${RST}"
  echo ""
  echo "$RESPONSE" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), ensure_ascii=False, indent=4))" 2>/dev/null || echo "$RESPONSE"
  exit 1
fi
echo ""
"""

for fname, content in [
    ("insert_api-POST.sh",    insert),
    ("get_order_api-GET.sh",  get_order),
    ("lastorders_api-GET.sh", lastorders),
]:
    path = os.path.join(DEST, fname)
    with open(path, "w") as f:
        f.write(content)
    os.chmod(path, 0o755)
    print(f"Written: {path}  ({len(content.splitlines())} lines)")
