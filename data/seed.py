#!/usr/bin/env python3
"""
Seed script — carrega clients i productes des de fitxers CSV a la base de dades.

Ús:
  python seed.py                          # usa DATABASE_URL de l'entorn
  python seed.py --db postgresql://...    # URL explícita
  python seed.py --clear                  # buida les taules abans d'inserir
  python seed.py --clients clients.csv --products products.csv
"""

import argparse
import csv
import os
import sys
from pathlib import Path
from decimal import Decimal, InvalidOperation

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
except ImportError:
    sys.exit("ERROR: cal instal·lar sqlalchemy:  pip install sqlalchemy psycopg2-binary")

# ── Argument parsing ──────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Seed de clients i productes")
parser.add_argument("--db",       default=os.getenv("DATABASE_URL"),
                    help="URL de connexió PostgreSQL")
parser.add_argument("--clients",  default=Path(__file__).parent / "clients.csv",
                    help="Fitxer CSV de clients")
parser.add_argument("--products", default=Path(__file__).parent / "products.csv",
                    help="Fitxer CSV de productes")
parser.add_argument("--clear",    action="store_true",
                    help="Buida les taules clients i products abans d'inserir")
args = parser.parse_args()

if not args.db:
    sys.exit("ERROR: cal especificar DATABASE_URL (env var o --db)")

# ── Connexió ──────────────────────────────────────────────────────────────────
print(f"Connectant a la base de dades...")
engine = create_engine(args.db)
Session = sessionmaker(bind=engine)

try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("  ✓ Connexió OK")
except Exception as e:
    sys.exit(f"ERROR de connexió: {e}")

# ── Helpers ───────────────────────────────────────────────────────────────────
def load_csv(path):
    path = Path(path)
    if not path.exists():
        sys.exit(f"ERROR: no es troba el fitxer {path}")
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def count_table(conn, table):
    return conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()

# ── Seed ──────────────────────────────────────────────────────────────────────
with engine.connect() as conn:

    if args.clear:
        print("\nBuidant taules (--clear)...")
        conn.execute(text("TRUNCATE orders, clients, products RESTART IDENTITY CASCADE"))
        conn.commit()
        print("  ✓ Taules buidades")

    # ── Clients ───────────────────────────────────────────────────────────────
    print(f"\nCarregant clients des de {args.clients}...")
    clients = load_csv(args.clients)
    inserted_c = skipped_c = 0
    for row in clients:
        name  = row["name"].strip()
        email = row["email"].strip().lower()
        if not name or not email:
            print(f"  ⚠ Fila ignorada (camps buits): {row}")
            skipped_c += 1
            continue
        exists = conn.execute(
            text("SELECT id FROM clients WHERE email = :e"), {"e": email}
        ).fetchone()
        if exists:
            skipped_c += 1
        else:
            conn.execute(
                text("INSERT INTO clients (name, email) VALUES (:n, :e)"),
                {"n": name, "e": email},
            )
            inserted_c += 1
    conn.commit()
    total_c = conn.execute(text("SELECT COUNT(*) FROM clients")).scalar()
    print(f"  ✓ Inserits: {inserted_c}  |  Ja existents: {skipped_c}  |  Total: {total_c}")

    # ── Products ──────────────────────────────────────────────────────────────
    print(f"\nCarregant productes des de {args.products}...")
    products = load_csv(args.products)
    inserted_p = skipped_p = errors_p = 0
    for row in products:
        name = row["name"].strip()
        try:
            price = Decimal(str(row["price"]).strip().replace(",", "."))
            if price <= 0:
                raise ValueError("preu ≤ 0")
        except (InvalidOperation, ValueError) as e:
            print(f"  ⚠ Preu invàlid per '{name}': {e}")
            errors_p += 1
            continue
        if not name:
            skipped_p += 1
            continue
        exists = conn.execute(
            text("SELECT id FROM products WHERE name = :n"), {"n": name}
        ).fetchone()
        if exists:
            skipped_p += 1
        else:
            conn.execute(
                text("INSERT INTO products (name, price) VALUES (:n, :p)"),
                {"n": name, "p": price},
            )
            inserted_p += 1
    conn.commit()
    total_p = conn.execute(text("SELECT COUNT(*) FROM products")).scalar()
    print(f"  ✓ Inserits: {inserted_p}  |  Ja existents: {skipped_p}  |  Errors: {errors_p}  |  Total: {total_p}")

print("\n✅ Seed completat correctament!\n")
