#!/bin/bash
# upgrade-patch.sh — Apply OpenLDAP security patch and restart nginx

NGINX_WAIT=20
OLD_VER="$(dpkg -l libldap2 | awk '/^ii/{print $3}')"
NEW_VER="2.6.10+dfsg-0ubuntu0.24.04.1"

echo ""
echo "=== OpenLDAP Security Patch ==="
echo "  Current version : $OLD_VER"
echo "  New version     : $NEW_VER"
echo ""

if [ "$OLD_VER" = "$NEW_VER" ]; then
    echo "Already up to date. Nothing to do."
    echo ""
    exit 0
fi

echo "[1/3] Installing patch..."
apt-get install -y libldap2 libldap-common 2>&1 | grep -E 'upgraded|already|Err|error' || true

echo "[2/3] Stopping nginx (${NGINX_WAIT}s maintenance window)..."
systemctl stop nginx
for i in $(seq $NGINX_WAIT -1 1); do
    printf "\r  Restarting nginx in %2ds..." "$i"
    sleep 1
done
printf "\r                              \r"

echo "[3/3] Starting nginx..."
systemctl start nginx

echo ""
echo "Done. Installed version: $(dpkg -l libldap2 | awk '/^ii/{print $3}')"
