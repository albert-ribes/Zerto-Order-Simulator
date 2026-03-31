#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-obsdemo.sh — Configura el servidor obsdemo.tec.bcn (10.20.0.149)
# per executar el servei d'observabilitat de Zerto Order Simulator.
#
# Requisits previs:
#   - Ubuntu 22.04+ / Debian 12+
#   - Usuari adminhpe amb sudo
#   - Accés SSH al servidor
#   - El fitxer .env de db-probe creat abans de córrer el script
#     (veure instruccions al final del script)
#
# Ús (des de la màquina de gestió):
#   ssh adminhpe@obsdemo.tec.bcn "bash -s" < deploy/setup-obsdemo.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_URL="https://github.com/albert-ribes/Zerto-Order-Simulator.git"
REPO_DIR="/opt/zerto"
VENV="$REPO_DIR/.venv"
WWW_DIR="/var/www/html"
NGINX_CONF="/etc/nginx/sites-available/observability"
SERVICE_DIR="/etc/systemd/system"

echo "════════════════════════════════════════"
echo " Zerto Observability — Setup obsdemo"
echo "════════════════════════════════════════"

# ── 1. Paquets del sistema ─────────────────────────────────────────────────
echo "→ Instal·lant paquets..."
sudo apt-get update -q
sudo apt-get install -y -q git nginx python3 python3-venv python3-pip

# ── 2. Clonar el repositori ────────────────────────────────────────────────
echo "→ Clonant repositori..."
if [ -d "$REPO_DIR/.git" ]; then
  sudo git -C "$REPO_DIR" pull origin main -q
else
  sudo git clone "$REPO_URL" "$REPO_DIR" -q
fi
sudo git -C "$REPO_DIR" config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

# ── 3. Entorn Python per a db-probe ──────────────────────────────────────
echo "→ Configurant entorn Python (db-probe)..."
sudo python3 -m venv "$VENV"
sudo "$VENV/bin/pip" install -q --upgrade pip
sudo "$VENV/bin/pip" install -q -r "$REPO_DIR/observability/db-probe/requirements.txt"

# ── 4. Fitxer .env de db-probe ────────────────────────────────────────────
ENV_FILE="$REPO_DIR/observability/db-probe/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "→ Creant fitxer .env per a db-probe (edita'l amb les credencials correctes)..."
  sudo bash -c "cat > $ENV_FILE" <<'EOF'
# Cadena de connexió a PostgreSQL de producció
# Edita amb les credencials correctes abans d'arrancar el servei
DATABASE_URL=postgresql://zerto:zerto@postgresql.tec.bcn:5432/zerto
EOF
  echo "  ⚠️  Edita $ENV_FILE amb les credencials reals de la BD"
else
  echo "  (fitxer .env ja existeix, no s'ha sobreescrit)"
fi

# ── 5. Servei systemd per a db-probe ─────────────────────────────────────
echo "→ Instal·lant servei zerto-dbprobe..."
sudo cp "$REPO_DIR/deploy/zerto-dbprobe.service" "$SERVICE_DIR/zerto-dbprobe.service"
sudo systemctl daemon-reload
sudo systemctl enable zerto-dbprobe
sudo systemctl restart zerto-dbprobe
sleep 2
sudo systemctl is-active zerto-dbprobe

# ── 6. Fitxers estàtics a /var/www/html ──────────────────────────────────
echo "→ Copiant fitxers estàtics..."
sudo mkdir -p "$WWW_DIR/js" "$WWW_DIR/css"

# Shared assets from frontend
sudo cp -r "$REPO_DIR/frontend/css/"           "$WWW_DIR/"
sudo cp    "$REPO_DIR/frontend/js/i18n.js"     "$WWW_DIR/js/"
sudo cp    "$REPO_DIR/frontend/js/api.js"      "$WWW_DIR/js/"
sudo cp    "$REPO_DIR/frontend/js/charts.js"   "$WWW_DIR/js/"

# Observability-specific files
sudo cp    "$REPO_DIR/observability/index.html" "$WWW_DIR/"
sudo cp    "$REPO_DIR/observability/js/app.js"  "$WWW_DIR/js/"

sudo chown -R www-data:www-data "$WWW_DIR"

# ── 7. Configuració nginx ─────────────────────────────────────────────────
echo "→ Configurant nginx..."
sudo cp "$REPO_DIR/deploy/nginx.observability.conf" "$NGINX_CONF"

# Habilitar el site i desactivar el default
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/observability
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

# ── 8. Verificació ────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo " Verificació"
echo "════════════════════════════════════════"
echo "nginx:       $(sudo systemctl is-active nginx)"
echo "db-probe:    $(sudo systemctl is-active zerto-dbprobe)"
echo ""
echo "Prova ràpida:"
echo "  curl -s http://localhost/               # Ha de retornar HTML"
echo "  curl -s http://localhost/check/db/db/ping  # Ha de retornar JSON ok"
echo ""
echo "✅ Setup completat a obsdemo.tec.bcn (10.20.0.149)"
echo ""
echo "⚠️  Recorda verificar/editar:"
echo "   $ENV_FILE  (credencials BD)"
echo "   $NGINX_CONF  (IPs de backend i frontend si han canviat)"
