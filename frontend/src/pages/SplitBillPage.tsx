import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Camera, Check, CheckCircle2, History, Pencil, Plus, ReceiptText, Trash2, Upload } from "lucide-react";
import { getAccounts } from "../api/accounts";
import type { Account } from "../api/types";
import { addFriend, getFriends, getSplitBills, paySplitBill, recordRepayment, saveSplitBill, type Friend, type SplitBill } from "../api/splitBills";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import { calculateBill, toCents, type BillDraft, type BillItem } from "../domain/splitBill";
import { scanSplitReceipt } from "../services/splitReceipt";
import { TopBar } from "../components/TopBar";
import { Button, CategorySelect, DatePicker, GlassCard, GlassSelect, IconButton, Modal, TextField } from "../components/ui";
import { formatCurrency } from "../utils/format";
import "./SplitBillPage.css";

const money = (cents: number) => formatCurrency(Number.isFinite(cents) ? cents / 100 : 0);
const newItem = (): BillItem => ({ id: crypto.randomUUID(), name: "", quantity: 1, price: "0.00", people: [] });
function newDraft(name: string): BillDraft {
  const today = new Date();
  return { title: "", people: [{ id: "self", name }], self_id: "self", items: [], tax: "0.00", tip: "0.00", receipt_total: null,
    tip_method: "bank", account_id: null, category: "Food & Dining", bill_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}` };
}
type Dialog = "friends" | "history" | "receipt" | "totals" | "payments" | null;

export function SplitBillPage({ userName }: { userName: string }) {
  const [draft, setDraft] = useState<BillDraft>(() => newDraft(userName));
  const [saved, setSaved] = useState<SplitBill | null>(null);
  const [bills, setBills] = useState<SplitBill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendName, setFriendName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanResult, setScanResult] = useState<Awaited<ReturnType<typeof scanSplitReceipt>> | null>(null);
  const [preview, setPreview] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editingItem, setEditingItem] = useState<BillItem | null>(null);
  const [totalsEdit, setTotalsEdit] = useState({ tax: "", tip: "", total: "" });
  const [paymentSettings, setPaymentSettings] = useState({ account_id: "", tip_method: "bank", category: "Food & Dining", bill_date: "" });
  const [repayment, setRepayment] = useState<{ person: string; undo: boolean; amount: string } | null>(null);
  const actionLock = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const calculation = calculateBill(draft);
  const dirty = saved ? JSON.stringify(draft) !== JSON.stringify(saved.data) : true;
  const disabled = busy || scanning || loading;
  const ready = draft.items.length > 0 && calculation.all_assigned && calculation.matches && calculation.allocated === calculation.total && calculation.subtotal > 0;
  const unassignedCount = draft.items.filter((item) => !item.people.length).length;
  const candidates = [...draft.people, ...friends.map((friend) => ({ id: `friend-${friend.id}`, name: friend.name })).filter((friend) => !draft.people.some((person) => person.id === friend.id))];

  useEffect(() => {
    let active = true;
    Promise.all([getFriends(), getSplitBills()]).then(([nextFriends, nextBills]) => {
      if (active) { setFriends(nextFriends); setBills(nextBills); }
    }).catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    const refresh = () => { getAccounts().then((next) => { if (active) setAccounts(next); }).catch(() => {}); };
    refresh();
    window.addEventListener(TRANSACTIONS_UPDATED_EVENT, refresh);
    return () => { active = false; window.removeEventListener(TRANSACTIONS_UPDATED_EVENT, refresh); };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function change<K extends keyof BillDraft>(key: K, value: BillDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value })); setMessage(""); setError("");
  }
  function editItem(id: string, patch: Partial<BillItem>) {
    change("items", draft.items.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }
  function acceptSaved(bill: SplitBill) {
    setSaved(bill); setDraft(bill.data);
    setBills((current) => [bill, ...current.filter((entry) => entry.id !== bill.id)]);
  }
  async function action(callback: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(""); setMessage("");
    try { await callback(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save changes."); }
    finally { actionLock.current = false; setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!ready) { setError("Assign every item and check that the shares match the receipt total."); return; }
    if (saved?.paid && dirty && !window.confirm("This bill already has a recorded payment. Save this split and adjust its bank charge to match?")) return;
    void action(async () => {
      acceptSaved(await saveSplitBill({ ...draft, title: draft.title.trim() || "Shared meal" }, saved?.id));
      setMessage("Split saved. Everyone's share adds up exactly."); resultHeading.current?.focus();
    });
  }
  function selectBill(id?: number) {
    if (dirty && (draft.title || draft.items.length) && !window.confirm("Discard unsaved changes?")) return;
    const bill = bills.find((entry) => entry.id === id);
    setSaved(bill ?? null); setDraft(bill?.data ?? newDraft(userName)); setMessage(""); setError("");
    setPreview(""); setScanResult(null); setDialog(null);
  }
  function togglePerson(person: { id: string; name: string }) {
    if (person.id === draft.self_id || saved?.repayments[person.id]) return;
    const included = draft.people.some((entry) => entry.id === person.id);
    setDraft((current) => ({ ...current,
      people: included ? current.people.filter((entry) => entry.id !== person.id) : [...current.people, person],
      items: included ? current.items.map((entry) => ({ ...entry, people: entry.people.filter((id) => id !== person.id) })) : current.items,
    })); setMessage("");
  }
  async function scan(file: File) {
    if (draft.items.length && !window.confirm("Replace the current receipt items with this scan?")) return;
    setScanning(true); setError(""); setMessage(""); setScanProgress("Reading your receipt…");
    try {
      setPreview(URL.createObjectURL(file));
      const result = await scanSplitReceipt(file, setScanProgress);
      setScanResult(result);
      setDraft((current) => ({ ...current, title: result.title.slice(0, 150), tax: result.tax, tip: result.tip, receipt_total: result.total,
        items: result.items.map((entry) => ({ ...entry, id: crypto.randomUUID(), people: [] })) }));
      setMessage(result.items.length ? "Receipt added. Check the items, then tap who ordered each one." : "No items detected. Try a clearer photo or add items below.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not scan this image. You can add items manually."); }
    finally { setScanning(false); }
  }
  function openTotals() { setTotalsEdit({ tax: draft.tax, tip: draft.tip, total: draft.receipt_total ?? "" }); setDialog("totals"); }
  function openPayments() {
    setPaymentSettings({ account_id: draft.account_id ? String(draft.account_id) : "", tip_method: draft.tip_method, category: draft.category, bill_date: draft.bill_date }); setDialog("payments");
  }
  function openRepayment(person: string, undo = false) {
    setDialog(null);
    const total = calculation.people.find((entry) => entry.id === person)?.total ?? 0;
    setRepayment({ person, undo, amount: saved?.repayments[person]?.amount ?? (total / 100).toFixed(2) });
  }
  const reconciliation = !draft.items.length ? "Add a receipt to get started."
    : unassignedCount ? `Choose who ordered ${unassignedCount} remaining item${unassignedCount === 1 ? "" : "s"}.`
    : draft.receipt_total === null ? "Check the receipt total to finish."
    : !calculation.matches ? `The split is ${money(Math.abs(calculation.total - toCents(draft.receipt_total)))} ${calculation.total > toCents(draft.receipt_total) ? "above" : "below"} the receipt total.`
    : ready ? "Every share adds up to the receipt total." : "Check the item amounts before splitting.";

  return (
    <section className="page split-simple">
      <TopBar title="Split Bill" />
      <header className="sb-intro"><div><span className="sb-eyebrow">LESS MATH. MORE TIME TOGETHER.</span><h2>Share the meal.<br />Split it fairly.</h2><p>One receipt. Everyone's share, sorted.</p></div><Button variant="ghost" disabled={disabled} onClick={() => setDialog("history")}><History size={17} /> Past splits</Button></header>
      {error && <p className="notice" role="alert">{error}</p>}
      {message && <p className="sb-feedback" role="status"><CheckCircle2 size={18} aria-hidden="true" />{message}</p>}
      <form onSubmit={save} className="sb-flow">
        <fieldset className="sb-fields" disabled={disabled}>
          <GlassCard className="sb-card sb-receipt" variant="elevated">
            <div className="sb-section-title"><span className="sb-step">1</span><h2>Receipt</h2>{draft.items.length > 0 && <span className="sb-count">{draft.items.length} items</span>}</div>
            <div className="sb-receipt-body"><div className="sb-receipt-icon"><ReceiptText size={30} aria-hidden="true" /></div><div><h3>{draft.title || "Start with your receipt"}</h3><p>{draft.items.length ? "Items, tax, and tip are ready to review." : "Snap a photo or upload an image. We'll read the details."}</p></div></div>
            <div className="sb-receipt-actions"><Button onClick={() => cameraInput.current?.click()}><Camera size={18} /> Scan Receipt</Button><Button variant="secondary" onClick={() => uploadInput.current?.click()}><Upload size={18} /> Upload Receipt</Button></div>
            <input ref={cameraInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/bmp" capture="environment" aria-label="Take a receipt photo" onChange={(event) => { const file = event.target.files?.[0]; if (file) void scan(file); event.target.value = ""; }} />
            <input ref={uploadInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/bmp" aria-label="Upload receipt image" onChange={(event) => { const file = event.target.files?.[0]; if (file) void scan(file); event.target.value = ""; }} />
            {scanning && <p role="status" aria-live="polite">{scanProgress}</p>}
            <div className="sb-receipt-footer"><Button variant="ghost" onClick={() => setDialog("receipt")}>{draft.items.length ? "Review receipt" : "Enter receipt manually"}<ArrowRight size={14} /></Button>{draft.receipt_total !== null && <span>Receipt total <strong>{formatCurrency(draft.receipt_total)}</strong></span>}</div>
          </GlassCard>
          <GlassCard className="sb-card">
            <div className="sb-section-title"><span className="sb-step">2</span><h2>Who's splitting?</h2></div>
            <div className="sb-people" aria-label="People on this bill">
              {candidates.map((person) => { const included = draft.people.some((entry) => entry.id === person.id); return <Button key={person.id} className={`sb-chip ${included ? "is-selected" : ""}`} variant="ghost" aria-pressed={included} disabled={person.id === draft.self_id || Boolean(saved?.repayments[person.id])} onClick={() => togglePerson(person)}><span className="sb-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span>{person.id === draft.self_id ? `${person.name} (you)` : person.name}{included && <Check size={15} aria-hidden="true" />}</Button>; })}
              <Button className="sb-add-person" variant="secondary" onClick={() => { setFriendName(""); setDialog("friends"); }}><Plus size={16} /> Add Friend</Button>
            </div>
          </GlassCard>
          <GlassCard className="sb-card">
            <div className="sb-section-title"><span className="sb-step">3</span><h2>Select what you ordered</h2></div>
            <p className="sb-hint">Tap a name below each item. Tap more than one to share it.</p>
            {!draft.items.length && <div className="sb-empty"><ReceiptText size={24} aria-hidden="true" /><p>Your receipt items will appear here.</p></div>}
            <div className="sb-items">{draft.items.map((entry) => <article className="sb-item" key={entry.id}>
              <div className="sb-item-top"><div><h3>{entry.name}</h3>{entry.quantity > 1 && <span className="sb-hint">{money(toCents(entry.price))} each</span>}</div><div className="sb-item-price"><strong>{money(toCents(entry.price) * entry.quantity)}</strong><IconButton aria-label={`Edit ${entry.name}`} onClick={() => setEditingItem({ ...entry })}><Pencil size={15} /></IconButton></div></div>
              <div className="sb-item-bottom"><div className="sb-assignments" role="group" aria-label={`Who ordered ${entry.name}?`}>
                {draft.people.map((person) => <label className={`sb-assignment ${entry.people.includes(person.id) ? "is-selected" : ""}`} key={person.id}><input type="checkbox" checked={entry.people.includes(person.id)} onChange={(event) => editItem(entry.id, { people: event.target.checked ? [...entry.people, person.id] : entry.people.filter((id) => id !== person.id) })} /><span>{person.id === draft.self_id ? "You" : person.name}</span></label>)}
              </div><label className="sb-quantity"><span>Qty</span><input aria-label={`Quantity for ${entry.name}`} type="number" min="1" max="1000" step="1" required value={entry.quantity || ""} onChange={(event) => editItem(entry.id, { quantity: Number(event.target.value) })} /></label></div>
              {entry.people.length > 1 && <p className="sb-shared">Shared equally · {entry.people.length} people</p>}
            </article>)}</div>
            <Button className="sb-add-item" variant="ghost" onClick={() => setEditingItem(newItem())}><Plus size={16} /> Add an item</Button>
          </GlassCard>
          <GlassCard className="sb-card">
            <div className="sb-section-title"><span className="sb-step">4</span><h2>Tax & Tip</h2><Button variant="ghost" onClick={openTotals}><Pencil size={14} /> Edit</Button></div>
            <dl className="sb-totals"><div><dt>Subtotal</dt><dd>{money(calculation.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(calculation.tax)}</dd></div><div><dt>Tip</dt><dd>{money(calculation.tip)}</dd></div><div className="sb-total"><dt>Total</dt><dd>{money(calculation.total)}</dd></div></dl>
            <p className="sb-hint">Tax and tip are automatically divided in proportion to what each person ordered.</p>
          </GlassCard>
        </fieldset>
        <section className="sb-results" aria-labelledby="sb-results-title">
          <div className="sb-section-title"><span className="sb-step">5</span><h2 id="sb-results-title" ref={resultHeading} tabIndex={-1}>Everyone's share</h2><span className="sb-count">{draft.people.length} {draft.people.length === 1 ? "person" : "people"}</span></div>
          <div className="sb-share-grid">{calculation.people.map((person) => {
            const items = draft.items.filter((entry) => entry.people.includes(person.id));
            return <GlassCard className={`sb-share ${person.id === draft.self_id ? "sb-your-share" : ""}`} key={person.id} variant={person.id === draft.self_id ? "elevated" : "subtle"}>
              <div className="sb-share-heading"><span className="sb-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span><h3>{person.name}</h3>{person.id === draft.self_id && <span className="sb-you-label">Your share</span>}</div>
              {items.length ? <ul className="sb-person-items">{items.map((entry) => <li key={entry.id}>{entry.quantity > 1 ? `${entry.quantity} × ` : ""}{entry.name}{entry.people.length > 1 && <span>shared by {entry.people.length}</span>}</li>)}</ul> : <p className="sb-hint">No items selected yet.</p>}
              <dl className="sb-totals sb-person-totals"><div><dt>Items</dt><dd>{money(person.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(person.tax)}</dd></div><div><dt>Tip</dt><dd>{money(person.tip)}</dd></div><div className="sb-total"><dt>Total</dt><dd>{money(person.total)}</dd></div></dl>
            </GlassCard>;
          })}</div>
          <div className="sb-finish"><p className={`sb-check ${ready ? "is-ready" : ""}`} role="status">{ready && <CheckCircle2 size={18} aria-hidden="true" />}{reconciliation}{draft.items.length > 0 && !calculation.matches && <Button variant="ghost" disabled={disabled} onClick={openTotals}>Review total</Button>}</p><Button className="sb-submit" type="submit" disabled={disabled || !ready}>{busy ? "Saving…" : "Split Bill"}<ArrowRight size={19} aria-hidden="true" /></Button></div>
        </section>
      </form>
      {saved && !dirty && <GlassCard className="sb-next-step"><div><span className="sb-eyebrow">OPTIONAL NEXT STEP</span><h3>Want to track who paid you back?</h3><p>Record the payment and track repayments when you're ready.</p></div><Button variant="secondary" onClick={openPayments} disabled={disabled}>Payment & repayments<ArrowRight size={17} /></Button></GlassCard>}

      <Modal isOpen={dialog === "friends"} onClose={() => !busy && setDialog(null)} title="Add a friend">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void action(async () => { const friend = await addFriend(friendName.trim()); setFriends((current) => [...current.filter((entry) => entry.id !== friend.id), friend]); const id = `friend-${friend.id}`; if (!draft.people.some((person) => person.id === id)) change("people", [...draft.people, { id, name: friend.name }]); setDialog(null); }); }}><TextField label="Friend's name" autoFocus required maxLength={100} disabled={busy} value={friendName} onChange={(event) => setFriendName(event.target.value)} /><Button disabled={busy || !friendName.trim()} type="submit">Add Friend</Button>{error && <p className="notice" role="alert">{error}</p>}</form>
      </Modal>
      <Modal isOpen={dialog === "history"} onClose={() => setDialog(null)} title="Your splits"><div className="form-stack"><Button variant="secondary" onClick={() => selectBill()}><Plus size={16} /> New split</Button>{bills.map((bill) => <Button key={bill.id} className="sb-history-entry" variant="ghost" onClick={() => selectBill(bill.id)}><span>{bill.data.title}<small>{bill.data.bill_date}</small></span><strong>{money(bill.calculation.total)}</strong></Button>)}{!bills.length && <p>No saved splits yet.</p>}</div></Modal>
      <Modal isOpen={dialog === "receipt"} onClose={() => setDialog(null)} title="Receipt details"><div className="form-stack">
        {preview && <img className="sb-receipt-preview" src={preview} alt="Your receipt" />}
        <TextField label="Restaurant" maxLength={150} value={draft.title} onChange={(event) => change("title", event.target.value)} placeholder="Restaurant name" />
        <TextField label="Receipt total, including tip" type="number" min="0" step="0.01" value={draft.receipt_total ?? ""} onChange={(event) => change("receipt_total", event.target.value || null)} />
        {scanResult?.subtotal && <p className="sb-hint">Printed subtotal: {formatCurrency(scanResult.subtotal)}</p>}
        {scanResult && <details><summary>View scanned text</summary><pre className="sb-scanned-text">{scanResult.text}</pre></details>}
        <Button onClick={() => setDialog(null)}>Done</Button>
      </div></Modal>
      <Modal isOpen={Boolean(editingItem)} onClose={() => setEditingItem(null)} title={draft.items.some((entry) => entry.id === editingItem?.id) ? "Edit item" : "Add an item"}>
        {editingItem && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); change("items", draft.items.some((entry) => entry.id === editingItem.id) ? draft.items.map((entry) => entry.id === editingItem.id ? editingItem : entry) : [...draft.items, editingItem]); setEditingItem(null); }}>
          <TextField label="Item name" required autoFocus maxLength={150} value={editingItem.name} onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })} />
          <TextField label="Unit price" type="number" min="0" step="0.01" required value={editingItem.price} onChange={(event) => setEditingItem({ ...editingItem, price: event.target.value })} />
          <TextField label="Quantity" type="number" min="1" max="1000" step="1" required value={editingItem.quantity || ""} onChange={(event) => setEditingItem({ ...editingItem, quantity: Number(event.target.value) })} />
          <Button type="submit">Done</Button>{draft.items.some((entry) => entry.id === editingItem.id) && <Button variant="ghost" onClick={() => { change("items", draft.items.filter((entry) => entry.id !== editingItem.id)); setEditingItem(null); }}><Trash2 size={16} /> Remove item</Button>}
        </form>}
      </Modal>
      <Modal isOpen={dialog === "totals"} onClose={() => setDialog(null)} title="Review tax & tip"><form className="form-stack" onSubmit={(event) => { event.preventDefault(); setDraft((current) => ({ ...current, tax: totalsEdit.tax, tip: totalsEdit.tip, receipt_total: totalsEdit.total || null })); setMessage(""); setDialog(null); }}>
        <p>Adjust the receipt amounts if needed. We'll calculate everyone's share.</p>
        <TextField label="Tax" type="number" min="0" step="0.01" required value={totalsEdit.tax} onChange={(event) => setTotalsEdit({ ...totalsEdit, tax: event.target.value })} />
        <TextField label="Tip" type="number" min="0" step="0.01" required value={totalsEdit.tip} onChange={(event) => setTotalsEdit({ ...totalsEdit, tip: event.target.value })} />
        <div className="sb-tip-presets" aria-label="Calculate tip from subtotal">{[0, 15, 18, 20].map((percent) => <Button key={percent} variant="secondary" onClick={() => setTotalsEdit({ ...totalsEdit, tip: (Math.round(calculation.subtotal * percent / 100) / 100).toFixed(2) })}>{percent === 0 ? "No tip" : `${percent}% tip`}</Button>)}</div>
        <TextField label="Receipt total, including tip" type="number" min="0" step="0.01" required value={totalsEdit.total} onChange={(event) => setTotalsEdit({ ...totalsEdit, total: event.target.value })} />
        <Button type="submit">Apply</Button>
      </form></Modal>
      <Modal isOpen={dialog === "payments"} onClose={() => !busy && setDialog(null)} title="Payment & repayments">
        <div className="form-stack">
          {error && <p className="notice" role="alert">{error}</p>}
          {!saved?.paid ? <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void action(async () => { if (!saved || !paymentSettings.account_id) return; const bill = await saveSplitBill({ ...draft, ...paymentSettings, account_id: Number(paymentSettings.account_id), tip_method: paymentSettings.tip_method as "bank" | "cash" }, saved.id); acceptSaved(bill); acceptSaved(await paySplitBill(bill.id)); setMessage("Payment recorded. You can track repayments below."); }); }}>
            <GlassSelect disabled={busy} label="Account that paid" value={paymentSettings.account_id} options={accounts.map((account) => ({ value: String(account.id), label: `${account.name} · ${account.bank_name} · ${formatCurrency(account.current_balance ?? "0")}` }))} onChange={(value) => setPaymentSettings({ ...paymentSettings, account_id: value })} />
            <GlassSelect disabled={busy} label="How was the tip paid?" value={paymentSettings.tip_method} options={[{ value: "bank", label: "Same bank account" }, { value: "cash", label: "Cash" }]} onChange={(value) => setPaymentSettings({ ...paymentSettings, tip_method: value })} />
            <details><summary>More details</summary><div className="form-stack"><CategorySelect type="expense" value={paymentSettings.category} onChange={(value) => setPaymentSettings({ ...paymentSettings, category: value })} /><DatePicker label="Payment date" value={paymentSettings.bill_date} onChange={(value) => setPaymentSettings({ ...paymentSettings, bill_date: value })} /></div></details>
            <p>Bank charge: <strong>{money(calculation.subtotal + calculation.tax + (paymentSettings.tip_method === "bank" ? calculation.tip : 0))}</strong></p>
            <p className="sb-hint">Record this only if this receipt hasn't already been added to your transactions.</p>
            <Button disabled={busy || !paymentSettings.account_id} type="submit">{busy ? "Recording…" : "Record bank payment"}</Button>
            {!accounts.length && <p>Add an account in Settings to record payment.</p>}
          </form> : <><p className="sb-check is-ready"><CheckCircle2 size={18} />Payment recorded.</p>{calculation.people.filter((person) => person.id !== draft.self_id).map((person) => { const received = saved.repayments[person.id]; const difference = person.total - toCents(received?.amount ?? "0"); return <div className="sb-repayment-row" key={person.id}><label><input type="checkbox" disabled={busy || person.total === 0 && !received} checked={Boolean(received)} onChange={(event) => openRepayment(person.id, !event.target.checked)} />{person.name}<strong>{money(person.total)}</strong></label>{received && <small>{money(toCents(received.amount))} received · {difference > 0 ? `${money(difference)} remaining` : difference < 0 ? `${money(-difference)} overpaid` : "Paid back"}</small>}<Button variant="ghost" disabled={busy} onClick={() => openRepayment(person.id)}>{received ? "Edit received amount" : "Enter actual amount"}</Button></div>; })}</>}
        </div>
      </Modal>
      <Modal isOpen={Boolean(repayment)} onClose={() => { if (!busy) { setRepayment(null); setDialog("payments"); } }} title={repayment?.undo ? "Undo repayment" : "Record repayment"}>
        {repayment && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void action(async () => { if (!saved) return; acceptSaved(await recordRepayment(saved.id, repayment.person, !repayment.undo, repayment.undo ? undefined : repayment.amount)); setRepayment(null); setDialog("payments"); }); }}>
          {error && <p className="notice" role="alert">{error}</p>}
          <p>{repayment.undo ? "Reverse this repayment's bank credit?" : "Enter the total actually received. This replaces any previous amount."}</p>
          {!repayment.undo && <TextField label="Amount received" type="number" required min="0.01" step="0.01" disabled={busy} value={repayment.amount} onChange={(event) => setRepayment({ ...repayment, amount: event.target.value })} />}
          <Button disabled={busy} type="submit">{busy ? "Saving…" : repayment.undo ? "Undo repayment" : "Save repayment"}</Button>
        </form>}
      </Modal>
    </section>
  );
}
