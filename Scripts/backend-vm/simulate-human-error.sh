#!/bin/bash
# simulate-human-error.sh — Inject a Python syntax error into a backend container

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
echo "=== Simulating human error — demo: $DEMO ==="

# Guard: already injected?
if docker exec "$CONTAINER" grep -qF "$ERROR_LINE" "$APP_FILE" 2>/dev/null; then
    echo "ERROR: syntax error already present. Run rollback-human-error.sh first."
    exit 1
fi

echo "[1/2] Injecting syntax error into $CONTAINER:$APP_FILE ..."
docker exec "$CONTAINER" bash -c "echo '$ERROR_LINE' >> $APP_FILE"

echo "[2/2] Restarting container..."
docker restart "$CONTAINER"

echo ""
echo "Done. Backend '$DEMO' is now broken."
echo "Recovery: sudo ./rollback-human-error.sh $DEMO"
