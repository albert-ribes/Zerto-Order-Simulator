from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
import csv
import io
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List, Optional
import random
import math
import time
import threading
from datetime import datetime, timedelta

import models
import schemas
from database import engine, get_db, SessionLocal, Base
import auth
from auth import get_current_user, require_admin

app = FastAPI(title="Zerto Orders API")

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path in ("/auth/login",):
        return await call_next(request)
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
    if not token or not auth.decode_token(token):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        auth.ensure_default_admin(db)
    finally:
        db.close()
    _seed()

# ── Auth ──────────────────────────────────────────────────────────────────
@app.post("/auth/login", response_model=schemas.Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credencials incorrectes")
    token = auth.create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer",
            "username": user.username, "is_admin": user.is_admin}


@app.get("/auth/me", response_model=schemas.UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@app.get("/auth/users", response_model=List[schemas.UserOut])
def list_users(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.id).all()


@app.post("/auth/users", response_model=schemas.UserOut, status_code=201)
def create_user(data: schemas.UserCreate, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(400, "Nom d'usuari ja existeix")
    user = models.User(
        username=data.username,
        hashed_password=auth.hash_password(data.password),
        is_admin=data.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.put("/auth/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, data: schemas.UserUpdate, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuari no trobat")
    if current_user.id == user_id and data.is_admin is False:
        raise HTTPException(400, "No pots treure't els permisos d'administrador")
    if data.password:
        user.hashed_password = auth.hash_password(data.password)
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    db.commit()
    db.refresh(user)
    return user


@app.delete("/auth/users/{user_id}", status_code=204)
def delete_user(user_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuari no trobat")
    if current_user.id == user_id:
        raise HTTPException(400, "No pots eliminar el teu propi compte")
    db.delete(user)
    db.commit()

# ── Auto-generator state ──────────────────────────────────────────────────────
_generator = {"running": False, "interval": 2.0, "thread": None}


def _seed():
    db = SessionLocal()
    try:
        if db.query(models.Client).count() == 0:
            db.add_all([
                models.Client(name="Acme Corp",    email="orders@acme.com"),
                models.Client(name="Globex Inc",   email="purchasing@globex.com"),
                models.Client(name="Initech",      email="orders@initech.com"),
                models.Client(name="Umbrella Ltd", email="buy@umbrella.com"),
                models.Client(name="Hooli",        email="supplies@hooli.com"),
            ])
            db.commit()
        if db.query(models.Product).count() == 0:
            db.add_all([
                models.Product(name="Laptop Pro",          price=1299.99),
                models.Product(name="Wireless Mouse",      price=29.99),
                models.Product(name="Mechanical Keyboard", price=149.99),
                models.Product(name="4K Monitor",          price=599.99),
                models.Product(name="USB-C Hub",           price=49.99),
                models.Product(name="Webcam HD",           price=89.99),
            ])
            db.commit()
    finally:
        db.close()


# ── Time-of-day modelling ─────────────────────────────────────────────────────
def _time_of_day_weight() -> float:
    h = datetime.now().hour + datetime.now().minute / 60.0
    if h >= 22.0 or h < 6.0:
        return 0.03
    if h < 8.0:
        return 0.03 + 0.57 * ((h - 6.0) / 2.0)
    if 13.0 <= h < 14.0:
        dip = abs(h - 13.5) * 2.0
        return 0.30 + 0.35 * dip
    if h >= 20.0:
        frac = (h - 20.0) / 2.0
        return max(0.03, 0.60 * (1.0 - frac))
    morning   = math.exp(-((h - 10.0) ** 2) / 8.0)
    afternoon = math.exp(-((h - 15.0) ** 2) / 8.0)
    return 0.55 + 0.45 * max(morning, afternoon)


def _poisson_sample(lam: float) -> int:
    if lam <= 0.0:
        return 0
    L = math.exp(-lam)
    k, p = 0, 1.0
    while p > L:
        k += 1
        p *= random.random()
    return k - 1


def _make_random_order():
    db = SessionLocal()
    try:
        clients  = db.query(models.Client).all()
        products = db.query(models.Product).all()
        if not clients or not products:
            return
        client      = random.choice(clients)
        product     = random.choice(products)
        quantity    = random.randint(1, 10)
        unit_price  = float(product.price)
        total_price = unit_price * quantity
        order = models.Order(
            client_id=client.id, product_id=product.id,
            quantity=quantity, unit_price=unit_price, total_price=total_price,
        )
        db.add(order)
        db.commit()
    finally:
        db.close()


def _generator_loop():
    while _generator["running"]:
        weight = _time_of_day_weight()
        n = _poisson_sample(weight * 2.0)
        for _ in range(n):
            _make_random_order()
        time.sleep(_generator["interval"])


# ── Datetime helpers ──────────────────────────────────────────────────────────
def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    """Parse ISO datetime string → naive datetime (strips tz)."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.replace(tzinfo=None)
    except (ValueError, AttributeError):
        return None


def _naive(dt: datetime) -> datetime:
    """Ensure a datetime is timezone-naive."""
    return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt


# ── Clients ───────────────────────────────────────────────────────────────────
@app.get("/clients", response_model=List[schemas.ClientOut])
def list_clients(db: Session = Depends(get_db)):
    return db.query(models.Client).order_by(models.Client.name).all()


@app.post("/clients", response_model=schemas.ClientOut, status_code=201)
def create_client(data: schemas.ClientCreate, db: Session = Depends(get_db)):
    if db.query(models.Client).filter(models.Client.email == data.email).first():
        raise HTTPException(400, "Email already exists")
    obj = models.Client(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@app.put("/clients/{client_id}", response_model=schemas.ClientOut)
def update_client(client_id: int, data: schemas.ClientUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.Client).get(client_id)
    if not obj:
        raise HTTPException(404, "Client not found")
    existing = db.query(models.Client).filter(
        models.Client.email == data.email, models.Client.id != client_id
    ).first()
    if existing:
        raise HTTPException(400, "Email already exists")
    for k, v in data.model_dump().items():
        setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return obj


@app.delete("/clients/{client_id}", status_code=204)
def delete_client(client_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Client).get(client_id)
    if not obj:
        raise HTTPException(404, "Client not found")
    db.delete(obj); db.commit()


@app.post("/clients/import")
async def import_clients(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    inserted = skipped = 0
    errors = []
    for i, row in enumerate(reader, 1):
        name  = (row.get("name")  or "").strip()
        email = (row.get("email") or "").strip().lower()
        if not name or not email:
            errors.append(f"Fila {i}: nom o email buits"); continue
        if db.query(models.Client).filter(models.Client.email == email).first():
            skipped += 1; continue
        db.add(models.Client(name=name, email=email)); inserted += 1
    db.commit()
    return {"inserted": inserted, "skipped": skipped, "errors": errors}


# ── Products ──────────────────────────────────────────────────────────────────
@app.get("/products", response_model=List[schemas.ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.query(models.Product).order_by(models.Product.name).all()


@app.post("/products", response_model=schemas.ProductOut, status_code=201)
def create_product(data: schemas.ProductCreate, db: Session = Depends(get_db)):
    obj = models.Product(**data.model_dump())
    db.add(obj); db.commit(); db.refresh(obj)
    return obj


@app.put("/products/{product_id}", response_model=schemas.ProductOut)
def update_product(product_id: int, data: schemas.ProductUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.Product).get(product_id)
    if not obj:
        raise HTTPException(404, "Product not found")
    for k, v in data.model_dump().items():
        setattr(obj, k, v)
    db.commit(); db.refresh(obj)
    return obj


@app.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Product).get(product_id)
    if not obj:
        raise HTTPException(404, "Product not found")
    db.delete(obj); db.commit()


@app.post("/products/import")
async def import_products(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    inserted = skipped = 0
    errors = []
    for i, row in enumerate(reader, 1):
        name = (row.get("name") or "").strip()
        if not name:
            errors.append(f"Fila {i}: nom buit"); continue
        try:
            price = float(str(row.get("price") or "").strip().replace(",", "."))
            if price <= 0: raise ValueError()
        except (ValueError, TypeError):
            errors.append(f"Fila {i}: preu invàlid"); continue
        if db.query(models.Product).filter(models.Product.name == name).first():
            skipped += 1; continue
        db.add(models.Product(name=name, price=price)); inserted += 1
    db.commit()
    return {"inserted": inserted, "skipped": skipped, "errors": errors}


# ── Orders ────────────────────────────────────────────────────────────────────
@app.get("/orders")
def list_orders(
    limit:  int = 50,
    offset: int = 0,
    start:  Optional[str] = None,
    end:    Optional[str] = None,
    db: Session = Depends(get_db),
):
    now = datetime.now()
    if start or end:
        filters, _, _ = _order_filters(start, end, now)
    else:
        filters = []
    q = (
        db.query(models.Order)
        .filter(*filters)
        .order_by(models.Order.created_at.desc())
    )
    total = q.count()
    rows  = q.offset(offset).limit(limit).all()
    items = []
    for o in rows:
        items.append(schemas.OrderOut(
            id=o.id, client_id=o.client_id, product_id=o.product_id,
            quantity=o.quantity, unit_price=o.unit_price, total_price=o.total_price,
            created_at=o.created_at,
            client_name=o.client.name   if o.client   else None,
            product_name=o.product.name if o.product  else None,
        ))
    return {"items": items, "total": total}


@app.get("/orders/ids")
def list_order_ids(
    start: Optional[str] = None,
    end:   Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return list of all order IDs matching the given date range."""
    now = datetime.now()
    if start or end:
        filters, _, _ = _order_filters(start, end, now)
    else:
        filters = []
    rows = db.query(models.Order.id).filter(*filters).all()
    return [r.id for r in rows]


@app.delete("/orders/batch", status_code=200)
def delete_orders_batch(data: schemas.BatchDeleteRequest, db: Session = Depends(get_db)):
    """Bulk-delete orders by list of IDs."""
    if not data.ids:
        return {"deleted": 0}
    deleted = (
        db.query(models.Order)
        .filter(models.Order.id.in_(data.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


@app.post("/orders", response_model=schemas.OrderOut, status_code=201)
def create_order(data: schemas.OrderCreate, db: Session = Depends(get_db)):
    product = db.query(models.Product).get(data.product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    if not db.query(models.Client).get(data.client_id):
        raise HTTPException(404, "Client not found")
    unit_price  = float(product.price)
    total_price = unit_price * data.quantity
    obj = models.Order(
        client_id=data.client_id, product_id=data.product_id,
        quantity=data.quantity, unit_price=unit_price, total_price=total_price,
    )
    db.add(obj); db.commit(); db.refresh(obj)
    return schemas.OrderOut(
        id=obj.id, client_id=obj.client_id, product_id=obj.product_id,
        quantity=obj.quantity, unit_price=obj.unit_price, total_price=obj.total_price,
        created_at=obj.created_at,
        client_name=obj.client.name, product_name=obj.product.name,
    )


@app.delete("/orders/{order_id}", status_code=204)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Order).get(order_id)
    if not obj:
        raise HTTPException(404, "Order not found")
    db.delete(obj); db.commit()


@app.delete("/orders", status_code=200)
def reset_orders(db: Session = Depends(get_db)):
    deleted = db.query(models.Order).delete()
    db.commit()
    return {"deleted": deleted}


# ── Generator ─────────────────────────────────────────────────────────────────
@app.post("/generator/start")
def start_generator(cfg: schemas.GeneratorConfig = schemas.GeneratorConfig()):
    if _generator["running"]:
        return {"status": "already running"}
    _generator["running"]  = True
    _generator["interval"] = max(0.5, cfg.interval)
    t = threading.Thread(target=_generator_loop, daemon=True)
    _generator["thread"] = t
    t.start()
    return {"status": "started", "interval": _generator["interval"]}


@app.post("/generator/stop")
def stop_generator():
    _generator["running"] = False
    return {"status": "stopped"}


@app.get("/generator/status", response_model=schemas.GeneratorStatus)
def generator_status():
    return {"running": _generator["running"], "interval": _generator["interval"]}


# ── Stats helpers ─────────────────────────────────────────────────────────────
def _order_filters(start: Optional[str], end: Optional[str], now: datetime):
    """Build SQLAlchemy filter list for order date range."""
    end_dt   = _parse_dt(end) or now
    start_dt = _parse_dt(start)
    filters  = [models.Order.created_at <= end_dt]
    if start_dt:
        filters.append(models.Order.created_at >= start_dt)
    return filters, start_dt, end_dt


# ── Stats endpoints ───────────────────────────────────────────────────────────
@app.get("/stats/range")
def stats_range(db: Session = Depends(get_db)):
    """Min/max datetimes of existing orders — used to initialise the filter."""
    min_dt = db.query(func.min(models.Order.created_at)).scalar()
    max_dt = db.query(func.max(models.Order.created_at)).scalar()
    now    = datetime.now()
    return {
        "min":      min_dt.isoformat() if min_dt else now.isoformat(),
        "max":      max_dt.isoformat() if max_dt else now.isoformat(),
        "has_data": min_dt is not None,
    }


@app.get("/stats/summary")
def stats_summary(
    start: Optional[str] = None,
    end:   Optional[str] = None,
    db: Session = Depends(get_db),
):
    now = datetime.now()
    filters, start_dt, end_dt = _order_filters(start, end, now)

    total_orders  = db.query(func.count(models.Order.id)).filter(*filters).scalar() or 0
    total_revenue = float(db.query(func.sum(models.Order.total_price)).filter(*filters).scalar() or 0)
    # Clients/products are global (not date-filtered)
    total_clients  = db.query(func.count(models.Client.id)).scalar()  or 0
    total_products = db.query(func.count(models.Product.id)).scalar() or 0

    distinct_days = db.query(
        func.count(func.distinct(func.date_trunc("day", models.Order.created_at)))
    ).filter(*filters).scalar() or 1

    avg_orders_per_day  = round(total_orders  / distinct_days, 1)
    avg_revenue_per_day = round(total_revenue / distinct_days, 2)

    # Cumulative series (last 200 orders within range, chronological)
    orders = (
        db.query(models.Order.created_at, models.Order.total_price)
        .filter(*filters)
        .order_by(models.Order.created_at.asc())
        .limit(200)
        .all()
    )
    cumulative, acc = [], 0.0
    for o in orders:
        acc += float(o.total_price)
        cumulative.append({"time": o.created_at.strftime("%H:%M:%S"), "value": round(acc, 2)})

    last_order_at = db.query(func.max(models.Order.created_at)).filter(*filters).scalar()

    return {
        "total_orders":        total_orders,
        "total_revenue":       round(total_revenue, 2),
        "total_clients":       total_clients,
        "total_products":      total_products,
        "distinct_days":       distinct_days,
        "avg_orders_per_day":  avg_orders_per_day,
        "avg_revenue_per_day": avg_revenue_per_day,
        "cumulative":          cumulative,
        "last_order_at":       last_order_at.isoformat() if last_order_at else None,
    }


@app.get("/stats/timeline")
def stats_timeline(
    start: Optional[str] = None,
    end:   Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Returns a COMPLETE time series (no gaps) with auto-detected granularity:
      ≤ 3 h   → per minute
      ≤ 24 h  → per 10 minutes
      ≤ 7 d   → per hour
      > 7 d   → per day
    """
    now = datetime.now()
    end_dt = _parse_dt(end) or now

    if start:
        start_dt = _parse_dt(start) or (now - timedelta(hours=2))
    else:
        first = db.query(func.min(models.Order.created_at)).scalar()
        start_dt = _naive(first) if first else now - timedelta(hours=2)

    range_s = (end_dt - start_dt).total_seconds()

    # ── Choose granularity ────────────────────────────────────────────────────
    if range_s <= 3 * 3600:
        granularity = "minute"
        trunc_sql   = "minute"
        bucket_min  = 1
        delta       = timedelta(minutes=1)
    elif range_s <= 24 * 3600:
        granularity = "minute10"
        trunc_sql   = "minute"
        bucket_min  = 10
        delta       = timedelta(minutes=10)
    elif range_s <= 7 * 24 * 3600:
        granularity = "hour"
        trunc_sql   = "hour"
        bucket_min  = 60
        delta       = timedelta(hours=1)
    else:
        granularity = "day"
        trunc_sql   = "day"
        bucket_min  = 0
        delta       = timedelta(days=1)

    # ── Query ─────────────────────────────────────────────────────────────────
    rows = (
        db.query(
            func.date_trunc(trunc_sql, models.Order.created_at).label("bucket"),
            func.count(models.Order.id).label("count"),
            func.sum(models.Order.total_price).label("revenue"),
        )
        .filter(models.Order.created_at >= start_dt, models.Order.created_at <= end_dt)
        .group_by(text("bucket"))
        .order_by(text("bucket"))
        .all()
    )

    # ── Build lookup (applying sub-bucket rounding when needed) ───────────────
    by_bucket: dict = {}
    for r in rows:
        b = _naive(r.bucket)
        if trunc_sql == "minute" and bucket_min > 1:
            b = b.replace(minute=(b.minute // bucket_min) * bucket_min, second=0, microsecond=0)
        else:
            b = b.replace(second=0, microsecond=0) if trunc_sql == "minute" else b.replace(microsecond=0)
        if b not in by_bucket:
            by_bucket[b] = {"count": 0, "revenue": 0.0}
        by_bucket[b]["count"]   += r.count
        by_bucket[b]["revenue"] += float(r.revenue)

    # ── Align start to bucket boundary ────────────────────────────────────────
    if trunc_sql == "minute":
        bm = bucket_min
        current = start_dt.replace(second=0, microsecond=0)
        current = current.replace(minute=(current.minute // bm) * bm)
    elif trunc_sql == "hour":
        current = start_dt.replace(minute=0, second=0, microsecond=0)
    else:
        current = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Generate complete series with zeros for missing buckets ───────────────
    result = []
    while current <= end_dt and len(result) < 500:
        entry = by_bucket.get(current, {"count": 0, "revenue": 0.0})
        result.append({
            "ts":      current.isoformat() + "Z",   # UTC ISO → browser formats in local time
            "count":   entry["count"],
            "revenue": round(entry["revenue"], 2),
        })
        current += delta

    return {"granularity": granularity, "data": result}


@app.get("/stats/daily")
def stats_daily(
    start: Optional[str] = None,
    end:   Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Orders and revenue per calendar day — all days filled (no gaps)."""
    now = datetime.now()
    filters, start_dt, end_dt = _order_filters(start, end, now)

    if start_dt is None:
        first = db.query(func.min(models.Order.created_at)).scalar()
        start_dt = _naive(first) if first else now

    rows = (
        db.query(
            func.date_trunc("day", models.Order.created_at).label("day"),
            func.count(models.Order.id).label("count"),
            func.sum(models.Order.total_price).label("revenue"),
        )
        .filter(*filters)
        .group_by(text("day"))
        .order_by(text("day"))
        .all()
    )

    by_day = {_naive(r.day).date(): {"count": r.count, "revenue": round(float(r.revenue), 2)}
              for r in rows}

    # Fill all days in range
    result   = []
    cur_day  = start_dt.date()
    end_day  = end_dt.date()
    while cur_day <= end_day and len(result) < 366:
        entry = by_day.get(cur_day, {"count": 0, "revenue": 0.0})
        result.append({"date": cur_day.isoformat(), **entry})
        cur_day += timedelta(days=1)

    return result


@app.get("/stats/hourly")
def stats_hourly(
    start: Optional[str] = None,
    end:   Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Order distribution per hour-of-day (0–23), filtered by range."""
    now = datetime.now()
    filters, _, _ = _order_filters(start, end, now)

    rows = (
        db.query(
            func.extract("hour", models.Order.created_at).label("hour"),
            func.count(models.Order.id).label("count"),
            func.sum(models.Order.total_price).label("revenue"),
        )
        .filter(*filters)
        .group_by(text("hour"))
        .order_by(text("hour"))
        .all()
    )
    by_hour = {int(r.hour): {"count": r.count, "revenue": round(float(r.revenue), 2)}
               for r in rows}

    distinct_days = db.query(
        func.count(func.distinct(func.date_trunc("day", models.Order.created_at)))
    ).filter(*filters).scalar() or 1

    return [
        {
            "hour":        h,
            "label":       f"{h:02d}h",
            "count":       by_hour.get(h, {}).get("count",   0),
            "revenue":     by_hour.get(h, {}).get("revenue", 0.0),
            "avg_count":   round(by_hour.get(h, {}).get("count",   0) / distinct_days, 2),
            "avg_revenue": round(by_hour.get(h, {}).get("revenue", 0.0) / distinct_days, 2),
        }
        for h in range(24)
    ]


@app.get("/stats/products")
def stats_products(
    start: Optional[str] = None,
    end:   Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Product statistics filtered by date range."""
    now = datetime.now()
    filters, _, _ = _order_filters(start, end, now)

    subq = (
        db.query(
            models.Order.product_id,
            func.sum(models.Order.quantity).label("total_quantity"),
            func.sum(models.Order.total_price).label("total_revenue"),
        )
        .filter(*filters)
        .group_by(models.Order.product_id)
        .subquery()
    )

    rows = (
        db.query(
            models.Product.id,
            models.Product.name,
            func.coalesce(subq.c.total_quantity, 0).label("total_quantity"),
            func.coalesce(subq.c.total_revenue,  0).label("total_revenue"),
        )
        .outerjoin(subq, subq.c.product_id == models.Product.id)
        .order_by(models.Product.name)
        .all()
    )
    return [
        {
            "product_id":     r.id,
            "name":           r.name,
            "total_quantity": int(r.total_quantity),
            "total_revenue":  round(float(r.total_revenue), 2),
        }
        for r in rows
    ]


@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:
        db_status = "unreachable"
    return {"status": "ok", "database": db_status}
