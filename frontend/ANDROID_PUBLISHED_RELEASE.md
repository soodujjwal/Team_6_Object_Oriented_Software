# Android 1.0.4 — Recurring Transactions presentation

- Download: https://finance-builder.vercel.app/download
- APK: https://github.com/soodujjwal/Team_6_Object_Oriented_Software/releases/download/android-v1.0.4/Finance-Builder-1.0.4.apk
- Application ID `financebuilder.app.com`; version `1.0.4`, code `5`; Android 7.1+ / SDK 25.
- Size **5,762,352 bytes**; SHA-256 `6D68113CB2022470E965AD482DE469BA24302A6539BF6839C3FFBE21A98C8670`.
- Permanent signing certificate unchanged.

Adds four data-backed summary cards and responsive subscription/upcoming sections. The page inherits the shared application background; cards remain distinct. Bill creation, editing, deletion and reminders use existing APIs. No backend or schema changes.

Validation: frontend 88 passed; production TypeScript/Vite build and targeted lint passed. Browser tests at 390, 768, 1280 and 1920px verified bill create/edit/delete, empty-state navigation, summary updates, no overflow and shared background consistency with Home, Accounts and Budgets. Android release build, lint, signature and manifest checks passed. Download checks: 7 passed. The owner reports successful Plaid linking on an unspecified earlier APK; no fresh physical installation of 1.0.4 is claimed.

Install over the existing signed release without clearing data. Automatic update prompts remain deferred.

---
# Android 1.0.3 — restore Recurring Transactions

- Download: https://finance-builder.vercel.app/download
- APK: https://github.com/soodujjwal/Team_6_Object_Oriented_Software/releases/download/android-v1.0.3/Finance-Builder-1.0.3.apk
- Application ID `financebuilder.app.com`; version `1.0.3`, code `4`; Android 7.1+ / SDK 25.
- Size **5,758,751 bytes**; SHA-256 `0D2A0B3BCD7C16F642FF2561E663F06B112259A1F2D9EF6F38B06BBCBAC7C050`.
- Same signing certificate: `3689d33f418a5408c4d1a7ca24c2bb7ce2abe8d8a6756b0fbd1226f0f0d4761f`.

Restores **More → Recurring Transactions** and the matching Transactions-page shortcut. The existing page shows detected subscriptions and estimated monthly cost from synced bank transactions, plus saved bill reminders. These are transaction-based estimates; this change does not enable or call Plaid's optional Recurring Transactions add-on. Saved bills remain usable when bank-status/subscription loading fails, with separate retry controls. Disconnected users can navigate directly to Accounts. Existing creation, editing, deletion, bank syncing, and financial calculations are preserved. No backend, database schema, or dependency changed.

Validation: full publication frontend suite **81 passed**, including navigation, subscription totals, bill create/edit/delete, partial-failure retry, and disconnected-bank navigation. Production TypeScript/Vite build and targeted lint passed (automatic-JSX compatibility overrides); Android release build/lint, signature verification, and manifest version checks passed. Download metadata and QR tests are checked after updating the exact artifact metadata. No fresh physical-device installation is claimed for this release.

Install the new signed APK over the existing release, then open **More → Recurring Transactions**. Website users can open it after the production deployment and refresh. No Render configuration change is required. Earlier APKs keep their bundled menu until updated.

---
# Android 1.0.2 — native Plaid and refresh performance

- Download page: https://finance-builder.vercel.app/download
- APK: https://github.com/soodujjwal/Team_6_Object_Oriented_Software/releases/download/android-v1.0.2/Finance-Builder-1.0.2.apk
- Application ID: `financebuilder.app.com`; version `1.0.2` (code `3`); minimum Android **7.1 / SDK 25**.
- Size: **5,758,371 bytes**.
- SHA-256: `B2AA7AB9CC02D9E23F9D92AA6D340A0C8841D6C0E1175B575A51797410192CF7`.
- Signing certificate SHA-256: `3689d33f418a5408c4d1a7ca24c2bb7ce2abe8d8a6756b0fbd1226f0f0d4761f` (same permanent key).
- Local APK: `frontend/build/android-release/Finance-Builder-1.0.2.apk`, with `.sha256` sidecar.

This release adds the official Plaid Android SDK 6.4.0, a Capacitor bridge, Android-package-specific Link tokens, cancellation/error/session-change guards, shared owner-scoped status polling, and coalesced dashboard/notification refreshes. The website keeps its web Plaid SDK. No financial calculation, bank-token encryption, ownership rule, or Mongo schema changed. See `ANDROID_PLAID.md` for implementation, setup, performance evidence, and targeted phone test instructions.

Executed: backend full suite **147 passed, 39 skipped**; final isolated publication frontend suite **77 passed**; production TypeScript/Vite build; targeted frontend lint with automatic-JSX compatibility overrides; signed mobile build, Android release lint, signature verification, and manifest inspection. Download metadata/QR checks are rerun after updating this exact release metadata. Native Java compilation passed. A OneDrive asset snapshot fix was required for Gradle.

The owner reports testing the earlier APK on their Android phone generally, while explicitly excluding Plaid. This is acknowledged as a user-reported general phone test, not a new native Plaid test. No device was connected to ADB during this release. Completing actual bank authorization and the OAuth return on the new APK remains a phone check. The app remains early access; do not describe mocked success callbacks or token creation alone as an end-to-end bank connection.

Install 1.0.2 over the existing signed app; do not uninstall or clear its data. Existing website accounts and the Render/MongoDB backend are reused. Previous APK assets remain unchanged. Automatic update prompts are not part of this release.

---
# Android 1.0.1 — password security update

- Download page: https://finance-builder.vercel.app/download
- APK: https://github.com/soodujjwal/Team_6_Object_Oriented_Software/releases/download/android-v1.0.1/Finance-Builder-1.0.1.apk
- Application ID: `financebuilder.app.com`; version `1.0.1` (code `2`); Android 7.0+ (SDK 24).
- Size: **4,302,461 bytes**.
- SHA-256: `6EA38FCF3F730D48B88FE2F22E880A4E676BBB30AB285656A75E94F689FDFA28`.
- Signing certificate SHA-256: `3689d33f418a5408c4d1a7ca24c2bb7ce2abe8d8a6756b0fbd1226f0f0d4761f` (same key as 1.0.0).
- Local artifact: `frontend/build/android-release/Finance-Builder-1.0.1.apk` and its `.sha256` sidecar (not committed).

Adds strong-password validation, an interactive local strength meter, confirmation, backend breach checks, Argon2id migration, persistent login throttling, and password-change session revocation. Email verification remains deferred. See `../PASSWORD_SECURITY.md` for policy, setup, dependencies, and migration details.

Executed checks: backend 145 passed / 39 skipped; frontend 71 passed in the original checkout; production TypeScript/web builds passed in both the original and isolated publication checkout; mobile build, Gradle release lint/build, APK v2 signature verification, and manifest version inspection passed. Targeted frontend lint passed with React automatic-JSX compatibility overrides. The estimator dictionary chunk triggers Vite's size warning and is lazy-loaded with registration/settings.

No physical phone is available. No fresh emulator installation or complete native synchronization/Plaid matrix is claimed for 1.0.1. This remains Android early access. Install the new signed APK over release 1.0.0 to update; automatic update prompts are not implemented. Do not uninstall or clear application data as an update step. An incompatible debug signing key cannot be updated by this release.

The download-page QR still opens the permanent `/download` page. Release assets are immutable; 1.0.0 is preserved. Future frontend changes require a newly built, tested, signed APK with a higher versionCode to reach existing installations. Backend changes already affect installed apps.

---
# Published Android early access — November 7, 2026

- Download page: https://finance-builder.vercel.app/download
- Release: https://github.com/soodujjwal/Team_6_Object_Oriented_Software/releases/tag/android-v1.0.0
- APK: https://github.com/soodujjwal/Team_6_Object_Oriented_Software/releases/download/android-v1.0.0/Finance-Builder-1.0.0.apk
- Code pushed to GitHub `main`: `2f6265491d4a6bcde11618cda55e0c3d7e97582f`.
- Application ID: `financebuilder.app.com`; version `1.0.0` (code `1`); minimum Android SDK `24`.
- Signed compact APK size: **3,448,504 bytes**.
- SHA-256: `C3D2E2B10C7228CF7A5C3764DD1A78DA8FC95B0E36A291E573BDD709830C4652`.
- Signing certificate SHA-256: `3689d33f418a5408c4d1a7ca24c2bb7ce2abe8d8a6756b0fbd1226f0f0d4761f`.

## Completed

- Built and signed the compact native layout with the existing release key; APK signature verification passed.
- Reduced native outer gutters to 8px, removed nested page padding and the excessive bottom spacer, reduced card padding, and kept the navigation in its own viewport row. System insets and touch targets remain. Desktop layout is unaffected by these native-only rules.
- Published the APK and checksum as an explicitly labeled GitHub prerelease. Anonymous download returned HTTP 200; downloaded bytes matched the local signed APK's size and SHA-256.
- Pushed the publication source to `main` and `publish/android-download` using an isolated worktree; the original feature checkout and staged Android Studio files were preserved.
- Vercel reported deployment success. Live `/download` returned HTTP 200, and its served module contains the public APK URL, correct size/hash, early-access notice, and permanent download-page QR destination. Its effective APK environment override is empty, so the published release configuration is used.
- Render's live schema contains the new repayment and delete endpoints. `/health` reported application/database `ok`; unauthenticated deletion and repayment-option requests returned HTTP 401.
- Publication frontend tests: 67 passed. Backend: 127 passed, 39 skipped. Production web build and signed mobile build passed.

## Testing limits

The earlier signed core APK installed in an isolated Android emulator and passed `NativeSmokeTest` (bundled login page, native encrypted session write/read, and clear). The longer disposable-account test registered, authenticated, and reached Budgets, then failed `Android Back returns home` while Android System UI was unresponsive. Its cleanup block completed without a reported failure. Do not mark the full navigation, logout, process-restart, or synchronization matrix as passed.

The final compact-layout rebuild was compiled and signature-verified; no complete native or physical-device test is claimed for that rebuilt artifact. No physical Android phone was available. Native Plaid linking remains incomplete; the website and release notes identify the app as early access and direct bank linking to the browser.

## Install

On Android, open the download page, tap **Download for Android**, open the downloaded APK, and approve installation from that source if Android asks. Launch Finance Builder and sign in. A debug installation signed by a different key cannot be updated by this release; do not automatically uninstall another installation or clear its data.

The public binary is hosted as a GitHub release asset, not inside the frontend public directory, so future Capacitor builds do not bundle the APK inside another APK. Future published updates must increase Android versionCode and use a new immutable download asset/version/checksum. Never commit the keystore or signing passwords.


