import { useRef, useState, type FormEvent } from "react";
import type { Account } from "../api/types";
import { moveFunds } from "../api/transfers";
import { formatCurrency } from "../utils/format";
import { Button, GlassCard, GlassSelect, Modal, TextField } from "./ui";

export function MoveFunds({ accounts }: { accounts: Account[] }) {
  const savings = accounts.filter((account) => account.account_type === "savings");
  const checking = accounts.filter((account) => account.account_type === "checking");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const source = savings.find((account) => String(account.id) === from);
  const destination = checking.find((account) => String(account.id) === to);
  const balance = source?.current_balance ?? "0";
  const cents = Math.round(Number(amount) * 100);
  const exceedsBalance = cents > Math.round(Number(balance) * 100);
  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount) && cents > 0 && !exceedsBalance;

  function showForm() {
    setFrom(String(savings[0]?.id ?? ""));
    setTo(String(checking[0]?.id ?? ""));
    setAmount("");
    setNote("");
    setError("");
    setSuccess("");
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !source || !destination || !validAmount) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      await moveFunds({ from_account_id: source.id, to_account_id: destination.id, amount, note: note.trim() || undefined });
      setSuccess(`${formatCurrency(amount)} moved from ${source.name} to ${destination.name}.`);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not move funds.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (!savings.length) return null;

  const options = (items: Account[]) => items.map((account) => ({
    value: String(account.id),
    label: `${account.name} · ${account.bank_name} · #${account.id} · ${formatCurrency(account.current_balance ?? "0")}`,
  }));

  return (
    <>
      <GlassCard className="settings-panel">
        <h2>Move Funds</h2>
        <p>Transfer money from Savings to Checking.</p>
        <Button onClick={showForm} variant="secondary">Move Funds</Button>
        {success && <p className="notice" role="status">{success}</p>}
      </GlassCard>
      <Modal isOpen={open} onClose={() => !submitting.current && setOpen(false)} title="Move Funds">
        <form className="form-stack" onSubmit={submit}>
          <GlassSelect disabled={saving} label="From account" onChange={setFrom} options={options(savings)} placeholder="Select Savings account" value={from} />
          <GlassSelect disabled={saving || !checking.length} label="To account" onChange={setTo} options={options(checking)} placeholder="Select Checking account" value={to} />
          {!checking.length && <p className="notice">Create a Checking account in Settings to move funds.</p>}
          {source && <p className="caption-text">Available Savings balance: {formatCurrency(balance)}</p>}
          <TextField disabled={saving} label="Amount" min="0.01" max={balance} step="0.01" type="number" required value={amount} onChange={(event) => setAmount(event.target.value)} />
          {exceedsBalance && <p className="notice" role="alert">Amount exceeds the available Savings balance.</p>}
          <TextField disabled={saving} label="Note (optional)" maxLength={255} value={note} onChange={(event) => setNote(event.target.value)} />
          {error && <p className="notice" role="alert">{error}</p>}
          <Button disabled={saving || !source || !destination || !validAmount} type="submit">{saving ? "Moving funds..." : "Move Funds"}</Button>
        </form>
      </Modal>
    </>
  );
}
