#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-sysprobe-user.sh — Instal·la sys-probe com a servei d'usuari (sense sudo)
# Requereix: python3, python3-venv, git (ja instal·lats al sistema)
#
# Ús (des de la màquina de gestió):
#   ssh -i ~/.ssh/zerto_deploy adminhpe@frontend.tec.bcn   "bash -s" < deploy/setup-sysprobe-user.sh
#   ssh -i ~/.ssh/zerto_deploy adminhpe@postgresql.tec.bcn "bash -s" < deploy/setup-sysprobe-user.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="https://github.com/albert-ribes/Zerto-Order-Simulator.git"
REPO_DIR="$HOME/zerto"
VENV="$REPO_DIR/.venv"
PROBE="$REPO_DIR/observability/sys-probe/main.py"
LOG="$HOME/sys-probe.log"

echo "════════════════════════════════════════"
echo " Zerto Sys-Probe — User Install"
echo "════════════════════════════════════════"

# ── 1. Repositori ────────────────────────────────────────────────────────────
echo "→ Clonant/actualitzant repositori..."
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull origin main -q
else
  git clone "$REPO_URL" "$REPO_DIR" -q
fi

# ── 2. Entorn Python ─────────────────────────────────────────────────────────
echo "→ Configurant entorn Python..."
python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q psutil

# ── 3. Atura instància anterior ──────────────────────────────────────────────
echo "→ Aturant instància anterior (si n'hi ha)..."
pkill -f "sys-probe/main.py" 2>/dev/null || true
sleep 1

# ── 4. Inicia el servei ──────────────────────────────────────────────────────
echo "→ Iniciant sys-probe..."
nohup "$VENV/bin/python" "$PROBE" >> "$LOG" 2>&1 &
SYSPROBE_PID=$!
echo "   PID: $SYSPROBE_PID"

# ── 5. Persistència via crontab ──────────────────────────────────────────────
echo "→ Configurant crontab per a reinici automàtic..."
(crontab -l 2>/dev/null | grep -v "sys-probe/main.py" || true
 echo "@reboot $VENV/bin/python $PROBE >> $LOG 2>&1") | crontab -

# ── 6. Verificació ───────────────────────────────────────────────────────────
sleep 2
echo ""
echo "════════════════════════════════════════"
echo " Verificació"
echo "════════════════════════════════════════"
if kill -0 "$SYSPROBE_PID" 2>/dev/null; then
  echo "sys-probe: running (PID $SYSPROBE_PID)"
else
  echo "WARN: PID $SYSPROBE_PID no trobat, comprovant port..."
fi
curl -s http://localhost:5001/sys/metrics | python3 -m json.tool 2>/dev/null || echo "(curl no disponible o error)"
echo ""
echo "✅ Sys-probe instal·lat correctament"
echo "   Escoltant a: http://$(hostname):5001/sys/metrics"
echo "   Log: $LOG"
