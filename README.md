# Personal Finance Manager

## Vision Statement
Personal Finance Manager’s vision is to develop an easy-to-use and realistic financial management tool that would help people to make wiser choices with respect to their finances. It will turn basic financial data into valuable information by informing users of how much money they have at their disposal, how much they spend, how close they are to their budgets, and what progress they achieve in saving money.

## Run the included demo with uv

This project uses uv for the python backend. The backend's `pyproject.toml` sets up runtime and development dependencies, and `.python-version` selects Python 3.12 for the project. uv manages Python and creates `backend/.venv` automatically. A compiled frontend is included in `frontend/dist`, so **Node is not required just to try the demo**. From this project folder, run:

```powershell
uv sync --directory backend
uv run --directory backend uvicorn app.main:app --host 127.0.0.1 --port 8000 # Or a port of your choice
```

Open **http://127.0.0.1:8000**, leave the terminal running; Ctrl+C stops the server.

The uv commands are the same on Windows, macOS, and Linux. First setup needs internet access for any missing Python version and packages. If you are already inside `backend`, omit `--directory backend`. Development dependencies are installed by default. `requirements.txt` remains available for pip users; `pyproject.toml` is the primary uv configuration.

## Run tests

From the project folder after the setup above:

```powershell
uv run --directory backend pytest -q
```

The 46 tests cover currency precision, invalid amounts, exact-balance and insufficient-fund checks, transaction validation, income/expense effects, overdrafts, reset, and API integration. Every API test starts with fresh demo data.

## Edit or rebuild the frontend

Requires Node.js 22.12+ and pnpm 11.25.0. If needed, install pnpm with `npm install -g pnpm@11.25.0`.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm run build
# If issues occur with just pnpm, do npx pnpm <command>
```

Restart the backend and reload the browser after rebuilding. For development, start the backend on port 8000, then run `pnpm dev` in `frontend` and open http://127.0.0.1:5173. Vite forwards `/api` requests to the backend. Use the backend URL on port 8000 for the compiled demo; `vite preview` alone does not provide the API.

## Iteration 1 prototype boundaries

- Iteration 1 targets two related features, basic income/expense logging and an affordability check on a desired purchase.
- Data is in server memory, with **one shared account per server process**. Restarting resets it; browser reloads do not. Run one worker. Separate classmates should run their own copy for independent data. If multiple tabs use one server, reload to refresh the account summary after another tab changes it.
- The $800 is a fixture for **unpaid upcoming bills** and the $100 is an additional reserve for savings. They are not editable and do not decrease automatically when a bill is paid. Use the log for discretionary expenses/income in this demo. Bill payment matching, recurring schedules, editable budgets, and savings goals are later work.
- The calculator uses current cash and those two reserves. It does not forecast income, estimate daily budgets, or model finance/lease payments.
- Spending may overdraw the demo account: the log records a completed transaction, while the calculator then reports insufficient available money.
- Amounts must be positive, no more than $1,000,000 per entry, and represent whole cents. Past and current dates are accepted; future transactions are rejected. The log supports up to 1,000 entries before reset.
- This is a local class prototype with no login or personal data. The app starts on localhost.

## Credits/Disclaimers
- GenAI (Codex) was used to assist in the creation and development of this project