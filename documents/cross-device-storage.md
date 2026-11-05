# Account data across devices

Transactions, accounts, Plaid links/tokens/balance snapshots, budgets, recurring bills, savings goals, and split bills are stored by the authenticated backend in MongoDB. The browser only keeps its login session and theme. Sign in to the same account on another device to retrieve saved finance records.

Authenticated `GET /auth/state` and `PATCH /auth/state/{key}` store onboarding progress/completion, budget preferences, completed goal-month markers, financial goal choices, and import history in a new `user_state` collection. Each entry belongs to a server-authenticated user, with a unique `(user_id, key)` index. API callers cannot supply another user's owner ID. Account deletion removes this state.

The frontend waits for database state before rendering account pages and shows a retry message if loading or saving fails. Pending preference writes trigger a page-close warning and block ordinary sign-out until saved. New-device login restores the saved state. This is persistence across sign-ins, not simultaneous live editing across devices; reload to fetch updates from another device.

Existing users with saved accounts bypass onboarding even if they completed setup before completion was database-backed. Legacy setup entries explicitly named for the signed-in email migrate automatically. Old shared-browser budget preferences, import history, and completed-goal markers need the user's explicit **Import my browser settings** action, so they are not silently attributed to another account. Server values take priority. Browser entries are removed only after a successful migration write.

Deploy the backend before the frontend, or wait for both automatic deployments to finish before testing. After deployment, sign in once on the original browser to migrate old setup data and use the import action if offered. Sign in with the same account in a second browser or device and verify the account, transactions, and settings. No production records were modified during automated verification; tests use a disposable MongoDB mock with independent HTTP clients and database sessions. Live Atlas transaction tests remain opt-in.
