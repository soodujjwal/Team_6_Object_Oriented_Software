import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    accounts,
    affordability,
    auth,
    budgets,
    recurring_transactions,
    reports,
    plaid,
    savings_goals,
    transactions,
    transfers,
    split_bills,
    user_state,
)
from app.core.config import get_settings
from app.core.database import create_database, database_health
from app.core.security import get_current_user


def create_app() -> FastAPI:
    create_database()
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "https://localhost",
            "capacitor://localhost",
            *[origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()],
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    protected = [Depends(get_current_user)]
    app.include_router(auth.router)
    app.include_router(user_state.router)
    app.include_router(plaid.webhook_router)
    app.include_router(plaid.router)
    app.include_router(accounts.router, dependencies=protected)
    app.include_router(transactions.router, dependencies=protected)
    app.include_router(transfers.router, dependencies=protected)
    app.include_router(split_bills.router, dependencies=protected)
    app.include_router(budgets.router, dependencies=protected)
    app.include_router(savings_goals.router, dependencies=protected)
    app.include_router(recurring_transactions.router, dependencies=protected)
    app.include_router(reports.router, dependencies=protected)
    app.include_router(affordability.router, dependencies=protected)

    @app.get("/", tags=["system"])
    def root():
        return {
            "message": "Personal Finance Manager API",
            "docs": "/docs",
            "health": "/health",
            "frontend": "http://127.0.0.1:5174" if settings.profile == "plaid-sandbox" else "http://127.0.0.1:5173",
            "environment": settings.profile,
        }

    @app.get("/health", tags=["system"])
    def health_check():
        database = database_health()
        return {"status": "ok" if database["status"] == "ok" else "degraded", "database": database,
                "environment": settings.profile}

    return app


app = create_app()
