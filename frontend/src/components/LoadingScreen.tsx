import { useEffect, useState } from "react";
import { PiggyBank, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "./ui";
import { Skeleton } from "./Skeleton";
import { PageSkeletonContent, pageTitles } from "./PageSkeleton";
import type { Page } from "../App";
export { Skeleton, DashboardSkeleton } from "./Skeleton";
import "./LoadingScreen.css";

export function LoadingScreen({ error = false, onRetry, onSignOut, page = "dashboard" }: {
  error?: boolean; onRetry?: () => void; onSignOut?: () => void; page?: Page;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="loading-screen">
    <div className="loading-frame">
      <header className="loading-header"><div className="loading-brand"><span><PiggyBank size={25} strokeWidth={1.7} /></span>Finance Builder</div><span className="loading-connection"><i />{error ? "Connection interrupted" : "Connecting your account"}</span></header>
      <section className="loading-intro" role={error ? "alert" : "status"} aria-live="polite">
        <div className="loading-eyebrow"><ShieldCheck size={15} /> Your personal finance space</div>
        <h1>{error ? "Let’s try that again." : `Getting your ${pageTitles[page].toLowerCase()} ready.`}</h1>
        <p>{error ? "We couldn’t load this page. Check your connection and try again." : slow ? "This is taking a little longer. We’re still connecting to your saved account." : "Bringing your accounts, transactions, and goals together."}</p>
        {(error || slow) && <div className="loading-actions">
          {onRetry && <Button onClick={onRetry}><RefreshCw size={16} /> Try again</Button>}
          {onSignOut && <Button variant="ghost" onClick={onSignOut}>Sign out</Button>}
        </div>}
      </section>
      <div className="loading-dashboard" aria-busy={!error}>
        <div className="skeleton-toolbar" aria-hidden="true"><Skeleton className="sk-heading" /><Skeleton className="sk-avatar" /></div>
        <PageSkeletonContent page={page} />
      </div>
      <footer className="loading-footer">{error ? "You can retry without creating a new account." : "Your saved data will appear here shortly."}</footer>
    </div>
  </main>;
}
