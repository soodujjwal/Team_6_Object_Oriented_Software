# Plaid Sandbox demo

The original app stays at http://127.0.0.1:5173 with its backend at port 8000.
It continues using the root `.env` and its existing database and Plaid connections.

The demo uses http://127.0.0.1:5174, backend port 8001, and the ignored root
`.env.plaid-sandbox`. It shares the app's code and uses a separate MongoDB database,
separate JWT signing key, and separate browser storage (because the port differs).
It only allows Plaid's Sandbox environment. Original users and data are not copied.
You can run both versions at the same time.

## Start the demo

In a PowerShell terminal:

```powershell
cd "C:\Users\Owner\OneDrive - UT Arlington\Desktop\CSE 3311 - Software Object Oriented\Team_6_Object_Oriented_Software\backend"
.\.venv\Scripts\python.exe run_plaid_sandbox.py
```

In a second PowerShell terminal:

```powershell
cd "C:\Users\Owner\OneDrive - UT Arlington\Desktop\CSE 3311 - Software Object Oriented\Team_6_Object_Oriented_Software\frontend"
npm run dev:sandbox
```

Open http://127.0.0.1:5174. The green banner identifies the demo environment.
The API health check is http://127.0.0.1:8001/health and its docs are at
http://127.0.0.1:8001/docs. Press Ctrl+C in each terminal to stop the demo.

## Demonstrate test banks

1. Create a new app account in the demo. Original app logins are separate.
2. Choose the bank connection option during onboarding, or go to
   **Account Settings → Bank Sync → Connect bank**.
3. Choose a test institution in Plaid Link, such as First Platypus Bank.
4. Enter Plaid test-bank username `user_good` and password `pass_good`.
5. Select the accounts and finish Link. Accounts and transactions import into the
   sandbox database. Use the normal budgets, reports, and transaction screens.

For a richer transaction demo, Plaid also supports `user_transactions_dynamic`
with any nonblank password at a non-OAuth test institution. See the official
[test credentials](https://plaid.com/docs/sandbox/test-credentials/).
Internet access to MongoDB Atlas and Plaid is required.

## Configure on another computer

Copy `.env.plaid-sandbox.example` to `.env.plaid-sandbox`. Set the Atlas URI,
Plaid client ID, and **Sandbox** secret. Generate a unique JWT signing secret of
at least 32 characters. Choose a database name ending in `_plaid_sandbox` that
differs from the original app database. Give the Atlas user access to that database.
Leave the webhook URL empty for local demos; manual sync still works.
Install the normal project dependencies if they are not already installed.

Never put backend credentials in a frontend environment file. Keep the sandbox
JWT key stable between restarts so saved Plaid access tokens remain decryptable.
Demo edits persist between restarts. Disconnect demo banks or delete demo data
through the sandbox app as needed; there is no automatic reset of either database.
