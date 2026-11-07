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

