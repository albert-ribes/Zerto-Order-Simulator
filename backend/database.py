from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://zerto:zerto@db:5432/zerto")

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
