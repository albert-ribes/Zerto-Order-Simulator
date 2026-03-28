# Zerto Order Simulator

A full-stack web application that simulates a real-time order stream and visualises it through an interactive analytics dashboard.

---

## Overview

Zerto Order Simulator generates synthetic orders automatically (configurable rate, with realistic time-of-day traffic patterns) and exposes a live dashboard with multiple Chart.js visualisations. It is designed as a self-contained demo environment that can be spun up with a single Docker Compose command.

---

## Features

### Order generator
- Start / stop an automatic order generator from the UI
- Configurable generation interval (0.5 s – 10 s)
- Traffic shaped by time-of-day: lower volume at night, peaks at business hours
- Orders assigned to random clients and products with realistic pricing

### Dashboard
- **Orders per minute** — bar + line dual-axis chart (order count + revenue)
- **Cumulative revenue** — area chart derived from the same time series, pixel-perfect vertical alignment with the chart above
- **Units per product** — doughnut chart with per-product quantity legend
- **Revenue per product** — horizontal bar chart
- **Daily history** — bar + line dual-axis chart per calendar day
- **Hourly distribution** — 24-bar chart colour-coded by time of day, with daily averages in tooltips
- Day-boundary markers: dashed vertical lines + date badges at midnight transitions
- **Grafana-style time range picker** — quick presets (last 15 m → 30 d, all time) plus custom start/end

### Orders section
- Paginated table of individual orders with configurable page size
- Time range filter (same presets as the dashboard)
- Row-level checkbox selection
- *Select all filtered* — fetches all matching IDs across pages for bulk operations
- Bulk delete via a single API call

### UX
- Dark / light theme toggle (persisted in `localStorage`)
- Configurable auto-refresh interval
- Multilingual interface: **Catalan**, **Spanish**, **English**
- Toast notifications for actions and errors

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES2020), Chart.js 4.4, CSS custom properties |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Gunicorn + Uvicorn |
| Database | PostgreSQL 16 |
| Serving | nginx (reverse proxy + static files) |
| Runtime | Docker Compose |

---

## Project structure

```
Zerto/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── main.py          # FastAPI app — all routes and business logic
│   ├── models.py        # SQLAlchemy ORM models
│   ├── schemas.py       # Pydantic request / response schemas
│   ├── database.py      # DB engine and session factory
│   ├── gunicorn.conf.py
│   └── requirements.txt
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── api.js       # Thin fetch wrapper + all API calls
        ├── charts.js    # Chart.js instances, plugins and update helpers
        ├── i18n.js      # Translation strings (CA/ES/EN) and helpers
        └── app.js       # Application logic, TRP factory, order management
```

---

## Getting started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

### Run

```bash
git clone https://github.com/aribes-zerto/zerto-order-simulator.git
cd zerto-order-simulator
docker compose up --build
```

Then open **http://localhost:3000** in your browser.

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API (FastAPI) | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

### Stop

```bash
docker compose down          # keeps database volume
docker compose down -v       # also removes the database
```

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/orders` | Paginated order list (`limit`, `offset`, `start`, `end`) |
| `POST` | `/orders` | Create a single order |
| `DELETE` | `/orders/{id}` | Delete one order |
| `GET` | `/orders/ids` | Return all order IDs matching a date range |
| `DELETE` | `/orders/batch` | Bulk-delete orders by ID list |
| `DELETE` | `/orders` | Delete all orders |
| `GET` | `/generator/status` | Generator state (running, interval) |
| `POST` | `/generator/start` | Start the order generator |
| `POST` | `/generator/stop` | Stop the order generator |
| `GET` | `/stats/summary` | KPI totals for a time range |
| `GET` | `/stats/timeline` | Time-bucketed order counts and revenue |
| `GET` | `/stats/products` | Per-product quantity and revenue |
| `GET` | `/stats/daily` | Per-day aggregates |
| `GET` | `/stats/hourly` | Per-hour aggregates (with daily averages) |
| `GET` | `/stats/range` | Earliest and latest order timestamps |

All date-range parameters accept ISO 8601 strings (`start`, `end`).

---

## Data model

```
clients       id, name, email, created_at
products      id, name, price, created_at
orders        id, client_id, product_id, quantity, unit_price, total_price, created_at
```

Five clients and six products are seeded automatically on first startup.

---

## Configuration

All configuration is done via environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://zerto:zerto@db:5432/zerto` | PostgreSQL connection string |

---

## Development notes

- The frontend uses **no build step** — plain ES modules served by nginx.
- Script cache-busting is done with `?v=N` query strings on `<script>` tags.
- The i18n system (`i18n.js`) exposes `t(key)`, `ti(key, vars)` helpers and an `onLangChanged` hook consumed by the TRP (time range picker) factory.
- The `makeTRP(ids, onChange)` factory creates independent time range picker instances (dashboard and orders section) using closure-based state.
- Chart alignment between *Orders per minute* and *Cumulative revenue* is achieved by measuring the rendered `chartArea` bounds of both Chart.js instances after each update and correcting `layout.padding` on the cumulative chart to match.
