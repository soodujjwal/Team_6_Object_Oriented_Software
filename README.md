# Personal Finance Manager

Backend-first implementation for Team 6's CSE 3311 Personal Finance Manager.

## Backend Stack

- Python 3.11 or newer
- FastAPI
- SQLAlchemy
- SQLite
- pytest

## Run the Backend

From the course folder, first enter the project repo:

```powershell
cd "Team_6_Object_Oriented_Software"
```

Confirm Python is installed:

```powershell
py --list
```

If Python 3.11 or newer is not listed, install Python from https://www.python.org/downloads/ and make sure the installer option to add Python to PATH is enabled.

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.
Interactive API docs are available at `http://127.0.0.1:8000/docs`.

If dependencies were already installed before the JWT login work, run this again inside the activated backend virtual environment:

```powershell
python -m pip install -e ".[dev]"
```

## Run Tests

```powershell
cd "Team_6_Object_Oriented_Software"
cd backend
python -m pytest
```

## Current Backend Features

- JWT registration and login
- Protected finance API endpoints using `Authorization: Bearer <token>`
- Account CRUD with computed current balance
- Income and expense transaction CRUD
- Monthly category budget CRUD with usage calculations
- Savings goal CRUD with progress calculations
- Recurring transaction CRUD
- Budget alerts for near-limit and over-limit budgets
- Monthly reports
- "Can I Afford It?" affordability check

## Run the Frontend

Open a second PowerShell window from the project repo:

```powershell
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://127.0.0.1:5173`.

The frontend now has separate Login and Create Account screens. After login, it stores the JWT locally and sends it with API requests.
