# Mobile app and deployment

The website login detects Android, iPhone/iPad (including iPad desktop mode), or desktop and shows the relevant download option. A download remains marked coming soon until its URL is configured. An APK only installs on Android; iOS needs a separate App Store/TestFlight release. Inside Capacitor, the landing page, home links, and download controls are hidden. Existing sessions go to the app; signing out goes to login.

## Deploy the backend first (Render)

Create a Python Web Service from this repository at https://dashboard.render.com/ . Root directory: `backend`. Build command: `pip install .`. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `MONGODB_URI`, `MONGODB_DATABASE`, and a strong, private `JWT_SECRET_KEY` using Render's environment settings. Copy any required Plaid server variables from `.env.example` into the service settings, never into frontend variables. Configure MongoDB Atlas network access for the service. Verify the deployed `/health` endpoint reports a healthy database. Render free services sleep when idle; use an appropriate paid instance for a public production app.

## Deploy the website (Vercel)

Import the repository at https://vercel.com/new . Set root directory to `frontend`, framework to Vite, build command to `npm run build`, and output directory to `dist`. Set `VITE_API_BASE_URL` to the Render HTTPS URL without a trailing slash. After Vercel assigns a domain, set backend `CORS_ORIGINS` to that exact website origin (comma separate additional trusted origins). Redeploy the backend. Verify registration and login on the deployed website.

## Prepare Android

From `frontend`, with Capacitor dependencies installed:

```powershell
$env:VITE_API_BASE_URL = 'YOUR_RENDER_HTTPS_URL'
npm run build:mobile
npm run android:add
npm run android:sync
npm run android:open
```

`android:add` is needed only once. Android Studio uses its bundled Java runtime; an older Java on PATH may not build this project. Test login, bank linking, receipt scanning, back navigation, and keyboard layout on a real device. In Android Studio, use Build > Generate Signed App Bundle / APK, choose APK, and create a release signing key. Keep that key private and retain it for updates. The app identifier defaults to `com.financebuilder.app`; decide the final identifier before publishing.

Publish the signed APK at a stable HTTPS download URL. Set `VITE_ANDROID_APK_URL` on Vercel to that URL, then rebuild the website. Set `VITE_IOS_APP_URL` only when an actual iOS release exists. APK hosting must return the APK file, not an HTML login or fallback page. APKs can be hosted separately from the website. iOS builds require macOS/Xcode and Apple's distribution setup.

The mobile build uses `dist-mobile` and refuses a non-HTTPS backend URL. Secrets remain on the backend. Capacitor web origins (`https://localhost`, `capacitor://localhost`) are allowed by the API. This setup does not deploy services or create a signed release by itself.
