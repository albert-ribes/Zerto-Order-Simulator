#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# zerto_insert-checkpoint.sh — Insereix un checkpoint a un VPG de Zerto
#
# Ús:
#   ./zerto_insert-checkpoint.sh "<NOM_VPG>" "<TEXT_CHECKPOINT>"
#
# Exemples:
#   ./zerto_insert-checkpoint.sh "ResilienceApp Remote" "Pre-deploy v2.3.1"
#   ./zerto_insert-checkpoint.sh "ResilienceApp Local"  "Backup manual 08/04/2026"
#
# El script detecta automàticament a quin ZVM pertany el VPG i hi fa l'autenticació.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Paràmetres ────────────────────────────────────────────────────────────────
VPG_NAME="${1:-}"
CHECKPOINT_TEXT="${2:-}"

if [ -z "$VPG_NAME" ] || [ -z "$CHECKPOINT_TEXT" ]; then
  echo "Ús: $0 \"<NOM_VPG>\" \"<TEXT_CHECKPOINT>\""
  echo ""
  echo "Exemples:"
  echo "  $0 \"ResilienceApp Remote\" \"Pre-deploy v2.3.1\""
  echo "  $0 \"ResilienceApp Local\"  \"Backup manual\""
  exit 1
fi

# ── Configuració ZVMs ─────────────────────────────────────────────────────────
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

# ── Helper: curl sense verificació TLS ────────────────────────────────────────
_curl() { curl -sk --max-time 15 "$@"; }

# ── Auth: OAuth2 client_credentials → password grant → session fallback ───────
get_token() {
  local host="$1" port="$2" client_id="$3" client_secret="$4"
  local username="$5" password="$6"
  local token_url="https://${host}:${port}/auth/realms/zerto/protocol/openid-connect/token"
  local token=""

  # Intent 1: client_credentials
  token=$(_curl -X POST "$token_url" \
    -d "grant_type=client_credentials&client_id=${client_id}&client_secret=${client_secret}" \
    | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

  # Intent 2: password grant
  if [ -z "$token" ]; then
    token=$(_curl -X POST "$token_url" \
      -d "grant_type=password&client_id=${client_id}&client_secret=${client_secret}&username=${username}&password=${password}&scope=openid" \
      | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  fi

  # Intent 3: session auth (Zerto < 9)
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

# ── Helper: GET JSON endpoint autenticat ──────────────────────────────────────
api_get() {
  local host="$1" port="$2" token="$3" path="$4"
  _curl -H "Authorization: Bearer ${token}" \
        -H "Accept: application/json" \
        "https://${host}:${port}${path}"
}

# ── Helper: POST JSON endpoint autenticat ─────────────────────────────────────
api_post() {
  local host="$1" port="$2" token="$3" path="$4" body="$5"
  _curl -X POST \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "$body" \
        "https://${host}:${port}${path}"
}

# ── Detecta a quin ZVM pertany el VPG i obté el seu identificador ─────────────
find_vpg() {
  local target_vpg="$1"
  # Prova cada ZVM fins trobar el VPG
  local hosts=("$ZVM1_HOST" "$ZVM2_HOST")
  local ports=("$ZVM1_PORT" "$ZVM2_PORT")
  local client_ids=("$ZVM1_CLIENT_ID" "$ZVM2_CLIENT_ID")
  local client_secrets=("$ZVM1_CLIENT_SECRET" "$ZVM2_CLIENT_SECRET")
  local usernames=("$ZVM1_USERNAME" "$ZVM2_USERNAME")
  local passwords=("$ZVM1_PASSWORD" "$ZVM2_PASSWORD")
  local vpg_names=("$ZVM1_VPG_NAME" "$ZVM2_VPG_NAME")
  local zvm_labels=("ZVM TEC" "ZVM Recovery")

  for i in 0 1; do
    local host="${hosts[$i]}" port="${ports[$i]}"
    local cid="${client_ids[$i]}" csecret="${client_secrets[$i]}"
    local user="${usernames[$i]}" pass="${passwords[$i]}"
    local label="${zvm_labels[$i]}"

    info "Provant ${label} (${host}:${port})..." >&2

    local token
    token=$(get_token "$host" "$port" "$cid" "$csecret" "$user" "$pass")
    if [ -z "$token" ]; then
      error "No s'ha pogut autenticar a ${label}" >&2
      continue
    fi

    # Cerca el VPG per nom (el JSON és compacte; separem els objectes amb sed)
    local vpgs_json
    vpgs_json=$(api_get "$host" "$port" "$token" "/v1/vpgs")

    # Extreu l'identificador del VPG que coincideix amb el nom
    local vpg_id
    vpg_id=$(echo "$vpgs_json" \
      | sed 's/},{/}\n{/g' \
      | grep "\"VpgName\":\"${target_vpg}\"" \
      | grep -o '"VpgIdentifier":"[^"]*"' | cut -d'"' -f4 | head -1)

    if [ -n "$vpg_id" ]; then
      # Retorna "host|port|token|vpg_id|label" com a cadena delimitada
      echo "${host}|${port}|${token}|${vpg_id}|${label}"
      return 0
    fi
  done

  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Zerto — Inserció de checkpoint${NC}"
echo -e "  VPG:        ${CYAN}${VPG_NAME}${NC}"
echo -e "  Checkpoint: ${CYAN}${CHECKPOINT_TEXT}${NC}"
echo ""

# Cerca el VPG
info "Cercant el VPG als ZVMs configurats..."
result=$(find_vpg "$VPG_NAME") || {
  error "No s'ha trobat el VPG \"${VPG_NAME}\" a cap ZVM."
  echo ""
  echo "VPGs disponibles:"
  for zvm_info in "${ZVM1_HOST}:${ZVM1_PORT} ${ZVM1_CLIENT_ID} ${ZVM1_CLIENT_SECRET} ${ZVM1_USERNAME} ${ZVM1_PASSWORD}" \
                  "${ZVM2_HOST}:${ZVM2_PORT} ${ZVM2_CLIENT_ID} ${ZVM2_CLIENT_SECRET} ${ZVM2_USERNAME} ${ZVM2_PASSWORD}"; do
    # Intenta llistar VPGs de cada ZVM per ajudar a l'usuari
    :
  done
  exit 1
}

# Desempaqueta resultat
IFS='|' read -r ZVM_HOST ZVM_PORT TOKEN VPG_ID ZVM_LABEL <<< "$result"
success "VPG trobat a ${ZVM_LABEL} — ID: ${VPG_ID}"

# Insereix el checkpoint
info "Inserint checkpoint..."
CP_BODY="{\"CheckpointName\":\"${CHECKPOINT_TEXT}\"}"
response=$(api_post "$ZVM_HOST" "$ZVM_PORT" "$TOKEN" \
  "/v1/vpgs/${VPG_ID}/checkpoints" "$CP_BODY")

# Verifica la resposta (Zerto retorna el task ID o un objecte buit en cas d'èxit)
if echo "$response" | grep -qi '"error\|"message\|"detail'; then
  error "Error de l'API: ${response}"
  exit 1
fi

echo ""
success "Checkpoint inserit correctament!"
echo -e "  ZVM:        ${ZVM_LABEL} (${ZVM_HOST})"
echo -e "  VPG:        ${VPG_NAME}"
echo -e "  ID VPG:     ${VPG_ID}"
echo -e "  Checkpoint: ${CHECKPOINT_TEXT}"
[ -n "$response" ] && echo -e "  Resposta:   ${response}"
echo ""
