from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os

_url = os.getenv("DATABASE_URL", "postgresql://zerto:zerto@db:5432/zerto")
# Force psycopg2 dialect (SQLAlchemy 2.1+ prefers psycopg3 for bare postgresql://)
DATABASE_URL = _url.replace("postgresql://", "postgresql+psycopg2://", 1) if _url.startswith("postgresql://") else _url

engine = create_engine(
    DATABASE_URL,
    pool_timeout=5,
    pool_pre_ping=True,
    connect_args={
        "connect_timeout": 5,
        "options": "-c statement_timeout=5000",
    },
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
