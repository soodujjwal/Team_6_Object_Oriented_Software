import { PageSkeleton } from "../components/PageSkeleton";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Camera, Check, CheckCircle2, History, Pencil, Plus, ReceiptText, Trash2, Upload, UsersRound } from "lucide-react";
import { addFriend, getFriends, getSplitBills, saveSplitBill, getFriendGroups, saveFriendGroup, deleteSplitBill, getRepaymentOptions, markSplitPaid, type RepaymentOptions, type FriendGroup, type Friend, type SplitBill } from "../api/splitBills";
import { TRANSACTIONS_UPDATED_EVENT } from "../api/transactions";
import { calculateBill, toCents, type BillDraft, type BillItem } from "../domain/splitBill";
import { scanSplitReceipt } from "../services/splitReceipt";
import { TopBar } from "../components/TopBar";
import { Button, GlassCard, IconButton, Modal, TextField } from "../components/ui";
import { formatCurrency } from "../utils/format";
import "./SplitBillPage.css";

const money = (cents: number) => formatCurrency(Number.isFinite(cents) ? cents / 100 : 0);
const newItem = (): BillItem => ({ id: crypto.randomUUID(), name: "", quantity: 1, price: "0.00", people: [] });
function newDraft(name: string): BillDraft {
  const today = new Date();
  return { title: "", people: [{ id: "self", name }], self_id: "self", items: [], tax: "0.00", tip: "0.00", receipt_total: null,
    bill_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}` };
}
type Dialog = "groups" | "friends" | "history" | "receipt" | "totals" | "repayment" | "delete" | null;

export function SplitBillPage({ userName }: { userName: string }) {
  const [draft, setDraft] = useState<BillDraft>(() => newDraft(userName));
  const [saved, setSaved] = useState<SplitBill | null>(null);
  const [bills, setBills] = useState<SplitBill[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<FriendGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupError, setGroupError] = useState("");
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
  const [deleteTarget, setDeleteTarget] = useState<SplitBill | null>(null);
  const [repayment, setRepayment] = useState<{ personId: string; name: string; remaining: number; requestId: string } | null>(null);
  const [repaymentOptions, setRepaymentOptions] = useState<RepaymentOptions | null>(null);
  const [repaymentDestination, setRepaymentDestination] = useState("");
  const repaymentLoad = useRef(0);
  const [editingItem, setEditingItem] = useState<BillItem | null>(null);
  const [totalsEdit, setTotalsEdit] = useState({ tax: "", tip: "", total: "" });
  const actionLock = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const calculation = calculateBill(draft);
  const dirty = saved ? JSON.stringify(draft) !== JSON.stringify(saved.data) : true;
  const disabled = busy || scanning || loading;
  const ready = draft.items.length > 0 && calculation.all_assigned && calculation.matches && calculation.allocated === calculation.total && calculation.subtotal > 0;
  const unassignedCount = draft.items.filter((item) => !item.people.length).length;
  const candidates = draft.people;
  const selectedFriendIds = friends.filter((friend) => draft.people.some((person) => person.id === `friend-${friend.id}`)).map((friend) => friend.id);

  useEffect(() => {
    let active = true;
    Promise.all([getFriends(), getSplitBills()]).then(([nextFriends, nextBills]) => {
      if (active) { setFriends(nextFriends); setBills(nextBills); }
    }).catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    void getFriendGroups().then((rows) => { if (active) setGroups(rows); }).catch(() => { if (active) setGroupError("Saved groups could not load. Retry from Groups."); });
    const refresh = () => { getSplitBills().then((nextBills) => {
      if (active) { setBills(nextBills);
        setSaved((current) => current ? nextBills.find((bill) => bill.id === current.id) ?? current : null); }
    }).catch((reason) => { if (active) setError(reason.message); }); };
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
  function requestDelete(bill: SplitBill) {
    setDeleteTarget(bill); setError(""); setDialog("delete");
  }
  function confirmDelete() {
    if (!deleteTarget) return;
    void action(async () => {
      await deleteSplitBill(deleteTarget.id);
      setBills((current) => current.filter((bill) => bill.id !== deleteTarget.id));
      if (saved?.id === deleteTarget.id) resetSplit();
      setDeleteTarget(null); setDialog(null);
      setMessage("Split deleted. Existing financial transactions have been kept.");
    });
  }
  async function openRepayment(personId: string, name: string, total: number) {
    if (!saved || dirty || disabled) return;
    const loadId = ++repaymentLoad.current;
    const remaining = saved.repayments?.[personId]?.remaining;
    setRepayment({ personId, name, remaining: remaining !== undefined ? toCents(remaining) : total, requestId: crypto.randomUUID() });
    setRepaymentOptions(null); setRepaymentDestination(""); setError(""); setDialog("repayment");
    try {
      const options = await getRepaymentOptions(saved.id, personId);
      if (loadId === repaymentLoad.current) {
        setRepaymentOptions(options);
        if (options.accounts.length === 1 && !options.transactions.length) setRepaymentDestination(`account:${options.accounts[0].id}`);
      }
    } catch (reason) { if (loadId === repaymentLoad.current) setError(reason instanceof Error ? reason.message : "Could not load receiving accounts. Close and retry."); }
  }
  function confirmRepayment(event: FormEvent) {
    event.preventDefault();
    if (!saved || !repayment || !repaymentDestination) return;
    const [kind, id] = repaymentDestination.split(":");
    void action(async () => {
      const bill = await markSplitPaid(saved.id, repayment.personId, { request_id: repayment.requestId,
        ...(kind === "account" ? { account_id: Number(id) } : { transaction_id: Number(id) }) });
      acceptSaved(bill); setDialog(null);
      setMessage(`${repayment.name} marked as paid. Repayment recorded in your finances.`);
    });
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
  function resetSplit() {
    setSaved(null); setDraft(newDraft(userName)); setPreview(""); setScanResult(null);
    setDialog(null); setEditingItem(null); setError("");
  }
  function startNewSplit() {
    if (dirty && (draft.title || draft.items.length)) {
      if (!ready) { setError("Finish assigning items and reviewing the receipt total before saving a new split. Your current split has been kept."); return; }
      void action(async () => {
        const bill = await saveSplitBill({ ...draft, title: draft.title.trim() || "Shared meal" }, saved?.id);
        setBills((current) => [bill, ...current.filter((entry) => entry.id !== bill.id)]);
        resetSplit(); setMessage("Split saved to history. Ready for a new split.");
      });
      return;
    }
    resetSplit(); setMessage("New split started. Your saved friends and groups are still available.");
  }
  function applyGroup(group: FriendGroup) {
    const selected = group.friend_ids.map((id) => friends.find((friend) => friend.id === id));
    if (selected.some((friend) => !friend)) { setError("Some friends in this group are unavailable. Add them before using the group."); return; }
    const people = [draft.people.find((person) => person.id === draft.self_id)!, ...selected.map((friend) => ({ id: `friend-${friend!.id}`, name: friend!.name }))];
    setDraft((current) => ({ ...current, people, items: current.items.map((item) => ({ ...item, people: item.people.filter((id) => people.some((person) => person.id === id)) })) }));
    setDialog(null); setError(""); setMessage(`${group.name} added. Choose who ordered each item.`);
  }
  function togglePerson(person: { id: string; name: string }) {
    if (person.id === draft.self_id) return;
    const included = draft.people.some((entry) => entry.id === person.id);
    if (!included && draft.people.length >= 50) { setError("A split can include up to 50 people."); return; }
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
  const reconciliation = !draft.items.length ? "Add a receipt to get started."
    : unassignedCount ? `Choose who ordered ${unassignedCount} remaining item${unassignedCount === 1 ? "" : "s"}.`
    : draft.receipt_total === null ? "Check the receipt total to finish."
    : !calculation.matches ? `The split is ${money(Math.abs(calculation.total - toCents(draft.receipt_total)))} ${calculation.total > toCents(draft.receipt_total) ? "above" : "below"} the receipt total.`
    : ready ? "Every share adds up to the receipt total." : "Check the item amounts before splitting.";

  if (loading) return <PageSkeleton page="split" />;

  return (
    <section className="page split-simple">
      <TopBar title="Split Bill" />
      <header className="sb-intro"><div><span className="sb-eyebrow">LESS MATH. MORE TIME TOGETHER.</span><h2>Share the meal.<br />Split it fairly.</h2><p>One receipt. Everyone's share, sorted.</p></div><div className="sb-intro-actions"><Button variant="secondary" disabled={disabled} onClick={startNewSplit}><Plus size={17} />{dirty && (draft.title || draft.items.length) ? "Save & new split" : "New split"}</Button><Button variant="ghost" disabled={disabled} onClick={() => setDialog("history")}><History size={17} /> Past splits</Button></div></header>
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
            <div className="sb-section-title"><span className="sb-step">2</span><h2>Who's splitting?</h2><Button variant="ghost" onClick={() => { setGroupName(""); setDialog("groups"); void getFriendGroups().then((rows) => { setGroups(rows); setGroupError(""); }).catch(() => setGroupError("Saved groups could not load. Close and reopen Groups to retry.")); }}><UsersRound size={17} /> Groups</Button></div>
            <div className="sb-people" aria-label="People on this bill">
              {candidates.map((person) => { const included = draft.people.some((entry) => entry.id === person.id); return <Button key={person.id} className={`sb-chip ${included ? "is-selected" : ""}`} variant="ghost" aria-pressed={included} disabled={person.id === draft.self_id} onClick={() => togglePerson(person)}><span className="sb-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span>{person.id === draft.self_id ? `${person.name} (you)` : person.name}{included && <Check size={15} aria-hidden="true" />}</Button>; })}
              <Button className="sb-add-person" variant="secondary" onClick={() => { setFriendName(""); setDialog("friends"); }}><Plus size={16} /> Add Friend</Button>
            </div>
          </GlassCard>
          <GlassCard className="sb-card">
            <div className="sb-section-title"><span className="sb-step">3</span><h2>Who ordered each item?</h2></div>
            <p className="sb-hint">Select the people who ordered each item. Shared items are divided equally between the selected people.</p>
            {!draft.items.length && <div className="sb-empty"><ReceiptText size={24} aria-hidden="true" /><p>Your receipt items will appear here.</p></div>}
            <div className="sb-items">{draft.items.map((entry) => <article className="sb-item" key={entry.id}>
              <div className="sb-item-top"><div><h3>{entry.name}</h3>{entry.quantity > 1 && <span className="sb-hint">{money(toCents(entry.price))} each</span>}</div><div className="sb-item-price"><strong>{money(toCents(entry.price) * entry.quantity)}</strong><IconButton aria-label={`Edit ${entry.name}`} onClick={() => setEditingItem({ ...entry })}><Pencil size={15} /></IconButton></div></div>
              <div className="sb-item-bottom"><div className="sb-assignments" role="group" aria-label={`Who ordered ${entry.name}?`}>
                {draft.people.map((person) => <label className={`sb-assignment ${entry.people.includes(person.id) ? "is-selected" : ""}`} key={person.id}><input type="checkbox" checked={entry.people.includes(person.id)} onChange={(event) => editItem(entry.id, { people: event.target.checked ? [...entry.people, person.id] : entry.people.filter((id) => id !== person.id) })} /><span>{person.id === draft.self_id ? "You" : person.name}</span></label>)}
                {draft.people.length > 1 && <Button variant="ghost" className="sb-everyone" onClick={() => editItem(entry.id, { people: draft.people.map((person) => person.id) })}>Everyone</Button>}
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
          {saved && <Button variant="ghost" className="sb-delete-current" disabled={disabled} onClick={() => requestDelete(saved)}><Trash2 size={16} /> Delete split</Button>}
          <div className="sb-share-grid">{calculation.people.map((person) => {
            const items = draft.items.filter((entry) => entry.people.includes(person.id));
            return <GlassCard className={`sb-share ${person.id === draft.self_id ? "sb-your-share" : ""}`} key={person.id} variant={person.id === draft.self_id ? "elevated" : "subtle"}>
              <div className="sb-share-heading"><span className="sb-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span><h3>{person.name}</h3>{person.id === draft.self_id && <span className="sb-you-label">Your share</span>}</div>
              {items.length ? <ul className="sb-person-items">{items.map((entry) => <li key={entry.id}>{entry.quantity > 1 ? `${entry.quantity} × ` : ""}{entry.name}{entry.people.length > 1 && <span>shared by {entry.people.length}</span>}</li>)}</ul> : <p className="sb-hint">No items selected yet.</p>}
              <dl className="sb-totals sb-person-totals"><div><dt>Items</dt><dd>{money(person.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(person.tax)}</dd></div><div><dt>Tip</dt><dd>{money(person.tip)}</dd></div><div className="sb-total"><dt>Total</dt><dd>{money(person.total)}</dd></div></dl>
              {person.id !== draft.self_id && <div className="sb-repayment-status">
                <Button variant={saved?.repayments?.[person.id]?.paid && !dirty ? "secondary" : "primary"}
                  disabled={disabled || !saved || dirty || person.total <= 0 || !!saved.repayments?.[person.id]?.paid || !!saved.repayments?.[person.id]?.needs_review}
                  aria-label={`${saved?.repayments?.[person.id]?.paid && !dirty ? "Paid" : "Mark as Paid"}: ${person.name}`}
                  onClick={() => void openRepayment(person.id, person.name, person.total)}>
                  {saved?.repayments?.[person.id]?.paid && !dirty ? <><CheckCircle2 size={16} /> Paid</> : "Mark as Paid"}
                </Button>
                {(!saved || dirty) && <p className="sb-hint">Save the split to record a repayment.</p>}
                {saved?.repayments?.[person.id]?.needs_review && <p className="sb-hint">Linked repayment changed. Review its bank transaction.</p>}
              </div>}
            </GlassCard>;
          })}</div>
          <div className="sb-finish"><p className={`sb-check ${ready ? "is-ready" : ""}`} role="status">{ready && <CheckCircle2 size={18} aria-hidden="true" />}{reconciliation}{draft.items.length > 0 && !calculation.matches && <Button variant="ghost" disabled={disabled} onClick={openTotals}>Review total</Button>}</p><Button className="sb-submit" type="submit" disabled={disabled || !ready}>{busy ? "Saving…" : "Split Bill"}<ArrowRight size={19} aria-hidden="true" /></Button></div>
        </section>
      </form>


      <Modal isOpen={dialog === "friends"} onClose={() => !busy && setDialog(null)} title="Add friends">
        <p className="sb-hint">Saved friends stay on your account. Select who is joining this split.</p>
        <div className="sb-saved-friends" role="group" aria-label="Saved friends">{friends.map((friend) => {
          const person = { id: `friend-${friend.id}`, name: friend.name };
          return <label className="sb-saved-friend" key={friend.id}><input type="checkbox" disabled={busy} checked={draft.people.some((entry) => entry.id === person.id)} onChange={() => togglePerson(person)} /><span>{friend.name}</span></label>;
        })}{!friends.length && <p className="sb-hint">Add a friend below to save them for future splits.</p>}</div>
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void action(async () => { const friend = await addFriend(friendName.trim()); setFriends((current) => [...current.filter((entry) => entry.id !== friend.id), friend]); const id = `friend-${friend.id}`; if (!draft.people.some((person) => person.id === id)) change("people", [...draft.people, { id, name: friend.name }]); setDialog(null); }); }}><TextField label="Friend's name" autoFocus required maxLength={100} disabled={busy} value={friendName} onChange={(event) => setFriendName(event.target.value)} /><Button disabled={busy || !friendName.trim()} type="submit">Add Friend</Button>{error && <p className="notice" role="alert">{error}</p>}</form>
        <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>Done</Button>
      </Modal>
      <Modal isOpen={dialog === "groups"} onClose={() => !busy && setDialog(null)} title="Saved groups">
        <div className="form-stack">{groupError && <p className="notice" role="alert">{groupError}</p>}{error && <p className="notice" role="alert">{error}</p>}
          {groups.map((group) => <Button variant="secondary" className="sb-group-entry" key={group.id} disabled={busy} onClick={() => applyGroup(group)}><UsersRound size={20} /><span><strong>{group.name}</strong><small>{group.friend_ids.map((id) => friends.find((friend) => friend.id === id)?.name ?? "Unavailable friend").join(", ")}</small></span><ArrowRight size={17} /></Button>)}
          {!groups.length && !groupError && <p className="sb-hint">Save the people you often go out with as a group.</p>}
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void action(async () => { const group = await saveFriendGroup(groupName.trim(), selectedFriendIds); setGroups((current) => [...current.filter((entry) => entry.id !== group.id), group]); setGroupName(""); setMessage("Group saved to your account."); setDialog(null); }); }}>
            <TextField label="Group name" value={groupName} maxLength={100} required disabled={busy} onChange={(event) => setGroupName(event.target.value)} placeholder="Weekend friends" />
            <p className="sb-hint">{selectedFriendIds.length ? `Save the ${selectedFriendIds.length} selected friend${selectedFriendIds.length === 1 ? "" : "s"}. You are included automatically when using a group.` : "Add friends to this split before saving a group."}</p>
            <Button type="submit" disabled={busy || !groupName.trim() || !selectedFriendIds.length}>Save current group</Button>
          </form>
        </div>
      </Modal>
      <Modal isOpen={dialog === "history"} onClose={() => setDialog(null)} title="Your splits"><div className="form-stack"><Button variant="secondary" onClick={startNewSplit}><Plus size={16} /> New split</Button>{bills.map((bill) => <div key={bill.id} className="sb-history-row"><Button className="sb-history-entry" variant="ghost" onClick={() => selectBill(bill.id)}><span>{bill.data.title}<small>{bill.data.bill_date}</small></span><strong>{money(bill.calculation.total)}</strong></Button><IconButton aria-label={`Delete split: ${bill.data.title}`} disabled={disabled} onClick={() => requestDelete(bill)}><Trash2 size={18} /></IconButton></div>)}{!bills.length && <p>No saved splits yet.</p>}</div></Modal>

      <Modal isOpen={dialog === "delete"} onClose={() => !busy && setDialog(null)} title="Delete this split?">
        <div className="form-stack"><p>Remove “{deleteTarget?.data.title}” from your saved splits? Existing financial transactions and recorded repayments will be kept.</p>
          {error && <p role="alert">{error}</p>}
          <div className="sb-dialog-actions"><Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={confirmDelete}>{busy ? "Deleting…" : "Delete split"}</Button></div>
        </div>
      </Modal>

      <Modal isOpen={dialog === "repayment"} onClose={() => !busy && setDialog(null)} title={`Mark ${repayment?.name ?? "friend"} as paid`}>
        <form className="form-stack" onSubmit={confirmRepayment}>
          <p>Record {money(repayment?.remaining ?? 0)} received from {repayment?.name}.</p>
          <p className="sb-hint">Choose where you received the money. Link an existing incoming transaction if it is already recorded. Repayments are excluded from regular income reports.</p>
          {!repaymentOptions && !error && <p role="status">Loading receiving options…</p>}
          {repaymentOptions && <label className="sb-repayment-select">Receiving account or transaction
            <select required value={repaymentDestination} disabled={busy} onChange={(event) => setRepaymentDestination(event.target.value)}>
              <option value="">Choose where the repayment was received</option>
              {!!repaymentOptions.transactions.length && <optgroup label="Link existing transaction (no new balance movement)">{repaymentOptions.transactions.map((transaction) => <option key={`transaction:${transaction.id}`} value={`transaction:${transaction.id}`}>{transaction.transaction_date} · {transaction.note || "Incoming transaction"} · {formatCurrency(Number(transaction.amount))}</option>)}</optgroup>}
              {!!repaymentOptions.accounts.length && <optgroup label="Record a new repayment">{repaymentOptions.accounts.map((account) => <option key={`account:${account.id}`} value={`account:${account.id}`}>{account.name}</option>)}</optgroup>}
            </select>
          </label>}
          {repaymentOptions && !repaymentOptions.accounts.length && !repaymentOptions.transactions.length && <p role="status">No eligible receiving account or matching incoming transaction. With Plaid, sync your bank after the repayment arrives. For manual tracking, add a receiving account first.</p>}
          {error && <p role="alert">{error}</p>}
          <div className="sb-dialog-actions"><Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={busy || !repaymentDestination}>{busy ? "Recording…" : "Confirm repayment"}</Button></div>
        </form>
      </Modal>
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
    </section>
  );
}
