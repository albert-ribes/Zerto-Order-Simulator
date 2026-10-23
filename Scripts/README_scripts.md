# Operations Scripts — Reference

The scripts in this document are present on both **frontend.tec.bcn** and **backend.tec.bcn**
under `/home/adminhpe/scripts/`. The deploy/setup scripts live under `/opt/zerto/deploy/`
on all VMs and are run from the management machine.

---

## Directory structure

```
/home/adminhpe/scripts/           # Operational scripts (frontend & backend)
├── check_frontend.sh             # Smoke test: verifies the full frontend stack
├── get_order_api-GET.sh          # API test: fetch one order by ID
├── insert_api-POST.sh            # API test: create a new order
├── lastorders_api-GET.sh         # API test: list the last 3 orders
├── modify_hosts.sh               # Failover: inject recovery IPs into /etc/hosts
├── rollback_hosts.sh             # Failover: revert IP, DNS and /etc/hosts
├── rollback-human-error.sh       # Demo: remove the injected syntax error
├── rollback-patch.sh             # Demo: downgrade OpenLDAP to previous version
├── simulate-human-error.sh       # Demo: inject a syntax error in the backend
├── test-failover.sh              # Failover: apply IP change after Zerto failover
├── upgrade-patch.sh              # Demo: apply OpenLDAP security patch
└── zerto_insert-checkpoint.sh    # Zerto: insert a named checkpoint into a VPG

/opt/zerto/deploy/                # Deploy & setup scripts (run from mgmt machine)
├── deploy.sh                     # Deploy application code to frontend/backend/obsdemo
├── setup-obsdemo.sh              # Initial setup of obsdemo.tec.bcn
├── setup-sysprobe.sh             # Install sys-probe service (system metrics)
├── setup-sysprobe-user.sh        # Install sys-probe as user service (no sudo)
└── setup-zertoprobe.sh           # Install zerto-probe service on obsdemo
```

---

## `/home/adminhpe/scripts/`

### `check_frontend.sh`
**Smoke test: verifies the full frontend stack is operational.**

| | |
|---|---|
| **Run on** | frontend.tec.bcn or any host with network access |
| **Run as** | `adminhpe` |
| **Command** | `./check_frontend.sh` or `./check_frontend.sh http://<host>` |
| **Returns** | exit 0 (all checks pass) / exit 1 (any check fails) |

Performs the following checks:
- `GET /` returns 200 and valid HTML
- Static assets (`style.css`, `app.js`, `i18n.js`) return 200
- `GET /api/ping` returns `{"pong": true}` (backend reachable via proxy)
- `GET /api/generator/status` returns the order generator status
- `POST /api/auth/login` returns a JWT token
- `GET /api/clients`, `/api/products`, `/api/orders` return data (authenticated)
- `GET /api/system/metrics` returns CPU/RAM metrics
- SPA fallback: any unknown route returns 200 (nginx `try_files`)
- Unknown API endpoint returns non-200 (proxy active)

---

### `get_order_api-GET.sh`
**Fetch a single order from the backend API by ID.**

| | |
|---|---|
| **Run on** | frontend.tec.bcn or backend.tec.bcn |
| **Run as** | `adminhpe` |
| **Command** | `./get_order_api-GET.sh [ORDER_ID]` (default: 1) |

Authenticates with `admin/admin`, then calls `GET /orders/<id>` and prints the JSON response.

---

### `insert_api-POST.sh`
**Create a new order via the backend API.**

| | |
|---|---|
| **Run on** | frontend.tec.bcn or backend.tec.bcn |
| **Run as** | `adminhpe` |
| **Command** | `./insert_api-POST.sh` |

Authenticates with `admin/admin`, then calls `POST /orders` with a hardcoded payload
(`client_id: 16`, `product_id: 39`, `quantity: 30`) and prints the created order as JSON.
Edit the script body to change the order parameters.

---

### `lastorders_api-GET.sh`
**Fetch the last 3 orders from the backend API.**

| | |
|---|---|
| **Run on** | frontend.tec.bcn or backend.tec.bcn |
| **Run as** | `adminhpe` |
| **Command** | `./lastorders_api-GET.sh` |

Authenticates with `admin/admin`, then calls `GET /orders?limit=3&offset=0` and prints
the response as formatted JSON.

---

### `test-failover.sh`
**Apply network and service changes after a Zerto test failover.**

| | |
|---|---|
| **Run on** | Each VM individually (frontend, backend, postgresql) |
| **Run as** | `root` |
| **Command** | `sudo ./test-failover.sh` |
| **Reversible** | Yes — via `rollback_hosts.sh` |

Detects the VM identity from `hostname` and applies the corresponding recovery IP:

| VM | Recovery IP |
|---|---|
| frontend | 10.21.0.146 |
| backend | 10.21.0.147 |
| postgresql | 10.21.0.148 |

Steps:
1. Updates the netplan config with the recovery IP (backs up the original)
2. Disables DNS resolution (production DNS not reachable from test bubble)
3. Injects recovery IPs into `/etc/hosts` via `modify_hosts.sh`
4. Restarts the VM's main service (`nginx` / `zerto-backend` / `postgresql`)
5. Applies netplan — **SSH connection drops at this point**

> ⚠️ Run via vSphere console, not over SSH — the IP changes will drop the connection.

---

### `rollback_hosts.sh`
**Revert IP, DNS and `/etc/hosts` after a Zerto test failover.**

| | |
|---|---|
| **Run on** | Each VM individually |
| **Run as** | `root` |
| **Command** | `sudo ./rollback_hosts.sh` |

Steps:
1. Restores netplan from backup (`*.bak`)
2. Restores `systemd-resolved.conf` from backup and restarts DNS
3. Removes recovery-IP entries from `/etc/hosts`
4. Restarts the VM's main service
5. Applies netplan — **SSH connection drops at this point**

> ⚠️ Run via vSphere console, not over SSH.

---

### `modify_hosts.sh`
**Inject recovery IPs into `/etc/hosts`.**

| | |
|---|---|
| **Run on** | frontend, backend or postgresql |
| **Run as** | `root` |
| **Command** | `sudo ./modify_hosts.sh` |

Adds the following entries (tagged `# zerto-recovery` for later removal):
```
10.21.0.146 frontend.tec.bcn
10.21.0.147 backend.tec.bcn
10.21.0.148 postgresql.tec.bcn
```
Called automatically by `test-failover.sh`. Can also be run stand-alone.
Re-running it first removes any previous `# zerto-recovery` entries to avoid duplicates.

---

### `simulate-human-error.sh`
**Inject a syntax error into the backend code to break the service.**

| | |
|---|---|
| **Run on** | backend.tec.bcn |
| **Run as** | `root` |
| **Command** | `sudo ./simulate-human-error.sh` |
| **Reversible** | Yes — via `rollback-human-error.sh` |

Appends `this is not valid python syntax!!!` to `/opt/zerto/backend/main.py` and
restarts `zerto-backend`. The service fails to start (Python syntax error),
causing the application to go offline.

---

### `rollback-human-error.sh`
**Remove the injected syntax error and restore the backend service.**

| | |
|---|---|
| **Run on** | backend.tec.bcn |
| **Run as** | `root` |
| **Command** | `sudo ./rollback-human-error.sh` |

Removes the `this is not valid python syntax!!!` line from `main.py` and
restarts `zerto-backend`. Exits with an error if the line is not found.

---

### `upgrade-patch.sh`
**Apply an OpenLDAP security patch and restart nginx.**

| | |
|---|---|
| **Run on** | frontend.tec.bcn |
| **Run as** | `root` |
| **Command** | `sudo ./upgrade-patch.sh` |
| **Reversible** | Yes — via `rollback-patch.sh` |

Upgrades `libldap2` and `libldap-common` from version `2.6.7` → `2.6.10`
using `apt-get`. Stops nginx for a 20-second maintenance window, then restarts it.

---

### `rollback-patch.sh`
**Downgrade OpenLDAP to the previous version.**

| | |
|---|---|
| **Run on** | frontend.tec.bcn |
| **Run as** | `root` |
| **Command** | `sudo ./rollback-patch.sh` |
| **Requires** | Local `.deb` packages in `./patches/` |

Installs the previous version (`2.6.7`) directly from local `.deb` files via `dpkg -i`,
then restarts nginx.

---

### `zerto_insert-checkpoint.sh`
**Insert a named checkpoint into a Zerto VPG.**

| | |
|---|---|
| **Run on** | frontend.tec.bcn or backend.tec.bcn |
| **Run as** | `adminhpe` |
| **Command** | `./zerto_insert-checkpoint.sh "<VPG_NAME>" "<CHECKPOINT_TEXT>"` |

**Examples:**
```bash
./zerto_insert-checkpoint.sh "ResilienceApp Remote" "Pre-deploy v2.3.1"
./zerto_insert-checkpoint.sh "ResilienceApp Local"  "Manual backup 12/04/2026"
```

Automatically detects which ZVM hosts the specified VPG by querying both:
- `zvm-tec.tec.bcn` (ZVM TEC — production site)
- `zvm-recoveryroom.tec.bcn` (ZVM Recovery — DR site)

Authentication tries three methods in order: OAuth2 client_credentials → password grant → session token (Zerto < 9).

ZVM credentials and VPG names can be overridden via environment variables
(`ZVM1_HOST`, `ZVM1_PASSWORD`, `ZVM2_HOST`, `ZVM2_PASSWORD`, etc.).

---

## `/opt/zerto/deploy/`

> These scripts are designed to be run **from the management machine**, piping them
> over SSH. They are also present as copies under `/home/adminhpe/zerto/deploy/`.

---

### `deploy.sh`
**Deploy application code from the GitHub repository to one or all VMs.**

| | |
|---|---|
| **Run from** | Management machine |
| **Run as** | `adminhpe` (uses SSH aliases: `frontend`, `backend`, `obsdemo`) |
| **Command** | `./deploy.sh [backend\|frontend\|observability\|obsdemo\|all]` |

| Target | Action |
|---|---|
| `backend` | `git pull`, install Python dependencies, restart `zerto-backend` |
| `frontend` | `git pull`, copy static files to `/var/www/html/`, reload nginx |
| `observability` / `obsdemo` | `git pull`, copy frontend shared assets + observability files, reload nginx |
| `all` (default) | Runs all three in sequence |

---

### `setup-obsdemo.sh`
**Initial setup of `obsdemo.tec.bcn` (observability console).**

| | |
|---|---|
| **Run from** | Management machine |
| **Command** | `ssh adminhpe@obsdemo.tec.bcn "bash -s" < deploy/setup-obsdemo.sh` |
| **Run once** | Yes — idempotent (safe to re-run) |

Installs: `git`, `nginx`, `python3`, `python3-venv`. Clones the repository to `/opt/zerto`,
sets up the Python virtual environment for `db-probe`, creates the `.env` file (if missing),
installs the `zerto-dbprobe` systemd service, copies static files to `/var/www/html/`,
and configures nginx.

> ⚠️ Edit `/opt/zerto/observability/db-probe/.env` with the correct database credentials
> before starting the service.

---

### `setup-sysprobe.sh`
**Install the `sys-probe` service (system metrics endpoint) on frontend or postgresql.**

| | |
|---|---|
| **Run from** | Management machine |
| **Command** | `ssh adminhpe@frontend.tec.bcn "bash -s" < deploy/setup-sysprobe.sh` |
| **Targets** | frontend.tec.bcn, postgresql.tec.bcn |
| **Run once** | Yes — idempotent |

Installs Python dependencies, copies `zerto-sysprobe.service` to systemd,
enables and starts the service. The metrics endpoint is exposed at
`http://<host>:5001/sys/metrics`.

---

### `setup-sysprobe-user.sh`
**Install `sys-probe` as a user-level process (no sudo required).**

| | |
|---|---|
| **Run from** | Management machine |
| **Command** | `ssh adminhpe@frontend.tec.bcn "bash -s" < deploy/setup-sysprobe-user.sh` |

Alternative to `setup-sysprobe.sh` for environments where systemd root access
is not available. Uses `nohup` to start the process and `crontab @reboot` for
persistence across reboots. Repository is cloned to `~/zerto` (user home).

---

### `setup-zertoprobe.sh`
**Install the `zerto-probe` service on `obsdemo.tec.bcn`.**

| | |
|---|---|
| **Run from** | Management machine |
| **Command** | `ssh adminhpe@obsdemo.tec.bcn "bash -s" < deploy/setup-zertoprobe.sh` |
| **Run once** | Yes — idempotent |

Updates the repository, sets up a Python virtual environment under
`/opt/zerto/observability/zerto-probe/`, installs the `zerto-zertoprobe` systemd
service, and verifies the probe responds at `http://localhost:5002/zerto/ping`.

---

## Demo workflows

### Human error scenario
```bash
# On backend.tec.bcn — break the service
sudo /home/adminhpe/scripts/simulate-human-error.sh

# ... show application error, Zerto journal / rollback options ...

# Restore via Zerto OR via script
sudo /home/adminhpe/scripts/rollback-human-error.sh
```

### Security patch scenario
```bash
# On frontend.tec.bcn — apply patch (nginx maintenance window)
sudo /home/adminhpe/scripts/upgrade-patch.sh

# ... show version change, downtime window ...

# Rollback if needed
sudo /home/adminhpe/scripts/rollback-patch.sh
```

### Test failover scenario
```bash
# On each VM — via vSphere console (SSH will drop)
sudo /home/adminhpe/scripts/test-failover.sh

# ... show application running on recovery IPs ...

# Revert — via vSphere console
sudo /home/adminhpe/scripts/rollback_hosts.sh
```

### Insert Zerto checkpoint before a deployment
```bash
# On frontend or backend
./zerto_insert-checkpoint.sh "ResilienceApp Remote" "Pre-deploy $(date +%d/%m/%Y)"
./deploy.sh                      # deploy new code
```
