import { ArrowUpRight, Check, Download, LogIn, PackageOpen, Smartphone } from "lucide-react";
import { MarketingBrand, MarketingHeader } from "../components/MarketingHeader";
import { AndroidDashboardPreview } from "../components/AndroidDashboardPreview";
import { ApkQrCode } from "../components/ApkQrCode";
import { formatApkSize, getAndroidRelease, type AndroidRelease } from "../domain/androidRelease";
import "./DownloadPage.css";

const configuredRelease = getAndroidRelease({ url: import.meta.env.VITE_ANDROID_APK_URL,
  version: import.meta.env.VITE_ANDROID_APK_VERSION, sizeBytes: import.meta.env.VITE_ANDROID_APK_SIZE_BYTES });

function AndroidDownload({ release, compact = false }: { release: AndroidRelease; compact?: boolean }) {
  return release.url ? <a className={`dl-button dl-primary${compact ? " dl-button-compact" : ""}`} href={release.url}><Download size={compact ? 17 : 20} aria-hidden="true" />Download for Android<span aria-hidden="true">↓</span></a>
    : <button className={`dl-button dl-primary${compact ? " dl-button-compact" : ""}`} disabled><Smartphone size={20} aria-hidden="true" />Android app · Coming soon</button>;
}

export function DownloadPage({ signedIn, release = configuredRelease }: { signedIn: boolean; release?: AndroidRelease }) {
  return <div className="lp dl-page" id="top">
    <a className="lp-skip" href="#download-main">Skip to content</a>
    <MarketingHeader signedIn={signedIn} active="download" />
    <main id="download-main">
      <section className="lp-container dl-hero" aria-labelledby="download-title">
        <div className="dl-hero-copy">
          <p className="lp-eyebrow"><span className="lp-status-dot" />FINANCE BUILDER FOR ANDROID</p>
          <h1 id="download-title">Your money.<br /><span>Now in your pocket.</span></h1>
          <p className="dl-description">Take control of your finances wherever you go. Track spending, manage budgets, monitor savings, and stay connected to your money with Finance Builder for Android.</p>
          <div className="dl-actions"><AndroidDownload release={release} /><a className="dl-button dl-secondary" href="/app">Continue in browser<ArrowUpRight size={18} aria-hidden="true" /></a></div>
          <p className="dl-release-meta">{release.url ? [release.version && `Version ${release.version}`, release.sizeBytes && formatApkSize(release.sizeBytes), "Android APK"].filter(Boolean).join(" · ") : "The Android app is being prepared. Use Finance Builder in your browser today."}</p>
          <div className="dl-benefits"><span><Check size={14} />Your existing account</span><span><Check size={14} />Your finances, wherever you are</span></div>
        </div>
        <AndroidDashboardPreview />
      </section>

      <section className="lp-container dl-qr-section" aria-labelledby="qr-title">
        <div className="dl-qr-card">
          <div className={`dl-qr-box${release.url ? "" : " dl-qr-unavailable"}`}>
            {release.url ? <ApkQrCode url={release.url} /> : <><Smartphone size={44} strokeWidth={1.3} aria-hidden="true" /><span>QR code available at launch</span></>}
          </div>
          <div className="dl-qr-copy"><p className="lp-eyebrow">FROM YOUR DESK TO YOUR POCKET</p><h2 id="qr-title">Download straight<br /><span>to your phone.</span></h2><p>{release.url ? "Scan with your Android phone to download Finance Builder." : "Coming soon. The download and QR code will appear here when the Android app is available."}</p><AndroidDownload release={release} compact /></div>
        </div>
      </section>

      <section className="lp-container dl-install" aria-labelledby="install-title">
        <p className="lp-eyebrow">A LITTLE SETUP. A CLEARER PICTURE.</p><h2 id="install-title">Get started in<br /><span>three simple steps.</span></h2>
        <div className="dl-step-grid">{[
          { icon: Download, title: "Download the APK.", body: "Save the Finance Builder APK to your Android phone." },
          { icon: PackageOpen, title: "Open and install.", body: "Open the APK on your Android device and approve installation from that source if prompted." },
          { icon: LogIn, title: "Make yourself at home.", body: "Launch Finance Builder and sign in." },
        ].map(({ icon: Icon, title, body }, index) => <article className="dl-step" key={title}><div className="dl-step-top"><span>0{index + 1}</span><Icon size={23} aria-hidden="true" /></div><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>
    </main>
    <footer className="lp-container dl-footer"><a href="/" aria-label="Finance Builder home"><MarketingBrand compact /></a><p>A clearer view of your money. Wherever life takes you.</p><a href="/app">Open Finance Builder<ArrowUpRight size={15} aria-hidden="true" /></a></footer>
  </div>;
}
