import type { ReactNode } from "react";
import { Skeleton } from "./Skeleton";
import "../pages/LandingPage.css";
import "./LandingSkeleton.css";
import "./MarketingHeader.css";

// Keep the landing page's layout classes so its breakpoints also apply while loading.
function Text({ children }: { children: ReactNode }) {
  return <span className="skeleton lps-text"><span>{children}</span></span>;
}

export function MarketingHeaderSkeleton() {
  return <header className="lp-header marketing-header"><div className="lp-container lp-nav">
      <span className="lp-brand"><Skeleton className="lp-brand-mark" /><Text>financebuilder.</Text></span>
      <nav><Text>Features</Text><Text>How it works</Text><Text>FAQs</Text></nav>
      <div className="lp-nav-actions"><span className="lp-login"><Text>Log in</Text></span><Skeleton className="lps-download-button" /><Skeleton className="lps-nav-button" /></div>
    </div></header>;
}

export function LandingSkeleton() {
  return <div className="lp lps" aria-hidden="true">
    <MarketingHeaderSkeleton />
    <div>
      <div className="lp-hero lp-container">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow"><Text>YOUR NEXT CHAPTER STARTS HERE</Text></div>
          <h1><Text>Your money.</Text><br /><Text>All connected.</Text><br /><Text>All in view.</Text></h1>
          <p className="lp-hero-description lps-paragraph">Bring your spending, savings, and shared bills into focus. A little less guesswork. A lot more room for what matters.</p>
          <div className="lp-hero-actions"><Skeleton className="lps-primary-button" /><span className="lp-text-link"><Text>See how it works</Text></span></div>
          <div className="lp-hero-benefits"><Text>Connect with Plaid</Text><Text>Or start manually</Text></div>
          <div className="lp-hero-bottom"><Skeleton className="lp-line-icon" /><div><Text>Made for everyday money.</Text><br /><Text>And everything you’re building toward.</Text></div></div>
        </div>
        <div className="lp-product-scene">
          <div className="lp-orbit lp-orbit-one" /><div className="lp-orbit lp-orbit-two" />
          <div className="lp-product-window">
            <div className="lp-window-bar"><div className="lp-window-dots"><i /><i /><i /></div><Text>YOUR MONEY, CONNECTED</Text><Skeleton className="lps-lock" /></div>
            <div className="lp-product-inner">
              <aside className="lp-preview-rail">{[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} className={key === 0 ? "lp-rail-brand" : ""} />)}</aside>
              <div className="lp-preview-content">
                <div className="lp-preview-heading"><div><span className="lp-small-label"><Text>A little more clarity</Text></span><h3><Text>Your overview.</Text></h3></div><Skeleton className="lps-tag" /></div>
                <div className="lp-preview-switch"><Skeleton /><Skeleton /></div>
                <div className="lp-preview-panel">
                  <div className="lp-balance-preview"><span><Text>Estimated balance</Text></span><Skeleton className="lps-balance" /><small><Text>Bank activity and pending entries</Text></small></div>
                  <div className="lp-preview-totals">{[0, 1].map((key) => <div key={key}><Skeleton className="lps-label" /><Skeleton className="lps-total" /></div>)}</div>
                  <div className="lp-preview-budget-heading"><Text>Your budgets</Text><Text>This month</Text></div>
                  <div className="lp-preview-budgets">{[0, 1, 2].map((key) => <div className="lp-preview-budget" key={key}><Skeleton className="lp-mini-icon" /><div><div><Skeleton className="lps-label" /><Skeleton className="lps-label" /></div><Skeleton className="lp-progress" /></div></div>)}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-floating-note"><Skeleton className="lp-floating-icon" /><div><Text>One clear picture.</Text><br /><Text>Bank activity + everyday plans.</Text></div></div>
          <div className="lp-preview-caption"><Text>Illustrative preview · sample amounts, not account data</Text></div>
        </div>
      </div>
      <div className="lp-container"><div className="lp-capabilities">{["ONE PLACE. MORE POSSIBILITIES.", "Bank connections", "Smarter budgeting", "Shared expenses", "Personal goals"].map((label) => <span key={label}><Text>{label}</Text></span>)}</div></div>
      <div className="lp-section lp-container">
        <div className="lp-section-heading"><div><div className="lp-eyebrow"><Text>EVERY PIECE, IN PLACE</Text></div><h2><Text>A clearer picture.</Text><br /><Text>A better starting point.</Text></h2></div></div>
        <div className="lp-feature-grid">{["connected", "budget", "split", "goals"].map((feature) => <div className={`lp-feature lp-feature-${feature} lps-feature`} key={feature}><Skeleton className="lp-feature-icon" /><Skeleton className="sk-heading" /><Skeleton className="sk-description" /><Skeleton className="lps-feature-visual" /></div>)}</div>
      </div>
    </div>
  </div>;
}
