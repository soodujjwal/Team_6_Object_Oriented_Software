# Iteration 3 — Integrated financial tracking

This iteration connects manual entries, Plaid imports, shared bills, repayments, account balances, budgets, reports, and recurring bills.

**MongoDB follow-up:** The active application database has since switched to MongoDB Atlas, with a fresh registration database. The SQLite migration notes below describe the initial Iteration 3 implementation and legacy backup path. Application requests no longer use SQLite. See [MongoDB setup](../mongodb-setup.md) for current configuration and verification.

## Implemented behavior

1. **Manual/Plaid reconciliation.** Posted imports are matched against unlinked entries with the same account, amount, direction, and dates within three days. An exact merchant match is automatic only when the pairing is unique on both sides. Other possible duplicates appear in Transactions for explicit confirmation. Matching preserves the manual transaction ID and existing split bill references.
2. **Existing split bill charges.** Payment & repayments can select an existing matching expense instead of creating another debit. The server checks ownership, account, amount, posting status, and prior allocation. A payment cannot belong to two bills. Unlinking a bank charge preserves the bank transaction.
3. **Repayment history.** Add multiple partial payments, select the receiving account/date, or confirm an existing incoming transaction against a specific friend and bill. Candidate payments prioritize matching names and remaining amounts. Each payment has a persistent history entry and a retry key. Unlinking an imported repayment keeps the bank transaction. Outstanding amounts and overpayments are shown per friend.
4. **Bank and estimated balances.** Accounts show the last bank-reported current balance, bank available balance when provided, snapshot fetch time, unmatched manual movement, and estimated balance. Estimated balance equals bank-reported current balance plus unmatched manual movement. Bank pending entries are not added again. Friends' debts appear separately on Dashboard. The snapshot fetch time does not guarantee that the institution's underlying data is fresh.
5. **Consistent reporting.** Bank debits remain their full amounts; split bill expenses use the user's allocated share in budgets, reports, dashboard totals, and affordability calculations. Repayments are reimbursements, rather than salary. Own-account transfer legs are excluded from regular income/spending. Pending and removed bank entries are excluded from reports. Bank annotations can be edited while physical bank facts remain controlled by sync. Shared update events and a 15-second Plaid-status check refresh relevant screens after sync.
6. **Recurring bank payments.** Posted Plaid payments use the same recurring matching logic as manual entries. Matching checks account, exact amount, merchant/name, and due-date window. A matching payment records the paid date and advances the due date once. Removal or modification of the most recently matched payment restores the previous recurring state before reevaluation.

## Data preservation and ownership

- Startup adds the necessary SQLite columns and backfills existing split bill classifications and transfer legs. Existing login records remain in place.
- Before the first financial schema migration, the app backs up an existing SQLite database to `.vite/database-backups/before-iteration3-<timestamp>.sqlite3`, beside the database. Backups contain the same sensitive data as the database and should stay local.
- Authenticated account, transaction, recurring transaction, report, and matching queries use the current user's account ownership. Existing Plaid accounts inherit ownership from their connection. Legacy manual accounts are assigned automatically only if exactly one user exists; ambiguous ownership is not guessed.
- Plaid credentials stay server-side. This iteration does not add collection of bank usernames, bank passwords, routing numbers, or full account numbers. Existing encrypted Plaid tokens and financial records remain necessary for persistent syncing.
- A changed or removed bank payment preserves linked bill history and flags the bill for review. Review such bills in Split Bill; remove repayment links before unlinking/replacing the payment. Dashboard excludes bills needing review from its outstanding-debt total.
- Disconnecting a bank preserves the estimated balance and imported transaction history.

## Demo checklist

1. Add an expense to a connected account. Check that the bank-reported balance stays unchanged while the estimated balance changes.
2. Sync the corresponding posted bank transaction. Verify automatic matching for an exact, unique merchant match, or confirm the suggestion in Transactions. There should be one payment record.
3. Save a split bill and open Payment & repayments. Choose an existing charge for the full bill amount. Check that no second debit appears.
4. Add two partial repayments for a friend. Check their history and remaining amount. Link an incoming bank transaction and verify that it does not add money a second time.
5. Compare Dashboard, Budgets, Monthly Report, and Transactions. Transactions shows the full bank movements; personal spending uses only the user's share and excludes repayments and own-account transfers.
6. Sync a posted payment for an existing recurring bill. Verify the last-paid date and next due date. Repeating sync must not advance it again.

## Run locally

From the project root, open two PowerShell terminals.

Backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173. Restart an existing backend after updating the source so the schema migration runs.

## Validation commands

Verified in this implementation: **70 backend tests passed**, **19 frontend tests passed**, and **the frontend production build passed**. Windows sandbox Application Control blocked a SQLAlchemy DLL, so backend verification ran outside the sandbox. The suite emits one existing Starlette/httpx deprecation warning. No real-bank transactions were used for verification.

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

```powershell
cd frontend
node --test tests/*.test.mjs
npm run build
```

The integration suite uses simulated Plaid responses and temporary databases. It covers matching before/after manual entry, ambiguous matches, pending-to-posted transitions across pages, split charge linking, partial repayments, retry protection, reversals, recurring matching, user isolation, real API authentication, transfer matching, disconnect preservation, and repeatable migration. It does not establish that a real financial institution has delivered a new transaction.

## Operational limits

Plaid Transactions updates are asynchronous. Production automatic updates require a publicly reachable, configured `PLAID_WEBHOOK_URL`; a localhost server cannot receive internet webhooks by itself. The app's Sync control can fetch updates already available from Plaid. The app records and reconciles payments; these actions do not initiate bank transfers. Uncertain repayment identity always requires user confirmation. PostgreSQL migration and deployment are outside this iteration.

References: [Plaid transaction updates](https://plaid.com/docs/transactions/), [pending and posted states](https://plaid.com/docs/transactions/transactions-data/), [cached account balances](https://plaid.com/docs/api/accounts/#accounts-get).

## Suggested iteration summary

Iteration 3 integrated Plaid imports with manual transactions, split bill payments, and repayment tracking. It added transaction reconciliation to prevent duplicates, linked existing charges to shared bills, introduced partial repayment history and confirmed incoming-payment matching, and separated bank-reported balances from estimates and outstanding debts. Budgeting and reporting now use consistent personal-spending classifications, and posted bank transactions can update recurring bill payment status and due dates. Automated regression tests validate calculations, ownership restrictions, migration, and synchronization behavior.
