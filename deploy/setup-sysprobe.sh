#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-sysprobe.sh — Instal·la el servei sys-probe (mètriques SO) en un servidor
# S'executa als servidors: frontend.tec.bcn i postgresql.tec.bcn
#
# Ús (des de la màquina de gestió):
#   ssh adminhpe@frontend.tec.bcn     "bash -s" < deploy/setup-sysprobe.sh
#   ssh adminhpe@postgresql.tec.bcn   "bash -s" < deploy/setup-sysprobe.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="https://github.com/albert-ribes/Zerto-Order-Simulator.git"
REPO_DIR="/opt/zerto"
VENV="$REPO_DIR/.venv"
SERVICE_DIR="/etc/systemd/system"

echo "════════════════════════════════════════"
echo " Zerto Sys-Probe — Setup"
echo "════════════════════════════════════════"

# ── 1. Paquets ────────────────────────────────────────────────────────────────
echo "→ Instal·lant paquets..."
sudo apt-get update -q
sudo apt-get install -y -q git python3 python3-venv python3-pip

# ── 2. Repositori ─────────────────────────────────────────────────────────────
echo "→ Clonant/actualitzant repositori..."
if [ -d "$REPO_DIR/.git" ]; then
  sudo git -C "$REPO_DIR" pull origin main -q
else
  sudo git clone "$REPO_URL" "$REPO_DIR" -q
fi
sudo git -C "$REPO_DIR" config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

# ── 3. Entorn Python ──────────────────────────────────────────────────────────
echo "→ Configurant entorn Python..."
sudo python3 -m venv "$VENV"
sudo "$VENV/bin/pip" install -q --upgrade pip
sudo "$VENV/bin/pip" install -q -r "$REPO_DIR/observability/sys-probe/requirements.txt"

# ── 4. Servei systemd ─────────────────────────────────────────────────────────
echo "→ Instal·lant servei zerto-sysprobe..."
sudo cp "$REPO_DIR/deploy/zerto-sysprobe.service" "$SERVICE_DIR/zerto-sysprobe.service"
sudo systemctl daemon-reload
sudo systemctl enable zerto-sysprobe
sudo systemctl restart zerto-sysprobe
sleep 2
sudo systemctl is-active zerto-sysprobe

# ── 5. Verificació ────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Verificació"
echo "════════════════════════════════════════"
echo "sys-probe: $(sudo systemctl is-active zerto-sysprobe)"
curl -s http://localhost:5001/sys/metrics | python3 -m json.tool 2>/dev/null || echo "(curl no disponible o error)"
echo ""
echo "✅ Sys-probe instal·lat correctament"
echo "   Escoltant a: http://$(hostname):5001/sys/metrics"
