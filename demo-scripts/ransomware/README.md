# Ransomware Lab — Script Reference

**Host:** `postgresql.tec.bcn`
**Base directory:** `/home/adminhpe/lab_ransom/`

---

## Directory structure

```
/home/adminhpe/lab_ransom/
├── pg_encrypt/                   # PostgreSQL encryption scenarios
│   ├── encrypt_postgres.sh       # Attack: encrypts the REAL database
│   ├── encrypt_postgres_sim.sh   # Attack: encrypts a COPY of the database (safe)
│   ├── restore_postgres.sh       # Recovery: restores from backup
│   └── backup/                   # Auto-created by encrypt_postgres.sh
│       └── main/                 # Clean backup of /var/lib/postgresql/16/main
│
└── file_encrypt/                 # Generic file encryption scenario
    ├── generate_files.sh         # Generates 10 × 1 GB test files
    ├── encrypt_files.sh          # Encrypts the test files
    ├── ransom_note.sh            # Prints the ransom message
    └── data/                     # Working directory (test files live here)
        └── file{1..10}.bin       # Pre-generated 1 GB files (if present)
```

---

## pg_encrypt/

### `encrypt_postgres.sh`
**Encrypts the real PostgreSQL database.**

| | |
|---|---|
| **Run as** | `root` |
| **Command** | `sudo ./encrypt_postgres.sh` |
| **Duration** | ~15–20 min (10 GB encryption pass) |
| **Reversible** | Yes — via `restore_postgres.sh` |

**What it does:**
1. Stops the PostgreSQL service
2. Creates a full backup of `/var/lib/postgresql/16/main` → `./backup/`
3. Renames all `base/` data files to `.locked` (fast, no data copy)
4. Encrypts `pg_wal/` transaction logs with AES-256-CBC
5. Generates 10 × 1 GB zero-filled files and encrypts them with AES-256-CBC (bulk pass that triggers Zerto's encryption detection)
6. Writes a ransom note to `$PGDATA/README_RESTORE.txt`
7. Displays the ransom note on screen

**After execution:**
- PostgreSQL is stopped and its data is inaccessible
- The application returns database connection errors
- Zerto raises an encryption-detection alert

**Key variables (top of script):**
```bash
KEY="password123"     # AES encryption key
TS_COUNT=10           # Number of large files for the bulk pass
TS_SIZE_MB=1024       # Size of each file in MB (10 × 1024 = 10 GB total)
```

---

### `encrypt_postgres_sim.sh`
**Encrypts a copy of the database — the real database stays running.**

| | |
|---|---|
| **Run as** | `adminhpe` (uses `sudo` internally) |
| **Command** | `./encrypt_postgres_sim.sh` (from `pg_encrypt/`) |
| **Duration** | ~15–20 min |
| **Reversible** | Yes — delete `./data/` to clean up |

**What it does:**
1. Stops PostgreSQL briefly to take a consistent snapshot
2. Copies `/var/lib/postgresql/16/main` → `./data/`
3. Restarts PostgreSQL immediately (service returns to normal)
4. Encrypts the copy's `base/` and `pg_wal/` directories
5. Generates and encrypts 5 × 1 GB tablespace files (Zerto trigger)
6. Writes a ransom note to `./data/README_RESTORE.txt`

**Use case:** rehearsing the attack sequence without taking the application offline.

---

### `restore_postgres.sh`
**Restores the real PostgreSQL database from the backup created by `encrypt_postgres.sh`.**

| | |
|---|---|
| **Run as** | `root` |
| **Command** | `sudo ./restore_postgres.sh` |
| **Duration** | ~1 min |
| **Requires** | `./backup/main/` to exist (created by `encrypt_postgres.sh`) |

**What it does:**
1. Stops PostgreSQL (if running)
2. Deletes all encrypted data from `/var/lib/postgresql/16/main`
3. Copies `./backup/main` back to `/var/lib/postgresql/16/main`
4. Restores ownership (`postgres:postgres`) and permissions (`700`)
5. Starts PostgreSQL and verifies the service is active

**Important:** the `./backup/` directory must not be deleted or modified between the attack and the recovery.

---

## file_encrypt/

### `generate_files.sh`
**Generates 10 × 1 GB random binary files used as test targets.**

| | |
|---|---|
| **Run as** | `adminhpe` |
| **Command** | `./generate_files.sh` (from `file_encrypt/`) |
| **Duration** | ~5–10 min (disk-speed limited) |
| **Output** | `./data/file1.bin` … `./data/file10.bin` (10 GB total) |

Run this once before the first use of `encrypt_files.sh`. Re-run it after each encryption to regenerate the target files.

---

### `encrypt_files.sh`
**Encrypts all `.bin` files in `./data/` with AES-256-CBC.**

| | |
|---|---|
| **Run as** | `adminhpe` |
| **Command** | `./encrypt_files.sh` (from `file_encrypt/`) |
| **Duration** | ~5–10 min |
| **Input** | `./data/*.bin` |
| **Output** | `./data/*.bin.enc` (originals deleted) |

Calls `ransom_note.sh` automatically when encryption is complete.

**Prerequisite:** run `generate_files.sh` first to create the `.bin` files.

---

### `ransom_note.sh`
**Prints a ransom message to the terminal.**

| | |
|---|---|
| **Run as** | `adminhpe` |
| **Command** | `./ransom_note.sh` (from `file_encrypt/`) |

Can also be called stand-alone to display the message without running the encryption. Called automatically at the end of `encrypt_files.sh`.

---

## Workflows

### Scenario A — Real database attack (Zerto detection)
```bash
# On postgresql.tec.bcn
cd /home/adminhpe/lab_ransom/pg_encrypt
sudo ./encrypt_postgres.sh        # attack  (~15-20 min)
# ... show Zerto alert ...
sudo ./restore_postgres.sh        # recover (~1 min)
```

### Scenario B — Safe rehearsal (database stays up)
```bash
cd /home/adminhpe/lab_ransom/pg_encrypt
./encrypt_postgres_sim.sh         # attack on copy (~15-20 min)
rm -rf data/                      # cleanup
```

### Scenario C — Generic file encryption (Zerto detection)
```bash
cd /home/adminhpe/lab_ransom/file_encrypt
./generate_files.sh               # one-time setup (~5-10 min)
./encrypt_files.sh                # attack (~5-10 min)
./generate_files.sh               # regenerate for next run
```

---

## Notes

- **Encryption key** used across all scripts: `password123`
- **Backup location** (Scenario A): `/home/adminhpe/lab_ransom/pg_encrypt/backup/`  
  This directory is overwritten every time `encrypt_postgres.sh` runs.
- **Zerto detection** is triggered by the bulk AES-256 encryption of ~10 GB of data.  
  The encrypted files are written inside `/var/lib/postgresql/16/` which is on the monitored virtual disk.
- All `.locked` and `.enc` files are the encrypted output. The originals are deleted.
