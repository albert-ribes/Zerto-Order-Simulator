#!/bin/bash
# rollback-human-error.sh — Remove injected syntax error and restart backend container

ERROR_LINE="this is not valid python syntax!!!"

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
    processed-meat)
        CONTAINER="processed-meat-backend"
        APP_FILE="/app/main.py"
        ;;
    hospital)
        CONTAINER="hospital-backend"
        APP_FILE="/app/app/main.py"
        ;;
    flight-booking)
        CONTAINER="flight-booking-backend"
        APP_FILE="/app/app/main.py"
        ;;
    *)
        echo "ERROR: unknown demo '$DEMO'. Use: processed-meat | hospital | flight-booking"
        exit 1 ;;
esac

echo ""
echo "=== Rolling back human error — demo: $DEMO ==="

TMP_FILE="/tmp/main_rollback_$$.py"

# [1/4] Stop container (it may be in a crash loop)
echo "[1/4] Stopping container $CONTAINER ..."
docker stop "$CONTAINER" 2>/dev/null || true

# [2/4] Copy file out, remove error line, copy back
echo "[2/4] Removing syntax error from $APP_FILE ..."
docker cp "$CONTAINER:$APP_FILE" "$TMP_FILE"

if ! grep -qF "$ERROR_LINE" "$TMP_FILE"; then
    echo "WARNING: syntax error not found. File may already be clean."
fi

grep -vF "$ERROR_LINE" "$TMP_FILE" > "${TMP_FILE}.clean"
docker cp "${TMP_FILE}.clean" "$CONTAINER:$APP_FILE"
rm -f "$TMP_FILE" "${TMP_FILE}.clean"

# [3/4] Start container
echo "[3/4] Starting container..."
docker start "$CONTAINER"

# [4/4] Verify
echo "[4/4] Waiting 4s for startup..."
sleep 4
STATUS="$(docker inspect --format '{{.State.Status}}' "$CONTAINER" 2>/dev/null)"
if [[ "$STATUS" == "running" ]]; then
    echo ""
    echo "OK. Backend '$DEMO' is running."
else
    echo ""
    echo "WARNING: container status is '$STATUS'. Check with: docker logs $CONTAINER"
fi
