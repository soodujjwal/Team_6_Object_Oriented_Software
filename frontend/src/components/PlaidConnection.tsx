import { useCallback, useEffect, useRef, useState } from "react";
import { Landmark, RefreshCw, Unplug } from "lucide-react";
import {
  createPlaidLinkToken,
  disconnectPlaid,
  exchangePlaidToken,
  getPlaidStatus,
  refreshPlaid,
  syncPlaid,
  type PlaidStatus,
} from "../api/plaid";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import { Button, GlassCard } from "./ui";

type PlaidHandler = {
  open: () => void;
  exit: (options?: { force?: boolean }) => void;
};

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string, metadata: unknown) => void;
        onExit: (error: unknown) => void;
      }) => PlaidHandler;
    };
  }
}

let plaidScriptPromise: Promise<void> | null = null;

function loadPlaidScript() {
  if (window.Plaid) return Promise.resolve();
  if (plaidScriptPromise) return plaidScriptPromise;
  plaidScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { plaidScriptPromise = null; script.remove(); reject(new Error("Could not load Plaid Link.")); };
    document.head.appendChild(script);
  });
  return plaidScriptPromise;
}

export function PlaidConnection({ onAccountsChanged, allowConnect = true, openRequest, onOpenHandled }: { onAccountsChanged: () => void; allowConnect?: boolean; openRequest?: number; onOpenHandled?: () => void }) {
  const [plaidStatus, setPlaidStatus] = useState<PlaidStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lastSync = useRef("");
  const connecting = useRef(false);
  const handledOpen = useRef<number | undefined>(undefined);

  const loadStatus = useCallback(async () => {
    try {
      const next = await getPlaidStatus();
      const latest = next.connections.map((item) => item.last_synced_at ?? "").sort().at(-1) ?? "";
      if (lastSync.current && latest && latest !== lastSync.current) {
        window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
        onAccountsChanged();
      }
      lastSync.current = latest;
      setPlaidStatus(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check Plaid status.");
    }
  }, [onAccountsChanged]);

  useEffect(() => {
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 15_000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  useEffect(() => {
    if (!openRequest || !allowConnect || handledOpen.current === openRequest) return;
    handledOpen.current = openRequest;
    onOpenHandled?.();
    void connect();
  }, [openRequest, onOpenHandled, allowConnect]);

  async function connect() {
    if (!allowConnect || connecting.current) return;
    connecting.current = true;
    setBusy(true);
    setMessage("");
    const finish = () => { connecting.current = false; setBusy(false); };
    let exchanging = false;
    try {
      const [, { link_token }] = await Promise.all([loadPlaidScript(), createPlaidLinkToken()]);
      const handler = window.Plaid!.create({
        token: link_token,
        onSuccess: (publicToken, metadata) => {
          if (exchanging) return;
          exchanging = true;
          void exchangePlaidToken(publicToken, metadata)
            .then(() => {
              setMessage("Bank connected and transactions imported.");
              window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
              onAccountsChanged();
              return loadStatus();
            })
            .catch((error) => setMessage(error instanceof Error ? error.message : "Could not connect bank."))
            .finally(finish);
        },
        onExit: () => { if (!exchanging) finish(); },
      });
      handler.open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Plaid Link.");
      finish();
    }
  }

  async function sync(requestFreshData: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (requestFreshData) {
        const result = await refreshPlaid();
        setMessage(`Refresh requested for ${result.requested} connection(s). Plaid will send updates when ready.`);
      } else {
        const result = await syncPlaid();
        setMessage(`Synced ${result.added + result.modified} update(s) and removed ${result.removed}.`);
      }
      window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
      onAccountsChanged();
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sync transactions.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(connectionId: number) {
    if (!window.confirm("Disconnect this bank and delete its linked accounts, transactions, and recurring bills from the app? Affected split bills will need review.")) return;
    setBusy(true);
    try {
      await disconnectPlaid(connectionId);
      setMessage("Bank disconnected. Its linked accounts and transactions were deleted.");
      window.dispatchEvent(new Event(TRANSACTIONS_UPDATED_EVENT));
      onAccountsChanged();
      await loadStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect bank.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="settings-panel plaid-panel">
      <div className="plaid-heading">
        <div>
          <h2>Bank Sync</h2>
        </div>
        <Button disabled={!allowConnect || busy || plaidStatus?.configured === false} onClick={() => void connect()}>
          <Landmark aria-hidden="true" size={17} /> Connect Bank
        </Button>
      </div>
      {plaidStatus?.configured === false && (
        <p className="notice warning">Add your Plaid credentials to the backend before connecting a bank.</p>
      )}
      {plaidStatus?.connections.map((connection) => (
        <div className="plaid-connection" key={connection.id}>
          <div>
            <strong>{connection.institution_name}</strong>
            <span>{connection.account_count} account(s) · {connection.status}</span>
            <span>{connection.last_synced_at ? `Last synced ${new Date(connection.last_synced_at).toLocaleString()}` : "Waiting for first sync"}</span>
          </div>
          <Button disabled={busy} onClick={() => void disconnect(connection.id)} variant="ghost">
            <Unplug aria-hidden="true" size={16} /> Disconnect
          </Button>
        </div>
      ))}
      {Boolean(plaidStatus?.connections.length) && (
        <div className="plaid-actions">
          <Button disabled={busy} onClick={() => void sync(false)} variant="secondary">
            <RefreshCw aria-hidden="true" size={16} /> Sync Now
          </Button>
          <Button disabled={busy} onClick={() => void sync(true)} variant="secondary">Request bank refresh</Button>
        </div>
      )}
      {message && (
        <p
          className={`notice${/^(Bank connected|Refresh requested|Synced|Bank disconnected)/.test(message) ? " success" : ""}`}
          role={/^(Bank connected|Refresh requested|Synced|Bank disconnected)/.test(message) ? "status" : "alert"}
        >
          {message}
        </p>
      )}
    </GlassCard>
  );
}
