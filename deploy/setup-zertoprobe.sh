#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-zertoprobe.sh — Desplega zerto-probe a obsdemo.tec.bcn
#
# Ús (des de la màquina de gestió):
#   ssh -i ~/.ssh/zerto_deploy adminhpe@obsdemo.tec.bcn "bash -s" < deploy/setup-zertoprobe.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="/opt/zerto"
PROBE_DIR="$REPO_DIR/observability/zerto-probe"
VENV="$PROBE_DIR/.venv"
SERVICE_NAME="zerto-zertoprobe"

echo "════════════════════════════════════════"
echo " Zerto Probe — Setup"
echo "════════════════════════════════════════"

# ── 1. Actualitza repositori ─────────────────────────────────────────────────
echo "→ Actualitzant repositori..."
sudo git -C "$REPO_DIR" pull origin main -q

# ── 2. Entorn Python ─────────────────────────────────────────────────────────
echo "→ Configurant entorn Python..."
sudo python3 -m venv "$VENV"
sudo "$VENV/bin/pip" install -q --upgrade pip

# ── 3. Servei systemd ────────────────────────────────────────────────────────
echo "→ Instal·lant servei systemd..."
sudo cp "$REPO_DIR/deploy/zerto-zertoprobe.service" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo chown -R www-data:www-data "$PROBE_DIR"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

# ── 4. Verifica ──────────────────────────────────────────────────────────────
sleep 3
echo ""
echo "════════════════════════════════════════"
echo " Verificació"
echo "════════════════════════════════════════"
sudo systemctl status "$SERVICE_NAME" --no-pager -l | head -12
echo ""
curl -s http://localhost:5002/zerto/ping | python3 -m json.tool 2>/dev/null || echo "(zerto/ping no respon)"
echo ""
echo "✅ zerto-probe instal·lat correctament (port 5002)"
