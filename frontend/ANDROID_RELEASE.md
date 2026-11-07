# Finance Builder Android release

Status: release preparation only. No production deployment or official APK publication has been performed.

## Verified configuration

- React 19 + TypeScript + Vite source in `frontend`.
- Existing Capacitor 8 project in `frontend/android`; configuration is `capacitor.config.json`.
- Confirmed application ID: `financebuilder.app.com`. App name: Finance Builder.
- `versionName`: `1.0.0`; `versionCode`: `1`. Increase versionCode for every distributed update.
- Production frontend is bundled from `dist-mobile`, served internally as `https://localhost`; no `server.url`.
- API: `https://finance-builder-api.onrender.com`. MongoDB and Plaid secrets stay on Render.
- Node 24.14.1, Capacitor core/Android/CLI 8.6, Android Studio 2025.2.3, bundled Java 21.0.8, SDK/target 36, minimum SDK 24. Java on the ordinary PATH is version 8 and must not be used for this build.
- Official Capacitor App, Network and SplashScreen plugins. SystemBars uses native insets to keep content outside system bars and avoid double safe-area padding.
- Tokens are persisted only as AES-GCM ciphertext, using a non-exportable Android Keystore key. A native session is hydrated into memory before React starts. Android backup and plaintext HTTP are disabled. Development plaintext sessions are discarded and require a new sign-in.
- Existing backend authentication, record IDs, database schema and financial calculations are retained.

## Build/run (PowerShell, from frontend)

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:VITE_API_BASE_URL = 'https://finance-builder-api.onrender.com'
npm ci
npm test
npm run build
npm run android:sync
npm run android:open
```

Do not run `cap init` or `cap add android` again: the project already exists.

For an emulator/development build:

```powershell
.\build-android.ps1 -Mode Debug
```

Android Studio and the helper select generated outputs under `%LOCALAPPDATA%/FinanceBuilder/android/<project-id>/outputs`, outside OneDrive. The project ID is a stable hash of this checkout path. Project execution history is stored beside it in `gradle-cache`. The helper selects Java 21. Source files stay in the existing repository. An explicit `financeBuildRoot` override remains available for CI.

## Release prerequisites — stop before distributing

1. **Private signing key.** In Android Studio use Build > Generate Signed App Bundle / APK > APK > Create new. Create a permanent keystore outside this repository and keep an encrypted backup. Remember its alias and passwords. Losing the key prevents updates to existing installations. Never share passwords in chat or commit the key. This project does not invent or substitute a release key.
2. **Native Plaid integration.** The existing Plaid connector uses the web JavaScript SDK. Plaid recommends its native Android SDK or Hosted Link for WebView applications; bank OAuth/return navigation must be integrated and tested before an Android release. Register `financebuilder.app.com` under Allowed Android package names in Plaid Dashboard. Native Link tokens must contain that package name. The existing website flow and backend have intentionally been preserved. See https://plaid.com/docs/link/android/ and https://plaid.com/docs/link/hosted-link/ . This is a release blocker, not a verified Android bank-linking flow.
3. **Physical Android testing.** Connect a phone using USB debugging and approve its computer authorization. Run the test matrix below. An emulator build does not satisfy physical installation/QR tests.
4. **Dedicated test account.** Use one isolated account on web and Android. Do not test financial writes with a real bank account or production customer data.

Set these four process environment variables privately on the build machine (do not put them into any VITE_ variable):

- `FINANCE_ANDROID_KEYSTORE`: absolute path to the permanent keystore.
- `FINANCE_ANDROID_STORE_PASSWORD`: keystore password.
- `FINANCE_ANDROID_KEY_ALIAS`: key alias.
- `FINANCE_ANDROID_KEY_PASSWORD`: key password.

Then run:

```powershell
.\build-android.ps1 -Mode Release
```

A successful signed APK is written to `%LOCALAPPDATA%/FinanceBuilder/android/<project-id>/outputs/app/outputs/apk/release/app-release.apk`. The script verifies its certificate and prints its exact byte size and SHA-256. Without signing variables, a normal release build fails with a helpful error. Explicit `-Mode VerifyUnsigned` is only for compilation verification; its `app-release-unsigned.apk` cannot be the official download. No debug/unsigned output is promoted automatically.

## Synchronization and offline behavior

Login/startup use the existing authenticated APIs. A visible session refreshes on foreground, reconnection and every 60 seconds, with overlapping refreshes suppressed. Successful financial mutations invalidate reads and notify related page listeners. Existing Plaid status polling continues; no new SSE/WebSocket server or database migration is introduced. Superseded reads refetch and old-session results are rejected. Identical in-flight writes share a request; writes are never retried automatically. If write confirmation fails, refresh records before retrying.

Disconnected users see "You're offline" instead of editable financial forms. Financial writes fail immediately and are not queued. Existing preference-save retry behavior remains separate from financial record creation. A device with Wi-Fi but no internet can still produce a network/server error rather than a connectivity event; API errors remain visible.

## Website download and QR

`/download` retains the existing design/mockup and Continue in browser action. Its real locally generated QR opens the permanent destination `https://finance-builder.vercel.app/download`, including before launch; the page clearly says Coming soon until a real APK is configured. Android phones see the primary action in the hero; iOS users see an Android-only message. The QR encoder uses the existing dependency.

After the signed APK passes physical testing, manually upload it to public HTTPS release hosting. Confirm it returns APK bytes without login or an HTML error page. Then configure Vercel:

```dotenv
VITE_ANDROID_APK_URL=<actual direct HTTPS signed APK URL>
VITE_ANDROID_APK_VERSION=<verified versionName>
VITE_ANDROID_APK_SIZE_BYTES=<exact file length>
```

These values are public metadata. Never add keystore, JWT, database or Plaid secrets. A new website deployment is required to publish these values; no deployment is performed by the build script. Scan the QR on a physical phone, download, compare SHA-256 and install the exact hosted file before announcing availability.

## Release test matrix (not marked complete by this guide)

- Registration and login; restart and encrypted-session restoration; expiry/logout/account deletion.
- Dashboard, Accounts, manual account wizard, Transactions, Budgets, Goals, Split Bill, Afford, Reports and Settings at phone widths. Verify keyboard, dropdowns, dialogs, scrolling, Android Back, safe areas and no horizontal overflow.
- A: Create an account on web; verify the same record on Android.
- B: Add one transaction on Android; verify exactly one record on web.
- C: Update a savings goal on web; verify Android after resume and controlled polling.
- D: Disable internet; confirm offline message and rejected financial writes; restore internet.
- E: Close/reopen Android; verify secure authentication and fresh data.
- F: Scan QR on a physical phone, download the hosted signed release and install.
- Plaid: native bank linking, OAuth handoff/return, cancel/retry, sync and disconnect using approved test configuration.

Only executed results should be recorded in the delivery report. No signed APK, physical-device test or production bank-linking test is implied by a successful web build.

## Android Studio file-lock recovery

If a previous build reports `AccessDeniedException` while cleaning files under OneDrive, sync the Gradle project and run again. The settings now use a local project cache and output directory for normal Studio builds as well as terminal builds; old generated artifacts are left intact. The first build in the new cache recompiles native modules. A debug APK is under `outputs/app/outputs/apk/debug/app-debug.apk` in the local cache root above. Emulator connection timeouts are separate from compilation errors; cold-boot the selected emulator from Device Manager if it stops responding.
