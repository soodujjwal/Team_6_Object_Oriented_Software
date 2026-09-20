import { useEffect, useState, type FormEvent } from "react";
import { request, dollars, today, type Demo, type Result, type Transaction } from "./api";

export default function App() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [page, setPage] = useState<"check" | "log">("check");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [price, setPrice] = useState("");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<Transaction["transaction_type"]>("expense");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  async function load() {
    setBusy(true); setError("");
    try { setDemo(await request<Demo>("demo")); }
    catch { setError("Could not load the demo. Check that the backend is running, then retry."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  async function check(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try { setResult(await request<Result>("affordability", { amount: price })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not check this purchase."); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      setDemo(await request<Demo>("transactions", {
        amount, category, transaction_type: type, transaction_date: date, note,
      }));
      setAmount(""); setCategory(""); setNote(""); setResult(null);
      setNotice(`${type === "expense" ? "Expense" : "Income"} saved. The account balance has been updated.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Please retry."); }
    finally { setBusy(false); }
  }

  async function reset() {
    if (!window.confirm("Remove all demo changes and restore the three sample transactions?")) return;
    setBusy(true); setError("");
    try {
      setDemo(await request<Demo>("reset", {})); setResult(null); setPrice(""); setItem("");
      setAmount(""); setCategory(""); setNote(""); setType("expense"); setDate(today());
      setNotice("Demo restored.");
    } catch { setError("Could not reset the demo. Please retry."); }
    finally { setBusy(false); }
  }

  return <main>
    <header className="heading">
      <div><p className="eyebrow">ITERATION 1 · DEMO</p><h1>Personal Finance Manager</h1></div>
      <button className="secondary" disabled={busy || !demo} onClick={reset}>Reset demo</button>
    </header>
    <p className="intro">Log your spending. Check whether your next purchase fits.</p>
    <p className="demo-note">One preset account · Changes last until the server restarts or the demo is reset.</p>
    {error && <div className="error" role="alert">{error} {!demo && <button disabled={busy} onClick={load}>Retry</button>}</div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!demo ? <p role="status">{busy ? "Loading demo account…" : "Demo unavailable."}</p> : <>
      <section className="balances" aria-label="Demo account summary">
        <div><span>{demo.name}</span><strong>{dollars(demo.current_balance)}</strong><small>Current balance</small></div>
        <div><span>Preset reserves</span><strong>{dollars(demo.upcoming_required)} + {dollars(demo.savings_remaining)}</strong><small>Upcoming bills + savings</small></div>
        <div><span>Available for a purchase</span><strong>{dollars(demo.spendable)}</strong><small>After both reserves</small></div>
      </section>
      <nav aria-label="Demo features">
        <button aria-pressed={page === "check"} disabled={busy} onClick={() => { setPage("check"); setError(""); setNotice(""); }}>Can I afford it?</button>
        <button aria-pressed={page === "log"} disabled={busy} onClick={() => { setPage("log"); setError(""); setNotice(""); }}>Spending log</button>
      </nav>
      {page === "check" ? <section className="panel" aria-labelledby="check-title">
        <h2 id="check-title">Can I afford it?</h2>
        <p>Check a one-time purchase against your balance and preset reserves.</p>
        <form onSubmit={check}>
          <fieldset disabled={busy}>
            <label>Item (optional)<input value={item} maxLength={80} placeholder="e.g. Textbook" onChange={e => { setItem(e.target.value); setResult(null); }} /></label>
            <label>Purchase price ($)<input type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={price} placeholder="60.00" onChange={e => { setPrice(e.target.value); setResult(null); }} /></label>
            <button type="submit">{busy ? "Checking…" : "Check purchase"}</button>
          </fieldset>
        </form>
        {result && <section className={`result ${result.can_afford ? "fits" : "short"}`} role="status">
          <h3>{result.can_afford ? "Fits the demo plan" : "Does not fit the demo plan"}{item ? `: ${item}` : ""}</h3>
          <p>{result.message}</p>
          <dl>
            <div><dt>Current balance</dt><dd>{dollars(result.current_available)}</dd></div>
            <div><dt>Upcoming bills (preset)</dt><dd>− {dollars(result.upcoming_required)}</dd></div>
            <div><dt>Savings reserve (preset)</dt><dd>− {dollars(result.savings_remaining)}</dd></div>
            <div><dt>Purchase price</dt><dd>− {dollars(result.purchase_amount)}</dd></div>
            <div className="total"><dt>Unreserved money after purchase</dt><dd>{dollars(result.projected_remaining)}</dd></div>
          </dl>
          <p className="small">Checking a purchase does not add it to your spending log.</p>
        </section>}
        <aside><strong>Iteration 1 assumptions</strong><p>The $800 is for unpaid upcoming bills; the $100 is an additional savings reserve. These stay fixed in this prototype. Log everyday spending and income here; automatic bill matching and editable reserves are planned for later.</p></aside>
      </section> : <section className="panel" aria-labelledby="log-title">
        <h2 id="log-title">Spending log</h2>
        <p>Add a completed expense or income to the same demo account.</p>
        <form onSubmit={save}>
          <fieldset disabled={busy} className="entry-grid">
            <label>Type<select value={type} onChange={e => setType(e.target.value as Transaction["transaction_type"])}><option value="expense">Expense</option><option value="income">Income</option></select></label>
            <label>Amount ($)<input type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <label>Category<input required maxLength={40} value={category} placeholder={type === "expense" ? "e.g. Food" : "e.g. Paycheck"} onChange={e => setCategory(e.target.value)} /></label>
            <label>Date<input type="date" required max={today()} value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="wide">Note (optional)<input maxLength={160} value={note} onChange={e => setNote(e.target.value)} /></label>
            <button type="submit">{busy ? "Saving…" : `Save ${type}`}</button>
          </fieldset>
        </form>
        <h3>Transactions ({demo.transactions.length})</h3>
        <p className="small">Newest entries first. Opening balance: {dollars(demo.starting_balance)}.</p>
        <div className="table-scroll"><table>
          <caption className="sr-only">Demo account income and expenses</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Category / note</th><th scope="col">Type</th><th scope="col">Amount</th></tr></thead>
          <tbody>{demo.transactions.map((t, i) => <tr key={i}><td>{t.transaction_date}</td><td>{t.category}{t.note && <small>{t.note}</small>}</td><td>{t.transaction_type}</td><td className="amount">{t.transaction_type === "income" ? "+" : "−"}{dollars(t.amount)}</td></tr>)}</tbody>
        </table></div>
      </section>}
    </>}
  </main>;
}
