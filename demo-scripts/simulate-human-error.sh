#!/bin/bash
# simulate-human-error.sh — Introduce a syntax error in the backend code

APP_FILE="/opt/zerto/backend/main.py"

echo ""
echo "=== Simulating human error ==="

if grep -q "this is not valid python syntax" "$APP_FILE"; then
  echo "ERROR: Syntax error already present. Run rollback-human-error.sh first."
  exit 1
fi

echo "[1/2] Introducing syntax error in $APP_FILE..."
echo "this is not valid python syntax!!!" >> "$APP_FILE"

echo "[2/2] Restarting backend service..."
systemctl restart zerto-backend
systemctl status zerto-backend

echo ""
#echo "Done. Backend is now broken."
#echo "Run rollback-human-error.sh to fix it."
