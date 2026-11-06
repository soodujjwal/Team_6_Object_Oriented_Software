# Android download page

The public `/download` route shares the homepage navigation. It needs no backend changes.
It currently shows **Coming soon** because there is no published release APK configured.
The local `android/app/build/outputs/apk/debug/app-debug.apk` is a development build and is not published by this page.

## Enable the download

1. Finish Android device testing and build a release APK signed with the app's permanent signing key. Keep the key private and backed up; do not commit it.
2. Upload the signed release APK to public HTTPS hosting, such as a GitHub Release asset. Use the direct asset URL, not the release description page. It must work without signing in, on an Android phone. Prefer a stable, versioned URL that does not expire.
3. In the Vercel frontend project's environment variables, set:

   ```dotenv
   VITE_ANDROID_APK_URL=
   VITE_ANDROID_APK_VERSION=
   VITE_ANDROID_APK_SIZE_BYTES=
   ```

   Paste the real public download URL into the first value. The other two are optional: use the exact APK's `versionName` and byte size. For example, get the size with `(Get-Item -LiteralPath 'path-to-your-release.apk').Length` in PowerShell. Leave metadata blank until verified. These values are public frontend configuration; never put server secrets here.
4. Redeploy the Vercel frontend. For local development, use `.env.local` and restart Vite. Updating Vite environment variables requires a new build. When replacing the APK URL, update or clear the metadata at the same time.

Both Android download buttons and the locally generated QR code use the exact same normalized URL. Missing or invalid HTTPS URLs show disabled Coming soon buttons and no QR code. The QR encoder runs locally; no QR service receives the URL.

## Release verification

- Open the direct URL in a private browser window and on an Android phone. Confirm it downloads an APK, not an HTML login/error page. Configure hosting to return an Android APK content type and an attachment filename where possible. Cross-origin downloads follow the host's response headers.
- Verify the downloaded file's signing certificate with Android SDK `apksigner verify --print-certs`, and confirm the file size and version match the page.
- Scan the displayed QR code using a different Android device and confirm it downloads the same file.
- Install and test login, saved account data and Plaid's mobile linking flow before promoting the build. Website tests and a generated debug APK do not complete those native release checks.

## Local checks

```powershell
npm test
npm run build
npm run dev
```

Open the Vite URL at `/download`. Navigation retains the existing Dashboard/Open app destinations for signed-in users and Log in/Get started destinations for visitors.
