#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# zerto_insert-checkpoint.sh — Insert a checkpoint into a Zerto VPG
#
# Usage:
#   ./zerto_insert-checkpoint.sh "<VPG_NAME>" "<CHECKPOINT_TEXT>"
#
# Examples:
#   ./zerto_insert-checkpoint.sh "ResilienceApp Remote" "Pre-deploy v2.3.1"
#   ./zerto_insert-checkpoint.sh "ResilienceApp Local"  "Manual backup 08/04/2026"
#
# The script automatically detects which ZVM hosts the VPG and authenticates to it.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parameters ────────────────────────────────────────────────────────────────
VPG_NAME="${1:-}"
CHECKPOINT_TEXT="${2:-}"

if [ -z "$VPG_NAME" ] || [ -z "$CHECKPOINT_TEXT" ]; then
  echo "Usage: $0 \"<VPG_NAME>\" \"<CHECKPOINT_TEXT>\""
  echo ""
  echo "Examples:"
  echo "  $0 \"ResilienceApp Remote\" \"Pre-deploy v2.3.1\""
  echo "  $0 \"ResilienceApp Local\"  \"Manual backup\""
  exit 1
fi

# ── ZVM configuration ─────────────────────────────────────────────────────────
ZVM1_HOST="${ZVM1_HOST:-10.20.0.152}"
ZVM1_PORT="${ZVM1_PORT:-443}"
ZVM1_CLIENT_ID="${ZVM1_CLIENT_ID:-grafana-client}"
ZVM1_CLIENT_SECRET="${ZVM1_CLIENT_SECRET:-zL1MhzdSebevQMxFZmbFmjqwSCfn1zHe}"
ZVM1_USERNAME="${ZVM1_USERNAME:-admin}"
ZVM1_PASSWORD="${ZVM1_PASSWORD:-Z3rt0d\"t\"162534}"
ZVM1_VPG_NAME="${ZVM1_VPG_NAME:-ResilienceApp Remote}"

ZVM2_HOST="${ZVM2_HOST:-10.20.0.121}"
ZVM2_PORT="${ZVM2_PORT:-443}"
ZVM2_CLIENT_ID="${ZVM2_CLIENT_ID:-grafana-client}"
ZVM2_CLIENT_SECRET="${ZVM2_CLIENT_SECRET:-dGrmOabeoccdgnK4DxXgq6fMSUBNpUQq}"
ZVM2_USERNAME="${ZVM2_USERNAME:-admin}"
ZVM2_PASSWORD="${ZVM2_PASSWORD:-Z3rt0d@t@123456}"
ZVM2_VPG_NAME="${ZVM2_VPG_NAME:-ResilienceApp Local}"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; }

# ── Helper: curl without TLS verification ─────────────────────────────────────
_curl() { curl -sk --max-time 15 "$@"; }

# ── Auth: OAuth2 client_credentials → password grant → session fallback ───────
get_token() {
  local host="$1" port="$2" client_id="$3" client_secret="$4"
  local username="$5" password="$6"
  local token_url="https://${host}:${port}/auth/realms/zerto/protocol/openid-connect/token"
  local token=""

  # Attempt 1: client_credentials
  token=$(_curl -X POST "$token_url" \
    -d "grant_type=client_credentials&client_id=${client_id}&client_secret=${client_secret}" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

  # Attempt 2: password grant
  if [ -z "$token" ]; then
    token=$(_curl -X POST "$token_url" \
      -d "grant_type=password&client_id=${client_id}&client_secret=${client_secret}&username=${username}&password=${password}&scope=openid" \
      | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  fi

  # Attempt 3: session auth (Zerto < 9)
  if [ -z "$token" ]; then
    local creds
    creds=$(printf '%s:%s' "$username" "$password" | base64 | tr -d '\n')
    token=$(_curl -X POST "https://${host}:${port}/v1/session/add" \
      -H "Authorization: Basic ${creds}" \
      -H "Content-Type: application/json" \
      -D - -o /dev/null | grep -i 'x-zerto-session:' | awk '{print $2}' | tr -d '\r')
  fi

  echo "$token"
}

# ── Helper: authenticated GET JSON endpoint ───────────────────────────────────
api_get() {
  local host="$1" port="$2" token="$3" path="$4"
  _curl -H "Authorization: Bearer ${token}" \
        -H "Accept: application/json" \
        "https://${host}:${port}${path}"
}

# ── Helper: authenticated POST JSON endpoint ──────────────────────────────────
api_post() {
  local host="$1" port="$2" token="$3" path="$4" body="$5"
  _curl -X POST \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "$body" \
        "https://${host}:${port}${path}"
}

# ── Detect which ZVM hosts the VPG and retrieve its identifier ────────────────
find_vpg() {
  local target_vpg="$1"
  # Try each ZVM until the VPG is found
  local hosts=("$ZVM1_HOST" "$ZVM2_HOST")
  local ports=("$ZVM1_PORT" "$ZVM2_PORT")
  local client_ids=("$ZVM1_CLIENT_ID" "$ZVM2_CLIENT_ID")
  local client_secrets=("$ZVM1_CLIENT_SECRET" "$ZVM2_CLIENT_SECRET")
  local usernames=("$ZVM1_USERNAME" "$ZVM2_USERNAME")
  local passwords=("$ZVM1_PASSWORD" "$ZVM2_PASSWORD")
  local zvm_labels=("ZVM TEC" "ZVM Recovery")

  for i in 0 1; do
    local host="${hosts[$i]}" port="${ports[$i]}"
    local cid="${client_ids[$i]}" csecret="${client_secrets[$i]}"
    local user="${usernames[$i]}" pass="${passwords[$i]}"
    local label="${zvm_labels[$i]}"

    info "Trying ${label} (${host}:${port})..." >&2

    local token
    token=$(get_token "$host" "$port" "$cid" "$csecret" "$user" "$pass")
    if [ -z "$token" ]; then
      error "Could not authenticate to ${label}" >&2
      continue
    fi

    # Search for the VPG by name (JSON is compact; split objects with sed)
    local vpgs_json
    vpgs_json=$(api_get "$host" "$port" "$token" "/v1/vpgs")

    # Extract the identifier of the VPG matching the given name
    local vpg_id
    vpg_id=$(echo "$vpgs_json" \
      | sed 's/},{/}\n{/g' \
      | grep "\"VpgName\":\"${target_vpg}\"" \
      | grep -o '"VpgIdentifier":"[^"]*"' | cut -d'"' -f4 | head -1)

    if [ -n "$vpg_id" ]; then
      # Return "host|port|token|vpg_id|label" as a pipe-delimited string
      echo "${host}|${port}|${token}|${vpg_id}|${label}"
      return 0
    fi
  done

  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Zerto — Insert checkpoint${NC}"
echo -e "  VPG:        ${CYAN}${VPG_NAME}${NC}"
echo -e "  Checkpoint: ${CYAN}${CHECKPOINT_TEXT}${NC}"
echo ""

# Find the VPG
info "Searching for VPG across configured ZVMs..."
result=$(find_vpg "$VPG_NAME") || {
  error "VPG \"${VPG_NAME}\" not found on any ZVM."
  exit 1
}

# Unpack result
IFS='|' read -r ZVM_HOST ZVM_PORT TOKEN VPG_ID ZVM_LABEL <<< "$result"
success "VPG found on ${ZVM_LABEL} — ID: ${VPG_ID}"

# Insert the checkpoint
info "Inserting checkpoint..."
CP_BODY="{\"CheckpointName\":\"${CHECKPOINT_TEXT}\"}"
response=$(api_post "$ZVM_HOST" "$ZVM_PORT" "$TOKEN" \
  "/v1/vpgs/${VPG_ID}/checkpoints" "$CP_BODY")

# Check response (Zerto returns the task ID or an empty object on success)
if echo "$response" | grep -qi '"error\|"message\|"detail'; then
  error "API error: ${response}"
  exit 1
fi

echo ""
success "Checkpoint inserted successfully!"
echo -e "  ZVM:        ${ZVM_LABEL} (${ZVM_HOST})"
echo -e "  VPG:        ${VPG_NAME}"
echo -e "  VPG ID:     ${VPG_ID}"
echo -e "  Checkpoint: ${CHECKPOINT_TEXT}"
[ -n "$response" ] && echo -e "  Response:   ${response}"
echo ""
