# Android bank linking and refresh performance

## Integration

Android uses the official `com.plaid.link:sdk-core:6.4.0` through the locally registered Capacitor `FinancePlaid` plugin. `PlaidLinkActivity` is a private lifecycle owner for Plaid's `OpenPlaidLink` activity-result contract. It registers before creation and does not reopen a used token on activity recreation. SDK-provided manifest entries handle bank OAuth redirects. The app sends only an ephemeral Link token into the SDK and returns the public token and institution name/ID to the existing authenticated backend exchange endpoint. It stores no bank passwords and logs no tokens.

The website retains its current web SDK flow. Android does not inject the Plaid web SDK into the Capacitor WebView. It requests `POST /plaid/link-token` with `{ "platform": "android" }`; the backend adds the fixed `android_package_name: financebuilder.app.com`. Missing/empty bodies still mean web, preserving existing clients. Unsupported platform values are rejected. Both routes preserve the existing transactions product, user ID, webhook configuration, exchange/import, token encryption, account ownership, and manual-versus-Plaid rules. No Mongo schema or financial calculation changed.

The UI prevents concurrent launches, exchanges only on success, handles cancellation without creating records, enables retry on errors, and rejects a returning connection if the authenticated session changed while Link was open. A killed WebView/process may require retrying Link; a fresh full process-death/recovery matrix is not claimed.

## Required setup

The owner confirmed that **`financebuilder.app.com`** was saved in [Plaid API settings](https://dashboard.plaid.com/developers/api) under **Allowed Android package names**. This must match the app's existing application ID exactly. Keep the existing Render Plaid credentials and production HTTPS API. No Plaid secret belongs in Vercel or Android. No new email provider, custom domain, or database migration is needed.

Deploy the backend and website source from the publication commit before installing the new APK. Android 1.0.2 has versionCode 3 and requires Android 7.1+ (SDK 25), matching the official SDK's minimum. It uses the existing permanent signing certificate, allowing an update over earlier signed releases without uninstalling or clearing data. Older APKs keep their bundled frontend and do not gain native linking automatically.

Build with the existing private key:

```powershell
cd frontend
.\android\sign-release.ps1
```

Passwords are entered privately or supplied through existing protected environment handling. The build helper materializes a plain asset snapshot outside OneDrive before Gradle reads it; Gradle outputs remain in local AppData. It never substitutes a debug key for release signing.

## Performance changes

- App shell and bank panel share one owner-scoped in-memory status poller instead of separate 15-second timers. Connected accounts poll every 30 seconds; accounts without connections every 60 seconds. Foreground, reconnect, and tracking-mode changes request a fresh status. Hidden/offline states perform no background fetch; transient failures back off to two minutes. The last subscriber removes timers/listeners, and old-owner responses cannot update a new session. No financial data is persisted in this poller.
- Dashboard and notifications coalesce bursts of refresh events into one read batch. Changes arriving during an active batch trigger exactly one follow-up, preserving freshness. This prevents the existing multi-event publication from immediately repeating dashboard loads. Queue disposal prevents work after unmount.
- Existing parallel section loading, in-flight API read sharing, secure native sessions, online-only writes, and refresh-after-update behavior remain intact. No artificial balances/history or offline financial mutation queue was added.

These are verified request-count reductions, not an end-to-end latency benchmark. Render free-instance cold starts and network latency can still delay startup. The lazy zxcvbn dictionary chunk still produces Vite's existing size warning.

## Tests and remaining phone check

The existing full backend suite passed 147 tests with 39 skipped. The original frontend checkout passed 78 tests before an additional session-owner guard; its focused suite including that guard passed. The isolated publication checkout passed all 77 tests in the complete final frontend suite. Tests cover native success/cancel/error, duplicate callbacks and clicks, returning after a user switch, unchanged web linking, fixed-package Link token requests, manual/Plaid restrictions, refresh burst coalescing, shared polling, offline pause, cleanup, and response isolation. These tests use synthetic data and mocked SDK/API boundaries; they do not prove a bank connection on a physical phone.

The owner reports testing the existing APK on an Android phone generally, but explicitly had not tested Plaid. That general phone test is acknowledged. The new native Plaid flow still needs this targeted check:

1. Install signed 1.0.2 over the existing signed APK and sign in.
2. Open **Accounts**. If this is a new/empty Finance Builder account, choose **Connect with Plaid**; existing Plaid users can use **Bank Sync → Connect Bank**. Manual-tracking accounts must resolve their existing mode under the current rules; do not delete accounts merely to test.
3. Complete bank authorization in Plaid, including the bank app/browser handoff when offered. Verify return to Finance Builder, bank accounts, balances, and imported transactions. Verify the same records appear on the website.
4. Cancel once and retry; cancellation must not add accounts. Reopen the app and verify the saved connection. Do not reconnect an already linked bank just to check synchronization; use **Sync Now** for that.

References: [Plaid Android integration and package registration](https://plaid.com/docs/link/android/), [official SDK sample](https://github.com/plaid/plaid-link-android), [OAuth guidance](https://plaid.com/docs/link/oauth/).
