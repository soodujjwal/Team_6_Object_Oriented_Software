import { Download } from "lucide-react";
import { detectDevice, downloadUrl, isNativeApp } from "../../domain/mobile";
import "./AppDownload.css";

export function AppDownload() {
  if (isNativeApp()) return null;
  const device = detectDevice();
  const android = downloadUrl(import.meta.env.VITE_ANDROID_APK_URL);
  const ios = downloadUrl(import.meta.env.VITE_IOS_APP_URL);
  return (
    <section className="app-download" aria-label="Get the mobile app">
      <p>Take Finance Builder with you</p>
      {device !== "ios" && (android
        ? <a className="app-download-link" href={android}><Download size={18} /> Download Android APK</a>
        : <button className="app-download-link" type="button" disabled>Android app — coming soon</button>)}
      {device !== "android" && (ios
        ? <a className="app-download-link" href={ios}>Get the iOS app</a>
        : <button className="app-download-link" type="button" disabled>iOS app — coming soon</button>)}
      {device === "android" && android && <small>After downloading, open the APK to install. Android may ask you to allow installs from your browser.</small>}
      {device === "ios" && !ios && <small>You can use Finance Builder in your browser while the iOS app is being prepared.</small>}
    </section>
  );
}
