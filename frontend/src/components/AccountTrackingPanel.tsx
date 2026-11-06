import { useCallback, useEffect, useRef, useState } from "react";
import { Landmark, PencilLine } from "lucide-react";
import { chooseTrackingMode, getTrackingMode, TRACKING_MODE_UPDATED, type TrackingMode, type TrackingState } from "../api/trackingMode";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import type { Account } from "../api/types";
import { CreateBankAccountFlow } from "./CreateBankAccountFlow";
import { PlaidConnection } from "./PlaidConnection";
import { Button, GlassCard } from "./ui";

export function AccountTrackingPanel({ onCreated, onAccountsChanged }: { onCreated: (account: Account) => void; onAccountsChanged: () => void }) {
  const [state, setState] = useState<TrackingState | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const launchSequence = useRef(0);
  const [launch, setLaunch] = useState<{ mode: TrackingMode; id: number } | null>(null);
  const load = useCallback(() => { void getTrackingMode().then(setState).catch(() => setError("Could not load your tracking method. Please retry.")); }, []);
  useEffect(() => { load(); window.addEventListener(TRACKING_MODE_UPDATED, load); window.addEventListener(TRANSACTIONS_UPDATED_EVENT, load); return () => { window.removeEventListener(TRACKING_MODE_UPDATED, load); window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, load); }; }, [load]);
  async function choose(mode: TrackingMode) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      setState(await chooseTrackingMode(mode));
      setChoosing(false);
      setLaunch({ mode, id: ++launchSequence.current });
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Could not change your tracking method."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="account-tracking-panel" ref={panelRef} tabIndex={-1}>
    <GlassCard className="settings-panel" variant="subtle">
      <div className="section-heading"><h2>Account tracking</h2>{state?.mode && <Button variant="ghost" disabled={busy} onClick={() => setChoosing((value) => !value)}>{choosing ? "Cancel" : "Change method"}</Button>}</div>
      {busy && <p className="bank-wizard-hint" role="status">Opening your selected setup…</p>}
      {!state && !error && <p className="subtle" role="status">Loading your tracking method…</p>}
      {error && <p className="notice" role="alert">{error}{!state && <Button variant="ghost" onClick={() => { setError(""); load(); }}>Retry</Button>}</p>}
      {state && <>
        {(!state.mode || choosing || state.mode === "mixed") && <><p className="bank-wizard-hint">Choose one method for your entire account. Manual tracking and Plaid syncing cannot be used together.</p><div className="tracking-mode-options">{([{ mode: "manual", title: "Track manually", detail: "Add your accounts and record transactions yourself.", icon: PencilLine }, { mode: "plaid", title: "Connect with Plaid", detail: "Sync your bank accounts and transactions automatically.", icon: Landmark }] as const).map(({ mode, title, detail, icon: Icon }) => <button key={mode} disabled={busy} type="button" className={`bank-wizard-type${state.mode === mode ? " selected" : ""}`} aria-pressed={state.mode === mode} onClick={() => void choose(mode)}><span><Icon size={21} /></span><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div>{!state.can_switch && <p className="bank-wizard-hint">Switching requires resolving existing accounts or disconnecting Plaid first. Changing methods never deletes records automatically.</p>}</>}
        {state.mode === "mixed" && <p className="notice warning">This account already has both manual and connected records. New additions are paused. You can view existing records and disconnect Plaid or resolve manual accounts before choosing one method.</p>}
        {state.mode === "manual" && !choosing && <><p className="bank-wizard-hint">Manual tracking is on. Add accounts and transactions yourself.</p><CreateBankAccountFlow openRequest={launch?.mode === "manual" ? launch.id : undefined} onOpenHandled={() => setLaunch(null)} onCreated={(account) => { onCreated(account); load(); }} onConnectCredit={() => void choose("plaid")} /></>}
        {state.mode === "plaid" && !choosing && <p className="bank-wizard-hint">Plaid syncing is on. Accounts and bank transactions come from your bank; manual accounts and imports are unavailable.</p>}
      </>}
    </GlassCard>
    {(state?.mode === "plaid" || state?.mode === "mixed") && <PlaidConnection openRequest={launch?.mode === "plaid" ? launch.id : undefined} onOpenHandled={() => setLaunch(null)} allowConnect={state.mode === "plaid"} onAccountsChanged={() => { onAccountsChanged(); load(); }} />}
  </div>;
}
