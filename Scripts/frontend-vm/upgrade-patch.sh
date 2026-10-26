#!/bin/bash
# upgrade-patch.sh — Apply OpenLDAP security patch, restart nginx and the
#                    corresponding frontend Docker container.

NGINX_WAIT=20
OLD_VER="$(dpkg -l libldap2 | awk '/^ii/{print $3}')"
NEW_VER="2.6.10+dfsg-0ubuntu0.24.04.1"

# -- Demo selection -----------------------------------------------------------
DEMO="${1:-}"
if [[ -z "$DEMO" ]]; then
    echo ""
    echo "  Select target demo:"
    echo "    1) processed-meat"
    echo "    2) hospital"
    echo "    3) flight-booking"
    echo ""
    read -rp "  Choice [1-3]: " _CHOICE
    case "$_CHOICE" in
        1) DEMO="processed-meat" ;;
        2) DEMO="hospital" ;;
        3) DEMO="flight-booking" ;;
        *) echo "ERROR: invalid choice '$_CHOICE'"; exit 1 ;;
    esac
fi

case "$DEMO" in
    processed-meat)  CONTAINER="processed-meat-frontend" ;;
    hospital)        CONTAINER="hospital-frontend" ;;
    flight-booking)  CONTAINER="flight-booking-frontend" ;;
    *)
        echo "ERROR: unknown demo '$DEMO'. Use: processed-meat | hospital | flight-booking"
        exit 1 ;;
esac

echo ""
echo "=== OpenLDAP Security Patch — demo: $DEMO ==="
echo "  Current version : $OLD_VER"
echo "  New version     : $NEW_VER"
echo ""

# -- [1/4] Install patch ------------------------------------------------------
echo "[1/4] Installing patch..."
apt-get install -y libldap2 libldap-common 2>&1 | grep -E 'upgraded|already|Err|error' || true

# -- [2/4] Maintenance window (nginx down) ------------------------------------
echo "[2/4] Stopping nginx (${NGINX_WAIT}s maintenance window)..."
systemctl stop nginx
for i in $(seq $NGINX_WAIT -1 1); do
    printf "\r  Restarting in %2ds..." "$i"
    sleep 1
done
printf "\r                              \r"

# -- [3/4] Restart frontend container -----------------------------------------
echo "[3/4] Restarting frontend container: $CONTAINER ..."
docker restart "$CONTAINER"

# -- [4/4] Bring nginx back up ------------------------------------------------
echo "[4/4] Starting nginx..."
systemctl start nginx

echo ""
echo "Done."
echo "  libldap2 : $(dpkg -l libldap2 | awk '/^ii/{print $3}')"
echo "  Container: $(docker inspect --format '{{.State.Status}}' "$CONTAINER")"
