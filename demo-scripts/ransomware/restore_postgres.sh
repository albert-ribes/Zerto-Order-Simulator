#!/bin/bash
# ==============================================================================
# restore_postgres.sh  -  PostgreSQL recovery after Luigi encryption attack
# Must run as root:  sudo ./restore_postgres.sh [processed-meat|hospital|flight-booking]
# Requires: encrypt_postgres_luigi.sh to have been run first (backup must exist)
# ==============================================================================

[[ $EUID -ne 0 ]] && echo "ERROR: run as root  ->  sudo $0" && exit 1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m' YEL='\033[1;33m' GRN='\033[0;32m'
CYA='\033[0;36m' BLD='\033[1m'   RST='\033[0m'

# -- Demo selection -----------------------------------------------------------
DEMO="${1:-}"
if [[ -z "$DEMO" ]]; then
    echo ""
    echo -e "${GRN}${BLD}  Select demo to restore:${RST}"
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
PGDATA_BACKUP="$BACKUP_DIR/$(basename "$PGDATA")"

# -- Banner -------------------------------------------------------------------
clear
echo -e "${GRN}${BLD}"
echo "  +--------------------------------------------------+"
echo "  |                                                  |"
echo "  |        PostgreSQL Recovery                       |"
printf "  |        Demo   : %-33s|\n" "$DEMO"
echo "  |                                                  |"
echo "  +--------------------------------------------------+"
echo -e "${RST}"
sleep 1

# -- Check backup exists -------------------------------------------------------
if [[ ! -d "$PGDATA_BACKUP" ]]; then
    echo -e "${RED}ERROR: Backup not found at: $PGDATA_BACKUP${RST}"
    echo "       Run encrypt_postgres_luigi.sh first (backup is created automatically)."
    exit 1
fi
echo -e "  ${GRN}Backup found: $PGDATA_BACKUP  ($(du -sh "$PGDATA_BACKUP" | cut -f1))${RST}\n"

# -- [1/3] Stop container -----------------------------------------------------
echo -e "${BLD}[1/3] Stopping container: ${CYA}${CONTAINER}${RST}${BLD}...${RST}"
if docker ps -q --filter "name=^${CONTAINER}$" | grep -q .; then
    docker stop "$CONTAINER"
    echo -e "      ${GRN}Container stopped.${RST}\n"
else
    echo -e "      ${YEL}Container already stopped.${RST}\n"
fi

# -- [2/3] Restore data from backup -------------------------------------------
echo -e "${BLD}[2/3] Restoring data from backup...${RST}"
echo -e "      source : $PGDATA_BACKUP"
echo -e "      target : $PGDATA"
rm -rf "$PGDATA"
cp -r "$PGDATA_BACKUP" "$(dirname "$PGDATA")/"
echo -e "      ${GRN}Done: $(du -sh "$PGDATA" | cut -f1) restored.${RST}\n"

# -- [3/3] Start container and verify -----------------------------------------
echo -e "${BLD}[3/3] Starting container: ${CYA}${CONTAINER}${RST}${BLD}...${RST}"
docker start "$CONTAINER"
sleep 4

if docker exec "$CONTAINER" pg_isready -q 2>/dev/null; then
    echo -e "      ${GRN}PostgreSQL is ready.${RST}\n"
else
    echo -e "      ${YEL}Container started — PostgreSQL may still be initializing.${RST}\n"
fi

# -- Final screen -------------------------------------------------------------
sleep 1
clear
echo -e "${GRN}${BLD}"
echo "  +--------------------------------------------------+"
echo "  |                                                  |"
echo "  |    RECOVERY COMPLETE                             |"
printf "  |    Target     : %-33s|\n" "$DEMO"
echo "  |    PostgreSQL : RESTORED FROM BACKUP             |"
echo "  |    Container  : RUNNING                          |"
echo "  |                                                  |"
echo "  +--------------------------------------------------+"
echo -e "${RST}"
echo -e "${CYA}  Backup : $PGDATA_BACKUP"
echo -e "  Data   : $PGDATA${RST}"
echo ""
