import type { ReactNode } from "react";
import type { Page } from "../App";
import { TopBar } from "./TopBar";
import { DashboardSkeleton, Skeleton } from "./Skeleton";
import { LandingSkeleton } from "./LandingSkeleton";
import { DownloadSkeleton } from "./DownloadSkeleton";
import "./LoadingScreen.css";

export type SkeletonPage = Page | "login" | "register" | "landing" | "download" | "onboarding";
export const pageTitles: Record<SkeletonPage, string> = {
  dashboard: "Dashboard", reports: "Monthly Report", accounts: "Accounts", transactions: "Transactions",
  budgets: "Budget", goals: "Savings Goals", recurring: "Recurring Bills", settings: "Account Settings",
  add: "Add Transaction", afford: "Can I Afford It?", help: "Help", split: "Split Bill",
  login: "Welcome back", register: "Create your account", landing: "Finance Builder", download: "Download for Android", onboarding: "Set up your account",
};

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`skeleton-card ${className}`}>{children}</div>;
}
function Fields({ count = 4 }: { count?: number }) {
  return <div className="sk-fields">{Array.from({ length: count }, (_, key) => <div key={key}><Skeleton className="sk-label" /><Skeleton className="sk-field" /></div>)}</div>;
}
function Rows({ count = 4 }: { count?: number }) {
  return <>{Array.from({ length: count }, (_, key) => <div className="skeleton-row" key={key}><Skeleton className="sk-icon" /><div><Skeleton className="sk-name" /><Skeleton className="sk-caption" /></div><Skeleton className="sk-number" /></div>)}</>;
}
function Stats({ count = 3 }: { count?: number }) {
  return <div className={`sk-summary sk-summary-${count}`}>{Array.from({ length: count }, (_, key) => <Card key={key}><Skeleton className="sk-label" /><Skeleton className="sk-value" /></Card>)}</div>;
}
function Heading() { return <div className="skeleton-section-head"><Skeleton className="sk-heading" /><Skeleton className="sk-button" /></div>; }

export function PageSkeletonContent({ page }: { page: SkeletonPage }) {
  switch (page) {
    case "dashboard": return <DashboardSkeleton />;
    case "reports": return <div className="page-skeleton-content" aria-hidden="true">
      <Skeleton className="sk-heading" /><Skeleton className="sk-description" />
      <Card className="sk-report-card"><div className="sk-report-chart"><Skeleton className="sk-donut" /><div className="sk-chart-legend"><Skeleton className="sk-name" /><Skeleton className="sk-value" /><Skeleton className="sk-name" /><Skeleton className="sk-value" /></div></div></Card>
      <Card><h2>Net Cash Flow</h2><Skeleton className="sk-amount" /></Card>
    </div>;
    case "accounts": return <div className="page-skeleton-content" aria-hidden="true"><Heading /><Stats /><div className="sk-columns"><Card><h2>Your Accounts</h2><Rows /></Card><Card><Skeleton className="sk-heading" /><Skeleton className="sk-amount" /><Rows count={3} /></Card></div></div>;
    case "transactions": return <div className="page-skeleton-content" aria-hidden="true"><Card><Fields /></Card><div className="sk-action-row"><Skeleton className="sk-button" /><Skeleton className="sk-button" /></div><Skeleton className="sk-heading" /><Card><Rows count={6} /></Card></div>;
    case "budgets": return <div className="page-skeleton-content" aria-hidden="true"><Heading /><Stats count={5} /><Card><h2>Overall budget progress</h2><Skeleton className="sk-progress" /></Card><Card><h2>Budgeted vs Actual Spending</h2>{[0, 1, 2].map((key) => <div className="sk-budget-bar" key={key}><Skeleton className="sk-label" /><div><Skeleton className="sk-progress" /><Skeleton className="sk-progress" /></div></div>)}</Card><Stats /></div>;
    case "goals": return <div className="page-skeleton-content" aria-hidden="true"><Heading />{[0, 1].map((key) => <Card key={key}><Heading /><Skeleton className="sk-progress" /><Stats /><Skeleton className="sk-heading" /><Rows count={3} /></Card>)}</div>;
    case "recurring": return <div className="page-skeleton-content" aria-hidden="true"><Heading /><Card><h2>Connected Bank Subscriptions</h2><Rows count={2} /></Card><h2>Upcoming</h2><Card><Rows count={4} /></Card></div>;
    case "settings": return <div className="page-skeleton-content" aria-hidden="true"><Card><h2>Profile</h2><div className="skeleton-row"><Skeleton className="sk-avatar" /><div><Skeleton className="sk-name" /><Skeleton className="sk-caption" /></div><Skeleton className="sk-button" /></div></Card><Card><h2>Appearance</h2><Skeleton className="sk-field" /></Card><Card><h2>Account tracking</h2><Skeleton className="sk-button" /></Card><Card><h2>Your Accounts</h2><Rows count={2} /></Card></div>;
    case "add": return <div className="page-skeleton-content" aria-hidden="true"><Card><div className="sk-action-row"><Skeleton className="sk-button" /><Skeleton className="sk-button" /></div><Skeleton className="sk-amount" /><Fields count={6} /><Skeleton className="sk-field" /><Skeleton className="sk-button" /></Card><Card><h2>Import transactions</h2><Skeleton className="sk-upload" /></Card></div>;
    case "afford": return <div className="page-skeleton-content" aria-hidden="true"><Skeleton className="sk-description" /><Card><h2>Purchase information</h2><Fields count={2} /></Card><Card><h2>How would you pay?</h2><div className="sk-summary sk-summary-3">{[0, 1, 2].map((key) => <Skeleton className="sk-payment" key={key} />)}</div></Card></div>;
    case "help": return <div className="page-skeleton-content" aria-hidden="true"><Skeleton className="sk-heading" /><Skeleton className="sk-description" /><div className="sk-help-layout"><Card><Rows count={6} /></Card><Card><Skeleton className="sk-heading" /><Skeleton className="sk-description" /><Skeleton className="sk-description" /><Fields count={2} /></Card></div></div>;
    case "split": return <div className="page-skeleton-content" aria-hidden="true"><Heading /><div className="sk-columns"><Card><h2>Receipt details</h2><Fields count={2} /><Skeleton className="sk-upload" /><Rows count={3} /></Card><Card><h2>Split summary</h2><Skeleton className="sk-amount" /><Rows count={3} /><Skeleton className="sk-button" /></Card></div></div>;
    case "login":
    case "register": return <Card className="sk-auth-card"><Skeleton className="sk-icon" /><h1>{pageTitles[page]}</h1><Skeleton className="sk-description" /><Fields count={page === "login" ? 2 : 5} /><Skeleton className="sk-field" /><Skeleton className="sk-caption" /></Card>;
    case "onboarding": return <div className="page-skeleton-content sk-onboarding" aria-hidden="true"><h1>Set up your account</h1><div className="sk-action-row">{Array.from({ length: 8 }, (_, key) => <Skeleton className="sk-step" key={key} />)}</div><Card><Skeleton className="sk-heading" /><Skeleton className="sk-description" /><Fields /><Skeleton className="sk-button" /></Card></div>;
    case "landing": return <LandingSkeleton />;
    case "download": return <DownloadSkeleton />;
  }
}

export function PageSkeleton({ page }: { page: SkeletonPage }) {
  const standalone = ["login", "register", "landing", "download", "onboarding"].includes(page);
  return <section className={`page page-loading page-loading-${page}${standalone ? " page-loading-standalone" : ""}`} aria-busy="true" data-skeleton-page={page}>
    {!standalone && <TopBar title={pageTitles[page]} />}
    <span className="loading-sr-only" role="status">Loading {pageTitles[page]}</span>
    <PageSkeletonContent page={page} />
  </section>;
}
