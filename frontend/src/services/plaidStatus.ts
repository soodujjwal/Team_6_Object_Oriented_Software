import { getAccessToken, isConnected } from "../api/client";
import { getPlaidStatus } from "../api/plaid";
import { createSharedPoller } from "./sharedPoller";

const poller = createSharedPoller({
  fetch: getPlaidStatus,
  owner: getAccessToken,
  available: () => !document.hidden && isConnected(),
  interval: status => status.connections.length ? 30_000 : 60_000,
  listen(resume) {
    const events = ["focus", "online", "pfm:foreground", "pfm:tracking-mode-updated"];
    for (const event of events) window.addEventListener(event, resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      for (const event of events) window.removeEventListener(event, resume);
      document.removeEventListener("visibilitychange", resume);
    };
  },
});
export const subscribePlaidStatus = poller.subscribe;
export const refreshPlaidStatus = poller.refresh;
