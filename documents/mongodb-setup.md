# MongoDB Atlas setup

The app's active database is MongoDB Atlas. The FastAPI routes and React API contract are preserved. New users register in MongoDB; SQLite users and finance records are not imported, following the decision to start fresh. The old `backend/finance_manager.db` is retained as a local legacy backup, rather than deleted.

## Configuration

Keep the following keys in the project root `.env` or the hosted backend's secret environment:

```dotenv
MONGODB_URI=mongodb+srv://DATABASE_USER:ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=finance_builder
```

Use the Atlas **database user** password. It is different from the Atlas website login. If the database password is unknown, set a new one in Database Access. Special characters in a URI password must be percent-encoded. The app's local connection string was configured privately; do not copy it into documents, frontend source, commits, screenshots, or messages.

The backend machine must be allowed in Atlas's IP access list. Use the machine's actual outbound address, or the hosting provider's documented outbound addresses. No public Atlas Data API or browser-side database connection is used.

Missing or invalid credentials return a setup error; the app never silently falls back to SQLite. `/health` reports the MongoDB engine and whether the connection is healthy. Startup creates collections and indexes, without deleting existing MongoDB records.

## Storage and consistency

- Application collections: `users`, `accounts`, `transactions`, `transfers`, `friends`, `split_bills`, `budgets`, `savings_goals`, `recurring_transactions`, `plaid_items`, `plaid_account_links`, and `plaid_transaction_links`.
- Internal collections: `_counters` keeps integer IDs compatible with the frontend, and `_allocations` enforces one bill/repayment allocation per transaction.
- Money is stored as BSON Decimal128 and normalized to two decimal places, avoiding binary floating-point storage for balances.
- MongoDB sessions and transactions make related writes atomic. Financial lock operations update document revisions, so simultaneous requests conflict safely. Unique indexes protect emails, budgets, bank identifiers, and payment allocations. Conflicts return a refresh/retry response.
- Updates use revision checks to avoid overwriting another request's changes. An unresolved commit confirmation asks the user to refresh before retrying.
- CSV/manual bulk inserts allocate IDs and insert documents in batches. User, account, and parent references are checked before writes.
- User ownership is enforced for accounts, transactions, transfers, budgets, goals, recurring bills, friends, split bills, and bank connections. Passwords remain hashed, and Plaid access tokens remain encrypted on the backend.
- SQLAlchemy is retained for typed record metadata and legacy regression tests. `mongo_store.py` translates the finance services' supported record predicates into native MongoDB filters. It does not execute SQL or persist a local database mirror.
- Read-only transactions are released while waiting for Plaid transaction pages. The connection's sync cursor is checked again under a MongoDB write lock before importing changes.

## Run

Backend terminal, from the project root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend terminal:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173 and create a new app account. The database is online; these commands still run the backend and frontend locally. A shared public application also needs backend/frontend hosting. Multiple backend instances must use the same application encryption secret to read the same encrypted Plaid tokens.

## Verify

Verified with the configured Atlas cluster: **117 backend tests passed, 7 intentionally skipped**. This includes 25 live Atlas cases for persistence, registration/login, user isolation, Plaid reconciliation, repayments, transfers, rollback, and concurrent allocation protection. Skips cover SQLite-only migration cases on MongoDB and server transaction cases on the in-memory mock. The production app's `/health` also reported MongoDB `ok`; unauthenticated access to accounts returned HTTP 401. No test users were inserted into the actual application database.

From `backend`, the ordinary suite runs legacy SQLite checks and in-memory MongoDB comparisons. Atlas tests are skipped unless explicitly enabled:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

To run the live checks using the configured Atlas connection:

```powershell
$env:FINANCE_MONGO_LIVE_TESTS = "1"
.\.venv\Scripts\python.exe -m pytest -q
Remove-Item Env:\FINANCE_MONGO_LIVE_TESTS
```

Live tests create random `finance_builder_test_<suffix>` databases and remove only those databases afterward. They do not insert test users or banking data into the actual `finance_builder` database. Their cleanup asserts the test database name prefix. In-memory tests cannot verify server transaction or write-conflict behavior, so rollback and concurrent financial updates also have real Atlas checks.

Plaid data used in these tests is simulated. The tests establish MongoDB persistence and the app's reconciliation logic, not that a financial institution has supplied a new live transaction. Automatic bank updates still require a public HTTPS Plaid webhook.

Official references: [PyMongo transactions](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/crud/transactions/), [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).
