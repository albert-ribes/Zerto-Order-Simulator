#!/bin/bash
# rollback-patch.sh — Rollback OpenLDAP to previous version and restart nginx

SCRIPT_DIR="$(dirname "$0")"
PATCHES_DIR="${SCRIPT_DIR}/patches"
OLD_VER="2.6.7+dfsg-1~exp1ubuntu8.1"

echo ""
echo "=== OpenLDAP Rollback ==="
echo "  Target version : $OLD_VER"
echo ""

echo "[1/3] Installing previous version from local packages..."
dpkg -i "${PATCHES_DIR}/libldap-common_${OLD_VER}_all.deb"         "${PATCHES_DIR}/libldap2_${OLD_VER}_amd64.deb"

echo "[2/3] Restarting nginx..."
systemctl restart nginx

echo ""
echo "Done. Installed version: $(dpkg -l libldap2 | awk '/^ii/{print $3}')"
