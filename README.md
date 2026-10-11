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
- Savings/Checking account types and atomic Savings-to-Checking transfers
- Income and expense transaction CRUD
- Monthly category budget CRUD with usage calculations
- Savings goal CRUD with progress calculations
- Recurring transaction CRUD
- Budget alerts for near-limit and over-limit budgets
- Monthly reports
- "Can I Afford It?" affordability check

## Move Funds

Settings shows **Move Funds** when at least one account has the Savings type. Select an existing Savings source and Checking destination, enter a positive amount up to the available Savings balance, and optionally add a note. A Checking account must exist before submitting.

Transfers are recorded in a separate ledger (`GET /transfers`, `POST /transfers`) and included in account balances without changing income, expenses, budget usage, or report totals. Successful transfers refresh the financial views. Accounts referenced by transfers cannot be deleted, preserving the ledger and the other account's balance.

On backend startup, existing names containing “Savings” or “Checking” are classified automatically. Other accounts keep the Other type; their type can be changed using Edit in Settings. Renaming an account preserves its type.

## Split Bill

Open **Split Bill** from the navigation menu. Enter items manually or scan a JPG, PNG, WebP, or BMP receipt. Scanning uses [Tesseract.js](https://github.com/naptha/tesseract.js) in the browser; the first scan downloads OCR resources and requires internet access. Review the image and recognized text before applying the result. Scanned amounts are treated as line totals with quantity 1 to avoid guessing unit prices; quantities and prices can then be edited.

Add or select saved friends, check each item's participants, and enter tax, tip, and the final receipt total including tip. Shared items are divided equally among selected people; tax and tip are proportional to their item subtotals. Deterministic cent allocation keeps all shares equal to the final total. Every item must be assigned and the receipt must reconcile before payment can be recorded.

Saving a draft does not change balances. **Record bill as paid** deducts the subtotal and tax from the selected account, plus the tip only when Bank is selected. Record a receipt here only if it has not already been entered/imported as a transaction. Recording the same saved bill twice does not charge twice.

Friends' **Payment received** checkboxes open a confirmation with an editable actual amount. Repayments credit the original paying account as Refund income. Overrides replace the previous received amount, support partial repayments and overpayments, and do not duplicate credits. Unchecking reverses the credit. Editing a paid bill adjusts the original expense while preserving actual repayments. Linked transactions and paying accounts are protected from deletion that would break the bill's records.

Bills and friends are persisted per signed-in user. Bank payments and repayments use existing transaction events to refresh accounts, the dashboard, budgets, and reports. Cash tips are tracked in the split but do not create a bank transaction. Reports show gross bank expenses and repayment income separately.

Run backend checks with `python -m pytest` and frontend calculation/parser checks with `npm run test:split-bill`.

## Run the Frontend

Open a second PowerShell window from the project repo:

```powershell
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://127.0.0.1:5173`.

The frontend now has separate Login and Create Account screens. After login, it stores the JWT locally and sends it with API requests.

## Plaid Bank Sync

Plaid connections are available in **Account Settings → Bank Sync**. The backend exchanges Link's short-lived public token, stores the access token server-side, maps Plaid accounts to local accounts, and incrementally imports added, modified, and removed transactions without duplicates.

Copy the single root environment template and enter your keys there:

```powershell
Copy-Item .env.example .env
notepad .env
cd backend
python -m uvicorn app.main:app --reload
```

The backend loads `PROJECT_ROOT/.env` automatically. Plaid credentials and access tokens never enter the frontend: credentials remain in `.env`, while exchanged access tokens are encrypted in the backend database. Switch `PLAID_ENV` between `sandbox`, `development`, and `production`; use the matching Plaid secret for that environment.

The webhook URL must be public HTTPS; localhost cannot receive Plaid webhooks without a tunnel. The app verifies Plaid webhook signatures, syncs available changes immediately after a `SYNC_UPDATES_AVAILABLE` webhook, and polls connection status in the UI every 15 seconds. **Sync available** imports anything Plaid has already discovered. **Request bank refresh** asks Plaid to check the institution, which may require an eligible Plaid plan and still depends on the institution's update timing.
