#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# get-order.sh — Retrieve order information via API GET /orders/{id}
#
# Usage:
#   ./get-order.sh <ORDER_ID> [BASE_URL]
#
# Examples:
#   ./get-order.sh 22347
#   ./get-order.sh 22347 http://obsdemo.tec.bcn
#   ./get-order.sh 22347 http://localhost:8080
#
# Returns exit 0 if the order is found, exit 1 otherwise.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parameters ────────────────────────────────────────────────────────────────
ORDER_ID="${1:-}"
BASE_URL="${2:-http://frontend}"

if [ -z "$ORDER_ID" ]; then
  echo "Usage: $0 <ORDER_ID> [BASE_URL]"
  echo ""
  echo "Examples:"
  echo "  $0 22347"
  echo "  $0 22347 http://obsdemo.tec.bcn"
  exit 1
fi

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; }
label()   { printf "  %-18s %s\n" "$1" "$2"; }

# ── Authenticate ──────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Order lookup — ID: ${CYAN}${ORDER_ID}${NC}"
echo -e "  API: ${BASE_URL}"
echo ""

info "Authenticating..."
TOKEN=$(curl -s --max-time 10 -X POST "${BASE_URL}/api/auth/login" \
  -d "username=admin&password=admin" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  error "Authentication failed — could not obtain token."
  exit 1
fi
success "Token obtained."

# ── Fetch order ───────────────────────────────────────────────────────────────
info "Fetching order ${ORDER_ID}..."
HTTP_CODE=$(curl -s --max-time 10 -o /tmp/get_order_body.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/api/orders/${ORDER_ID}")
BODY=$(cat /tmp/get_order_body.json)

if [ "$HTTP_CODE" = "404" ]; then
  echo ""
  error "Order ${ORDER_ID} not found (404)."
  exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo ""
  error "Unexpected response: HTTP ${HTTP_CODE}"
  [ -n "$BODY" ] && error "  ${BODY}"
  exit 1
fi

# ── Parse fields ──────────────────────────────────────────────────────────────
field() { echo "$BODY" | grep -o "\"$1\":[^,}]*" | head -1 | cut -d: -f2- | tr -d ' "'; }

ID=$(field "id")
CLIENT_NAME=$(echo "$BODY" | grep -o '"client_name":"[^"]*"' | cut -d'"' -f4)
PRODUCT_NAME=$(echo "$BODY" | grep -o '"product_name":"[^"]*"' | cut -d'"' -f4)
QUANTITY=$(field "quantity")
UNIT_PRICE=$(field "unit_price")
TOTAL_PRICE=$(field "total_price")
CREATED_AT=$(field "created_at")

# ── Display ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓  Order found${NC}"
echo "  ─────────────────────────────────"
label "Order ID:"     "${ID}"
label "Client:"       "${CLIENT_NAME}"
label "Product:"      "${PRODUCT_NAME}"
label "Quantity:"     "${QUANTITY}"
label "Unit price:"   "${UNIT_PRICE}"
label "Total price:"  "${TOTAL_PRICE}"
label "Created at:"   "${CREATED_AT}"
echo ""
