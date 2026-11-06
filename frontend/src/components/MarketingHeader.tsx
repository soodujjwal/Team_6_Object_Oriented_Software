import { ArrowUpRight, Download, PiggyBank } from "lucide-react";
import "../pages/LandingPage.css";
import "./MarketingHeader.css";

export function MarketingBrand({ compact = false }: { compact?: boolean }) {
  return <span className={`lp-brand${compact ? " lp-brand-compact" : ""}`}>
    <span className="lp-brand-mark"><PiggyBank size={23} strokeWidth={1.7} /></span>
    <span>finance<span className="lp-brand-light">builder</span><span className="lp-brand-dot">.</span></span>
  </span>;
}

export function MarketingHeader({ signedIn, active = "home" }: { signedIn: boolean; active?: "home" | "download" }) {
  const prefix = active === "home" ? "" : "/";
  return <header className="lp-header marketing-header"><div className="lp-container lp-nav">
    <a href="/" className="lp-brand-link" aria-label="Finance Builder home"><MarketingBrand /></a>
    <nav aria-label="Main navigation"><a href={`${prefix}#features`}>Features</a><a href={`${prefix}#how-it-works`}>How it works</a><a href={`${prefix}#questions`}>FAQs</a></nav>
    <div className="lp-nav-actions">
      <a className="lp-login" href={signedIn ? "/app" : "/login"}>{signedIn ? "Dashboard" : "Log in"}</a>
      <a className="lp-download-nav" href="/download" aria-current={active === "download" ? "page" : undefined}><Download size={15} aria-hidden="true" /><span>Download</span></a>
      <a className="lp-button lp-button-small" href={signedIn ? "/app" : "/register"}>{signedIn ? "Open app" : "Get started"}<ArrowUpRight size={15} aria-hidden="true" /></a>
    </div>
  </div></header>;
}
