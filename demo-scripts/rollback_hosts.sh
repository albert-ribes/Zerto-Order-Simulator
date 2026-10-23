#!/bin/bash
# rollback_hosts.sh — Revert IP, DNS and /etc/hosts after Zerto test failover

MARKER="# zerto-recovery"
NETPLAN_FILE="/etc/netplan/reip-config-zerto.yaml"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()      { echo -e "  ${GREEN}✓${NC}  $1"; }
fail()    { echo -e "  ${RED}✗${NC}  $1"; }
section() { echo -e "\n${YELLOW}── $1${NC}"; }

HOST=$(hostname -s)
case "$HOST" in
    frontend)   SERVICE="nginx" ;;
    backend)    SERVICE="zerto-backend" ;;
    postgresql) SERVICE="postgresql" ;;
    *)          SERVICE="" ;;
esac

echo ""
echo "=== Zerto Test Failover Rollback — $(hostname) ==="

# ── 1. Restore netplan ────────────────────────────────────────────────────────
section "Restoring netplan"

if [ -f "${NETPLAN_FILE}.bak" ]; then
    cp "${NETPLAN_FILE}.bak" "$NETPLAN_FILE"
    rm "${NETPLAN_FILE}.bak"
    ok "netplan restored from backup"
else
    fail "No netplan backup found (${NETPLAN_FILE}.bak)"
fi

# ── 2. Restore DNS config ─────────────────────────────────────────────────────
section "Restoring DNS configuration"

if [ -f "/etc/systemd/resolved.conf.bak" ]; then
    cp /etc/systemd/resolved.conf.bak /etc/systemd/resolved.conf
    rm /etc/systemd/resolved.conf.bak
    systemctl restart systemd-resolved
    ok "systemd-resolved restored"
else
    ok "No DNS backup found — skipping"
fi

# ── 3. Remove /etc/hosts entries ──────────────────────────────────────────────
section "Removing recovery IPs from /etc/hosts"

if grep -q "$MARKER" /etc/hosts; then
    sed -i "/$MARKER/d" /etc/hosts
    sed -i '/^$/N;/^\n$/d' /etc/hosts
    ok "/etc/hosts reverted"
else
    ok "/etc/hosts — no recovery entries found, nothing to remove"
fi

# ── 4. Restart service ────────────────────────────────────────────────────────
section "Restarting service: ${SERVICE}"

[ -n "$SERVICE" ] && systemctl restart "$SERVICE" \
    && ok "${SERVICE} restarted" \
    || fail "Failed to restart ${SERVICE}"

# ── 5. Apply netplan ──────────────────────────────────────────────────────────
section "Applying netplan"

ORIG_IP=$(grep -o '10\.[0-9]*\.[0-9]*\.[0-9]*/24' "$NETPLAN_FILE" | head -1)
netplan apply \
    && ok "netplan applied — IP restored: ${ORIG_IP}" \
    || fail "netplan apply failed"

echo ""
echo "────────────────────────────────────────"
echo "Done. $(hostname) reverted to production configuration."
