import { Download } from "lucide-react";
import { detectDevice, downloadUrl, isNativeApp } from "../../domain/mobile";
import "./AppDownload.css";

export function AppDownload() {
  if (isNativeApp()) return null;
  const device = detectDevice();
  const android = downloadUrl(import.meta.env.VITE_ANDROID_APK_URL);
  const ios = downloadUrl(import.meta.env.VITE_IOS_APP_URL);
  const showAndroid = device !== "ios" && Boolean(android);
  const showIos = device !== "android" && Boolean(ios);
  if (!showAndroid && !showIos) return null;
  return (
    <section className="app-download" aria-label="Get the mobile app">
      {showAndroid && <a className="app-download-link" href={android}><Download size={18} /> Download Android APK</a>}
      {showIos && <a className="app-download-link" href={ios}>Get the iOS app</a>}
      {device === "android" && android && <small>After downloading, open the APK to install. Android may ask you to allow installs from your browser.</small>}
    </section>
  );
}
