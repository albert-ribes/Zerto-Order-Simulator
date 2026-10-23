#!/bin/bash
# Step 4: Build and deploy observability containers + probes
# Run this on: frontend VM (10.20.0.146) AND postgresql VM (10.20.0.148)
# Usage: bash step4-build-obs.sh [frontend|postgresql|all]
set -e

ZERTO=/opt/zerto
ROLE=${1:-all}

# ── Helper ────────────────────────────────────────────────────────────────────
log() { echo "==> $*"; }

# ── FRONTEND VM builds ────────────────────────────────────────────────────────
build_frontend_obs() {
    log "Building probe images (sys-probe, zerto-probe)..."
    docker build -t sys-probe:latest    "$ZERTO/observability/sys-probe"
    docker build -t zerto-probe:latest  "$ZERTO/observability/zerto-probe"

    log "Building processed-meat-obs..."
    docker build \
        -f "$ZERTO/observability/Dockerfile" \
        -t processed-meat-obs:latest \
        "$ZERTO"

    log "Building hospital-obs..."
    # Clone source if not yet present
    if [ ! -d "$ZERTO/hospital/hdm-observability-src" ]; then
        git clone https://github.com/smonterohpe/hdm-observability.git \
            "$ZERTO/hospital/hdm-observability-src"
    else
        git -C "$ZERTO/hospital/hdm-observability-src" pull --ff-only
    fi
    sudo mkdir -p "$ZERTO/hospital/hdm-observability-src/nginx"
    sudo cp "$ZERTO/hospital/hdm-observability/nginx.conf.template" \
            "$ZERTO/hospital/hdm-observability-src/nginx/hdm-obs.conf.template"
    docker build \
        -f "$ZERTO/hospital/hdm-observability/Dockerfile" \
        -t hospital-obs:latest \
        "$ZERTO/hospital/hdm-observability-src"

    log "Building flight-booking-obs..."
    if [ ! -d "$ZERTO/flight-booking/fb-observer-src" ]; then
        git clone https://github.com/smonterohpe/flight-booking-observer.git \
            "$ZERTO/flight-booking/fb-observer-src"
    else
        git -C "$ZERTO/flight-booking/fb-observer-src" pull --ff-only
    fi
    sudo mkdir -p "$ZERTO/flight-booking/fb-observer-src/nginx"
    sudo cp "$ZERTO/flight-booking/fb-observer/nginx.conf.template" \
            "$ZERTO/flight-booking/fb-observer-src/nginx/fb-obs.conf.template"
    docker build \
        -f "$ZERTO/flight-booking/fb-observer/Dockerfile" \
        -t flight-booking-obs:latest \
        "$ZERTO/flight-booking/fb-observer-src"

    log "Deploying frontend VM containers..."
    docker compose -f "$ZERTO/docker/frontend-vm/docker-compose.yml" up -d \
        sys-probe zerto-probe \
        processed-meat-obs hospital-obs flight-booking-obs

    log "Updating host nginx router..."
    sudo cp "$ZERTO/deploy/nginx.frontend-router.conf" \
            /etc/nginx/sites-available/frontend-router
    sudo nginx -t && sudo systemctl reload nginx

    log "Frontend VM: done."
    echo ""
    echo "  Obs consoles: http://obs-processed-meat.tec.bcn"
    echo "                http://obs-hospital.tec.bcn"
    echo "                http://obs-flight-booking.tec.bcn"
}

# ── POSTGRESQL VM builds ──────────────────────────────────────────────────────
build_postgresql_probes() {
    log "Building db-probe image..."
    docker build -t db-probe:latest    "$ZERTO/observability/db-probe"
    docker build -t sys-probe:latest   "$ZERTO/observability/sys-probe"

    log "Deploying postgresql VM probe containers..."
    docker compose -f "$ZERTO/docker/postgresql-vm/docker-compose.yml" up -d \
        processed-meat-db-probe hospital-db-probe flight-booking-db-probe sys-probe

    log "PostgreSQL VM: done."
    echo ""
    echo "  DB probes:  http://10.20.0.148:5000/db/ping  (processed-meat)"
    echo "              http://10.20.0.148:5010/db/ping  (hospital)"
    echo "              http://10.20.0.148:5020/db/ping  (flight-booking)"
    echo "  Sys probe:  http://10.20.0.148:5001/sys/metrics"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$ROLE" in
    frontend)    build_frontend_obs ;;
    postgresql)  build_postgresql_probes ;;
    all)
        build_frontend_obs
        echo ""
        echo "NOTE: Run 'bash step4-build-obs.sh postgresql' on 10.20.0.148 to deploy probes there."
        ;;
    *)
        echo "Usage: $0 [frontend|postgresql|all]"
        exit 1
        ;;
esac
