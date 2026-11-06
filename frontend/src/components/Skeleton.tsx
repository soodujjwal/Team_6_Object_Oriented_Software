export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}

export function DashboardSkeleton() {
  return <div className="dashboard-skeleton" aria-hidden="true">
    <div className="skeleton-balance"><Skeleton className="sk-label" /><Skeleton className="sk-amount" /><Skeleton className="sk-caption" /></div>
    <div className="skeleton-stats">{[0, 1].map((key) => <div className="skeleton-card" key={key}><Skeleton className="sk-label" /><Skeleton className="sk-value" /></div>)}</div>
    <div className="skeleton-card skeleton-transactions">
      <div className="skeleton-section-head"><Skeleton className="sk-heading" /><Skeleton className="sk-link" /></div>
      {[0, 1, 2].map((key) => <div className="skeleton-row" key={key}><Skeleton className="sk-icon" /><div><Skeleton className="sk-name" /><Skeleton className="sk-caption" /></div><Skeleton className="sk-number" /></div>)}
    </div>
    <div className="skeleton-stats">{[0, 1].map((key) => <div className="skeleton-card" key={key}><Skeleton className="sk-heading" /><Skeleton className="sk-progress" /><Skeleton className="sk-caption" /></div>)}</div>
  </div>;
}
