#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Actualitza frontend, backend i observability des del repositori GitHub
# Executa'l des del servidor de gestió (no des de les VMs)
#
# Ús:
#   ./deploy.sh                → actualitza tot
#   ./deploy.sh backend        → només el backend
#   ./deploy.sh frontend       → només el frontend
#   ./deploy.sh observability  → només l'observability
# ─────────────────────────────────────────────────────────────────────────────

set -e

FRONTEND_HOST="frontend"
BACKEND_HOST="backend"
OBSERVABILITY_HOST="observability"
REPO_DIR="/opt/zerto"
VENV="$REPO_DIR/.venv"

TARGET="${1:-all}"

deploy_backend() {
  echo "→ Actualitzant backend..."
  ssh "$BACKEND_HOST" "
    sudo git -C $REPO_DIR config --global --add safe.directory $REPO_DIR 2>/dev/null || true
    cd $REPO_DIR && sudo git pull origin main -q
    $VENV/bin/pip install -q -r backend/requirements.txt
    sudo systemctl restart zerto-backend
    sleep 2
    sudo systemctl is-active zerto-backend
  "
  echo "✓ Backend actualitzat"
}

deploy_frontend() {
  echo "→ Actualitzant frontend..."
  ssh "$FRONTEND_HOST" "
    sudo git config --global --add safe.directory $REPO_DIR 2>/dev/null || true
    cd $REPO_DIR && sudo git pull origin main -q
    sudo cp -r $REPO_DIR/frontend/* /var/www/html/
    sudo chown -R www-data:www-data /var/www/html/
    sudo nginx -t && sudo systemctl reload nginx
  "
  echo "✓ Frontend actualitzat"
}

deploy_observability() {
  echo "→ Actualitzant observability..."
  ssh "$OBSERVABILITY_HOST" "
    sudo git config --global --add safe.directory $REPO_DIR 2>/dev/null || true
    cd $REPO_DIR && sudo git pull origin main -q
    # Shared assets from frontend
    sudo cp -r $REPO_DIR/frontend/css /var/www/html/
    sudo cp $REPO_DIR/frontend/js/i18n.js /var/www/html/js/
    sudo cp $REPO_DIR/frontend/js/api.js   /var/www/html/js/
    sudo cp $REPO_DIR/frontend/js/charts.js /var/www/html/js/
    # Observability-specific files
    sudo cp $REPO_DIR/observability/index.html /var/www/html/
    sudo cp $REPO_DIR/observability/js/app.js  /var/www/html/js/
    sudo chown -R www-data:www-data /var/www/html/
    sudo nginx -t && sudo systemctl reload nginx
  "
  echo "✓ Observability actualitzat"
}

case "$TARGET" in
  backend)       deploy_backend ;;
  frontend)      deploy_frontend ;;
  observability) deploy_observability ;;
  all)           deploy_backend; deploy_frontend; deploy_observability ;;
  *)             echo "Ús: $0 [backend|frontend|observability|all]"; exit 1 ;;
esac

echo ""
echo "✅ Desplegament completat"
