from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    accounts,
    affordability,
    auth,
    budgets,
    recurring_transactions,
    reports,
    savings_goals,
    transactions,
)
from app.core.config import get_settings
from app.core.database import create_database
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
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    protected = [Depends(get_current_user)]
    app.include_router(auth.router)
    app.include_router(accounts.router, dependencies=protected)
    app.include_router(transactions.router, dependencies=protected)
    app.include_router(budgets.router, dependencies=protected)
    app.include_router(savings_goals.router, dependencies=protected)
    app.include_router(recurring_transactions.router, dependencies=protected)
    app.include_router(reports.router, dependencies=protected)
    app.include_router(affordability.router, dependencies=protected)

    @app.get("/health", tags=["system"])
    def health_check():
        return {"status": "ok"}

    return app


app = create_app()
