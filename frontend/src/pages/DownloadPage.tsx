import { useState } from "react";
import { detectDevice } from "../domain/mobile";
import { ArrowUpRight, ChartNoAxesCombined, Download, PiggyBank, RefreshCw, Smartphone, Wallet } from "lucide-react";
import { MarketingBrand, MarketingHeader } from "../components/MarketingHeader";
import { AndroidDashboardPreview } from "../components/AndroidDashboardPreview";
import { ApkQrCode } from "../components/ApkQrCode";
import { formatApkSize, getAndroidRelease, type AndroidRelease } from "../domain/androidRelease";
import { publishedAndroidRelease } from "../domain/publishedAndroidRelease";
import "./DownloadPage.css";

export const DOWNLOAD_PAGE_URL = "https://finance-builder.vercel.app/download";

const environmentRelease = getAndroidRelease({ url: import.meta.env.VITE_ANDROID_APK_URL,
  version: import.meta.env.VITE_ANDROID_APK_VERSION, sizeBytes: import.meta.env.VITE_ANDROID_APK_SIZE_BYTES });
const configuredRelease = environmentRelease.url ? environmentRelease : getAndroidRelease(publishedAndroidRelease);

function AndroidDownload({ release, compact = false }: { release: AndroidRelease; compact?: boolean }) {
  return release.url ? <a className={`dl-button dl-primary${compact ? " dl-button-compact" : ""}`} href={release.url} download><Download size={compact ? 17 : 20} aria-hidden="true" />Download for Android<span aria-hidden="true">↓</span></a>
    : <button className={`dl-button dl-primary${compact ? " dl-button-compact" : ""}`} disabled><Smartphone size={20} aria-hidden="true" />Android app · Coming soon</button>;
}

export function DownloadPage({ signedIn, release = configuredRelease }: { signedIn: boolean; release?: AndroidRelease }) {
  const [device] = useState(() => typeof navigator === "undefined" ? "desktop" : detectDevice());
  return <div className={`lp dl-page dl-device-${device}`} id="top">
    <a className="lp-skip" href="#download-main">Skip to content</a>
    <MarketingHeader signedIn={signedIn} active="download" />
    <main id="download-main">
      <section className="lp-container dl-hero" aria-labelledby="download-title">
        <div className="dl-hero-copy">
          <p className="lp-eyebrow"><span className="lp-status-dot" />FINANCE BUILDER FOR ANDROID</p>
          <h1 id="download-title">Your money.<br /><span>Now in your pocket.</span></h1>
          <p className="dl-description">Take control of your finances wherever you go. Track spending, manage budgets, monitor savings, and stay connected to your money with Finance Builder for Android.</p>
          {device === "ios" && <p className="dl-release-meta dl-platform-note" role="note">This APK is for Android only. On iPhone or iPad, continue in your browser.</p>}
          <div className="dl-actions"><AndroidDownload release={release} /><a className="dl-button dl-secondary" href="/app">Continue in browser<ArrowUpRight size={18} aria-hidden="true" /></a></div>
          <p className="dl-release-meta">{release.url ? [release.version && `Version ${release.version}`, release.sizeBytes && formatApkSize(release.sizeBytes), "Android APK"].filter(Boolean).join(" · ") : "The Android app is being prepared. Use Finance Builder in your browser today."}</p>
          {release.url === publishedAndroidRelease.url && <p className="dl-release-meta dl-early-access" role="note"><strong>Early access · Android 7.0+</strong><br />Native Plaid bank linking is still being prepared. Device testing is ongoing; use the browser for bank linking.</p>}
          <ul className="dl-features" aria-label="App features">{[
            { icon: Wallet, label: "Track Spending" },
            { icon: ChartNoAxesCombined, label: "Manage Budgets" },
            { icon: PiggyBank, label: "Savings Goals" },
            { icon: RefreshCw, label: "Stay in Sync" },
          ].map(({ icon: Icon, label }) => <li key={label}><span><Icon size={18} aria-hidden="true" /></span>{label}</li>)}</ul>
        </div>
        <AndroidDashboardPreview />
        <aside className="dl-download-info" aria-label="Android download and installation">
          <section className="dl-info-card dl-qr-card" aria-labelledby="qr-title">
            <p className="lp-eyebrow">SCAN &amp; GO</p>
            <h2 id="qr-title">Get the app on your phone</h2>
            <div className="dl-qr-box"><ApkQrCode url={DOWNLOAD_PAGE_URL} /></div>
            <p className="dl-card-description">Scan with your Android phone to open the download page.{!release.url && " The APK is coming soon."}</p>
            <span className="dl-qr-destination">finance-builder.vercel.app/download</span>
          </section>
          <section className="dl-info-card dl-install-card" aria-labelledby="install-title">
            <span className="dl-install-icon"><Smartphone size={20} aria-hidden="true" /></span>
            <h2 id="install-title">Install Finance Builder on Android</h2>
            <ol className="dl-install-steps">{[
              "Download the APK.",
              "Open the downloaded file.",
              "Approve installation from that source if Android prompts.",
              "Complete installation.",
              "Sign in using your existing Finance Builder account.",
            ].map((step) => <li key={step}>{step}</li>)}</ol>
          </section>
        </aside>
      </section>
    </main>
    <footer className="lp-container dl-footer"><a href="/" aria-label="Finance Builder home"><MarketingBrand compact /></a><p>A clearer view of your money. Wherever life takes you.</p><a href="/app">Open Finance Builder<ArrowUpRight size={15} aria-hidden="true" /></a></footer>
  </div>;
}
