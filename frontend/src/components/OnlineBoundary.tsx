import { useEffect, useState, type ReactNode } from "react";
import { DATA_CHANGED_EVENT, getAccessToken, invalidateReads, isConnected, isTokenCurrent, OFFLINE_MESSAGE } from "../api/client";
import { refreshAccountStorage } from "../api/accountStorage";

export function OnlineBoundary({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(isConnected);
  useEffect(() => {
    let active = true;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout>;
    const publish = () => {
      for (const event of ["pfm:transactions-updated", "pfm:budgets-updated", "pfm:savings-goals-updated", "pfm:recurring-transactions-updated", "pfm:tracking-mode-updated"])
        window.dispatchEvent(new Event(event));
    };
    async function refresh() {
      if (refreshing || document.hidden || !isConnected() || !isTokenCurrent(getAccessToken())) return;
      refreshing = true;
      invalidateReads();
      try { await refreshAccountStorage(); }
      catch { /* Existing page requests report backend failures; the next refresh retries reads. */ }
      finally { if (active) publish(); refreshing = false; }
    }
    const changed = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150); };
    const visibility = () => { if (!document.hidden) void refresh(); };
    const connectivity = () => { setOnline(isConnected()); if (isConnected()) void refresh(); };
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener("pfm:foreground", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(DATA_CHANGED_EVENT, changed);
    document.addEventListener("visibilitychange", visibility);
    const poll = setInterval(() => void refresh(), 60_000);
    return () => {
      active = false; clearTimeout(timer); clearInterval(poll);
      window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity);
      window.removeEventListener("pfm:foreground", refresh); window.removeEventListener("focus", refresh);
      window.removeEventListener(DATA_CHANGED_EVENT, changed); document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  if (!online) return <main className="online-required"><h1>You're offline</h1><p role="alert">{OFFLINE_MESSAGE}</p><p>Your financial changes cannot be submitted while offline.</p><button className="ui-button primary" onClick={() => { setOnline(isConnected()); if (isConnected()) window.dispatchEvent(new Event("pfm:foreground")); }}>Retry connection</button></main>;
  return children;
}
