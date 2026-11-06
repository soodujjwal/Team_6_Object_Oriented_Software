import { MarketingHeaderSkeleton } from "./LandingSkeleton";
import { Skeleton } from "./Skeleton";
import "../pages/DownloadPage.css";

export function DownloadSkeleton() {
  return <div className="lp dl-page" aria-hidden="true">
    <MarketingHeaderSkeleton />
    <div className="lp-container dl-hero">
      <div className="dl-hero-copy"><Skeleton className="sk-heading" /><Skeleton className="dl-sk-title" /><Skeleton className="sk-description" /><div className="dl-actions"><Skeleton className="dl-sk-button" /><Skeleton className="dl-sk-button" /></div><Skeleton className="sk-caption" /></div>
      <div className="dl-device-scene"><Skeleton className="dl-sk-phone" /></div>
    </div>
    <div className="lp-container dl-qr-section"><div className="dl-qr-card"><Skeleton className="dl-sk-qr" /><div><Skeleton className="dl-sk-title" /><Skeleton className="sk-description" /></div></div></div>
  </div>;
}
