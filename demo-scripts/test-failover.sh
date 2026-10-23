#!/bin/bash
# test-failover.sh — Apply IP change and service restart after Zerto test failover
#
# Run this script locally on each VM via vSphere console after test failover.
# It changes the VM IP to the recovery subnet, updates /etc/hosts,
# disables unreachable DNS servers, and restarts affected services.

# ── Recovery network config ───────────────────────────────────────────────────
NETPLAN_FILE="/etc/netplan/reip-config-zerto.yaml"
SCRIPTS_DIR="/home/adminhpe/scripts"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()      { echo -e "  ${GREEN}✓${NC}  $1"; }
fail()    { echo -e "  ${RED}✗${NC}  $1"; exit 1; }
section() { echo -e "\n${YELLOW}── $1${NC}"; }

# ── Detect VM identity ────────────────────────────────────────────────────────
HOST=$(hostname -s)
case "$HOST" in
    frontend)   NEW_IP="10.21.0.146"; SERVICE="nginx" ;;
    backend)    NEW_IP="10.21.0.147"; SERVICE="zerto-backend" ;;
    postgresql) NEW_IP="10.21.0.148"; SERVICE="postgresql" ;;
    *)          echo "ERROR: Unknown hostname '$HOST'. Expected: frontend, backend or postgresql."; exit 1 ;;
esac

echo ""
echo "=== Zerto Test Failover — $(hostname) ==="
echo "  Current IP : $(hostname -I | awk '{print $1}')"
echo "  New IP     : ${NEW_IP}"

# ── 1. Update netplan ─────────────────────────────────────────────────────────
section "Updating netplan"

[ ! -f "$NETPLAN_FILE" ] && fail "Netplan file not found: $NETPLAN_FILE"

cp "$NETPLAN_FILE" "${NETPLAN_FILE}.bak"
sed -i "s|addresses: \[10\.[0-9]*\.[0-9]*\.[0-9]*/24\]|addresses: [${NEW_IP}/24]|" "$NETPLAN_FILE"
sed -i "/gateway4:/d" "$NETPLAN_FILE"
ok "netplan updated — ${NEW_IP}/24 (no gateway, isolated VLAN)"

# ── 2. Disable unreachable DNS — use /etc/hosts only ─────────────────────────
section "Configuring DNS for isolated network"

cp /etc/systemd/resolved.conf /etc/systemd/resolved.conf.bak
cat >> /etc/systemd/resolved.conf << 'DNSEOF'

# zerto-test-failover: production DNS not reachable from test bubble
[Resolve]
DNS=
FallbackDNS=
DNSEOF

systemctl restart systemd-resolved
ok "systemd-resolved reconfigured — /etc/hosts only"

# ── 3. Update /etc/hosts ──────────────────────────────────────────────────────
section "Updating /etc/hosts"

bash "${SCRIPTS_DIR}/modify_hosts.sh" > /dev/null 2>&1 \
    && ok "/etc/hosts updated with recovery IPs" \
    || fail "Failed to update /etc/hosts"

# ── 4. Restart service ────────────────────────────────────────────────────────
section "Restarting service: ${SERVICE}"

systemctl restart "$SERVICE" \
    && ok "${SERVICE} restarted" \
    || fail "Failed to restart ${SERVICE}"

# ── 5. Apply netplan (IP changes — SSH will drop if connected remotely) ───────
section "Applying netplan"

echo "  Note: SSH connection will drop if connected remotely."
netplan apply \
    && ok "netplan applied — new IP: ${NEW_IP}" \
    || fail "netplan apply failed"

echo ""
echo "────────────────────────────────────────"
echo "Done. $(hostname) is now at ${NEW_IP}"
echo "Run rollback_hosts.sh to revert after the test."
