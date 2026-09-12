from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    get_settings().database_url,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_database() -> None:
    from app.repositories import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    migrate_database()


def migrate_database(database_engine=engine) -> None:
    inspector = inspect(database_engine)
    tables = set(inspector.get_table_names())
    if "users" in tables:
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "phone_number" not in user_columns:
            with database_engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE users ADD COLUMN phone_number VARCHAR(14) NOT NULL DEFAULT ''")
                )

    if "accounts" in tables:
        account_columns = {column["name"] for column in inspector.get_columns("accounts")}
        if "bank_name" not in account_columns:
            with database_engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE accounts ADD COLUMN bank_name VARCHAR(100) NOT NULL DEFAULT 'Other'")
                )
        if "phone_number" in account_columns and database_engine.dialect.name == "sqlite":
            with database_engine.begin() as connection:
                connection.execute(text("ALTER TABLE accounts DROP COLUMN phone_number"))
