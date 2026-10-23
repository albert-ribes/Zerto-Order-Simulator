#!/bin/bash
# rollback-human-error.sh — Remove syntax error from backend code and restart

APP_FILE="/opt/zerto/backend/main.py"

echo ""
echo "=== Rolling back human error ==="

if ! grep -q "this is not valid python syntax" "$APP_FILE"; then
  echo "ERROR: No syntax error found in $APP_FILE. Nothing to rollback."
  exit 1
fi

echo "[1/2] Removing syntax error from $APP_FILE..."
sed -i '/this is not valid python syntax!!!/d' "$APP_FILE"

echo "[2/2] Restarting backend service..."
systemctl restart zerto-backend

echo ""
echo "Done. Backend restored."
