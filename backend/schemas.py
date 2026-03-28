from pydantic import BaseModel, EmailStr
from decimal import Decimal
from datetime import datetime
from typing import Optional, List


# --- Client ---
class ClientBase(BaseModel):
    name: str
    email: EmailStr


class ClientCreate(ClientBase):
    pass


class ClientUpdate(ClientBase):
    pass


class ClientOut(ClientBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Product ---
class ProductBase(BaseModel):
    name: str
    price: Decimal


class ProductCreate(ProductBase):
    pass


class ProductUpdate(ProductBase):
    pass


class ProductOut(ProductBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Order ---
class OrderCreate(BaseModel):
    client_id: int
    product_id: int
    quantity: int = 1


class OrderOut(BaseModel):
    id: int
    client_id: int
    product_id: int
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    created_at: datetime
    client_name: Optional[str] = None
    product_name: Optional[str] = None

    class Config:
        from_attributes = True


# --- Stats ---
class TimelinePoint(BaseModel):
    time: str
    count: int
    revenue: float


class ProductStat(BaseModel):
    product_id: int
    name: str
    total_quantity: int
    total_revenue: float


class Summary(BaseModel):
    total_orders: int
    total_revenue: float
    total_clients: int
    total_products: int
    cumulative_points: list


# --- Generator ---
class GeneratorStatus(BaseModel):
    running: bool
    interval: float


class GeneratorConfig(BaseModel):
    interval: float = 2.0


class BatchDeleteRequest(BaseModel):
    ids: List[int]


# --- Auth ---
class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    is_admin: bool

class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False

class UserUpdate(BaseModel):
    password: Optional[str] = None
    is_admin: Optional[bool] = None

class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    created_at: datetime
    class Config:
        from_attributes = True
