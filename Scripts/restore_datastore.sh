#!/bin/sh
# ==============================================================================
# restore_datastore.sh  -  Restore VMware DataStore VM after encryption attack
#
# Target  : /vmfs/volumes/DataStore.1/Ubuntu24-albert
# Run as  : root on the ESXi host
# Requires: encrypt_datastore.sh to have been run first (backup must exist)
# ==============================================================================

# ESXi shell is always root — no uid check needed

DATASTORE="/vmfs/volumes/DataStore.1"
VM_NAME="Ubuntu24-albert"
VM_DIR="$DATASTORE/$VM_NAME"
BACKUP_DIR="/vmfs/volumes/DataStore.0/backup_${VM_NAME}"

# -- Colours ------------------------------------------------------------------
RED='\033[0;31m' YEL='\033[1;33m' GRN='\033[0;32m'
CYA='\033[0;36m' BLD='\033[1m'   RST='\033[0m'

# -- Banner -------------------------------------------------------------------
clear
printf "${GRN}${BLD}\n"
printf "  +------------------------------------------------------------------+\n"
printf "  |                                                                  |\n"
printf "  |        VMware DataStore Recovery                                 |\n"
printf "  |        VM : %-51s|\n" "$VM_NAME"
printf "  |                                                                  |\n"
printf "  +------------------------------------------------------------------+\n"
printf "${RST}\n"
sleep 1

# -- Check backup exists ------------------------------------------------------
if [ ! -d "$BACKUP_DIR" ]; then
    printf "${RED}ERROR: Backup not found at: %s${RST}\n" "$BACKUP_DIR"
    printf "       Run encrypt_datastore.sh first to create the backup.\n"
    exit 1
fi
printf "  ${GRN}Backup found: %s  (%s)${RST}\n\n" \
    "$BACKUP_DIR" "$(du -sh "$BACKUP_DIR" | cut -f1)"

# -- [1/4] Unlock disk and swap files -----------------------------------------
printf "${BLD}[1/4] Unlocking VM disk and swap files...${RST}\n"

UNLOCKED=0
for f in "$VM_DIR"/*.vmdk.locked "$VM_DIR"/*.vswp.locked; do
    [ -f "$f" ] || continue
    orig="${f%.locked}"
    mv "$f" "$orig"
    printf "      unlocked: %s\n" "$(basename "$orig")"
    UNLOCKED=$((UNLOCKED + 1))
done
printf "      ${GRN}%d files unlocked.${RST}\n\n" "$UNLOCKED"

# -- [2/4] Restore config files from backup -----------------------------------
printf "${BLD}[2/4] Restoring VM config files from backup...${RST}\n"

# Remove encrypted .locked config files
for f in "$VM_DIR"/*.nvram.locked "$VM_DIR"/*.vmx.locked \
         "$VM_DIR"/*.vmsd.locked  "$VM_DIR"/*.hlog.locked; do
    [ -f "$f" ] || continue
    rm -f "$f"
    printf "      removed (encrypted): %s\n" "$(basename "$f")"
done

# Copy originals from backup (vmdk excluded — unlocked via rename in [1/4])
RESTORED=0
for ext in vmx "vmx~" nvram vmsd hlog; do
    for f in "$BACKUP_DIR"/*."$ext"; do
        [ -f "$f" ] || continue
        cp "$f" "$VM_DIR/"
        printf "      restored: %s\n" "$(basename "$f")"
        RESTORED=$((RESTORED + 1))
    done
done
printf "      ${GRN}%d files restored.${RST}\n\n" "$RESTORED"

# -- [3/4] Remove attack artifacts --------------------------------------------
printf "${BLD}[3/4] Removing attack artifacts...${RST}\n"

if [ -d "$VM_DIR/tblspc" ]; then
    rm -rf "$VM_DIR/tblspc"
    printf "      removed: tblspc/\n"
fi

if [ -f "$VM_DIR/README_RESTORE.txt" ]; then
    rm -f "$VM_DIR/README_RESTORE.txt"
    printf "      removed: README_RESTORE.txt\n"
fi

printf "      ${GRN}Done.${RST}\n\n"

# -- [4/4] Re-register and power on VM ----------------------------------------
printf "${BLD}[4/4] Registering and powering on VM...${RST}\n"

VM_ID=$(vim-cmd vmsvc/getallvms 2>/dev/null | awk -v name="$VM_NAME" '$0 ~ name {print $1; exit}')

if [ -z "$VM_ID" ]; then
    printf "      VM not in inventory — registering...\n"
    vim-cmd solo/registervm "$VM_DIR/${VM_NAME}.vmx" 2>/dev/null
    sleep 3
    VM_ID=$(vim-cmd vmsvc/getallvms 2>/dev/null | awk -v name="$VM_NAME" '$0 ~ name {print $1; exit}')
fi

if [ -n "$VM_ID" ]; then
    printf "      VM ID: %s — powering on...\n" "$VM_ID"
    vim-cmd vmsvc/power.on "$VM_ID" 2>/dev/null
    sleep 5
    power_state=$(vim-cmd vmsvc/power.getstate "$VM_ID" 2>/dev/null)
    if echo "$power_state" | grep -qi "powered on"; then
        printf "      ${GRN}VM is powered on.${RST}\n\n"
    else
        printf "      ${YEL}VM registered but may need manual power-on.${RST}\n\n"
    fi
else
    printf "      ${YEL}Could not register VM automatically.\n"
    printf "      Register manually: vim-cmd solo/registervm \"%s/%s.vmx\"${RST}\n\n" \
        "$VM_DIR" "$VM_NAME"
fi

# -- Final screen -------------------------------------------------------------
clear
printf "${GRN}${BLD}"
printf "  +--------------------------------------------------+\n"
printf "  |                                                  |\n"
printf "  |    RECOVERY COMPLETE                             |\n"
printf "  |    VM     : %-36s|\n" "$VM_NAME"
printf "  |    Discs  : UNLOCKED                             |\n"
printf "  |    Config : RESTORED FROM BACKUP                 |\n"
printf "  |    Status : POWERED ON                           |\n"
printf "  |                                                  |\n"
printf "  +--------------------------------------------------+\n"
printf "${RST}\n"
printf "${CYA}  Backup : %s\n" "$BACKUP_DIR"
printf "  VM dir : %s${RST}\n\n" "$VM_DIR"
