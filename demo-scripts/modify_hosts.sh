#!/bin/bash
# modify_hosts.sh — Inject recovery IPs into /etc/hosts for tec.bcn hosts

MARKER="# zerto-recovery"

ENTRIES=(
    "10.21.0.146 frontend.tec.bcn"
    "10.21.0.147 backend.tec.bcn"
    "10.21.0.148 postgresql.tec.bcn"
)

echo ""
echo "=== Injecting recovery IPs into /etc/hosts ==="

# Remove any previous entries from this script
sed -i "/$MARKER/d" /etc/hosts

# Append new entries
echo "" >> /etc/hosts
for entry in "${ENTRIES[@]}"; do
    echo "$entry $MARKER" >> /etc/hosts
    echo "  + $entry"
done

echo ""
echo "Done. Current tec.bcn entries:"
grep "tec.bcn" /etc/hosts
