import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CreditCard, Landmark, LoaderCircle, PiggyBank, Plus, Wallet } from "lucide-react";
import { createAccount } from "../api/accounts";
import type { Account } from "../api/types";
import { accountName, accountPayload, accountTypeLabels, bankName, newBankAccountDraft, normalizeOpeningBalance, validateAccountStep, type BankAccountDraft } from "../domain/bankAccountWizard";
import { formatCurrency } from "../utils/format";
import { BankSelector } from "./BankSelector";
import { Button, Modal, TextField } from "./ui";
import "./CreateBankAccountFlow.css";

const questions = ["Which bank do you use?", "What type of account is it?", "What's your starting balance?", "Name your account", "Ready to add your account?"];
const types = [
  { value: "checking", icon: Wallet, detail: "Everyday spending and payments" },
  { value: "savings", icon: PiggyBank, detail: "Money set aside for your plans" },
  { value: "credit_card", icon: CreditCard, detail: "Connect securely through Plaid" },
  { value: "other", icon: Landmark, detail: "Another manually tracked account" },
] as const;

type Props = { onCreated: (account: Account) => void; onConnectCredit: () => void; openRequest?: number; onOpenHandled?: () => void };

export function CreateBankAccountFlow({ onCreated, onConnectCredit, openRequest, onOpenHandled }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(newBankAccountDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Account | null>(null);
  const pending = useRef(false);
  const stepRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const handledOpen = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!openRequest || handledOpen.current === openRequest) return;
    handledOpen.current = openRequest;
    setDraft(newBankAccountDraft()); setStep(0); setError(""); setCreated(null); setOpen(true);
    onOpenHandled?.();
  }, [openRequest, onOpenHandled]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      stepRef.current?.querySelector<HTMLElement>("input, button, [tabindex='-1']")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [step, open, created]);

  function edit(update: Partial<BankAccountDraft>) { setDraft((current) => ({ ...current, ...update })); setError(""); }
  function close() { if (!pending.current) setOpen(false); }
  function start() { setDraft(newBankAccountDraft()); setStep(0); setError(""); setCreated(null); setOpen(true); }
  function next(event: FormEvent) {
    event.preventDefault();
    if (pending.current || created || step === 4) return;
    const message = validateAccountStep(step, draft);
    if (message) { setError(message); return; }
    if (step === 1 && draft.type === "credit_card") { setOpen(false); onConnectCredit(); return; }
    if (step === 2) edit({ balance: normalizeOpeningBalance(draft.balance)! });
    setError(""); setStep((current) => current + 1);
  }
  async function confirm() {
    if (pending.current || created || step !== 4) return;
    let payload;
    try { payload = accountPayload(draft); } catch (failure) { setError((failure as Error).message); return; }
    pending.current = true; setSaving(true); setError("");
    try {
      const account = await createAccount(payload);
      setCreated(account);
      onCreated(account);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create your account. Please try again.");
    } finally { pending.current = false; setSaving(false); }
  }

  return <div className="bank-account-launcher">
    <Button onClick={start}><Plus size={18} aria-hidden="true" />Create Bank Account</Button>
    <Modal className="bank-account-modal" isOpen={open} onClose={close} title="Create Bank Account">
      {created ? <div className="bank-wizard-success" ref={stepRef} role="status"><span className="bank-wizard-success-icon"><CheckCircle2 size={33} /></span><h3 tabIndex={-1}>Account created</h3><p><strong>{created.name}</strong> is ready. You can find it in Your Accounts.</p><Button onClick={close}>Done<Check size={17} aria-hidden="true" /></Button></div> : <>
        <div className="bank-wizard-progress"><span aria-live="polite">Step {step + 1} of 5</span><div role="progressbar" aria-label="Account creation progress" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1}>{questions.map((question, index) => <i key={question} className={index <= step ? "active" : ""} />)}</div></div>
        <form onSubmit={next} noValidate>
          <fieldset disabled={saving} className="bank-wizard-fields">
            <div className="bank-wizard-step" key={step} ref={stepRef}>
              <h3 tabIndex={step === 4 ? -1 : undefined}>{questions[step]}</h3>
              {step === 0 && <>
                <BankSelector inlineMenu label="Bank" value={draft.bank} onChange={(bank) => edit({ bank })} />
                {draft.bank === "Other" && <TextField label="Bank name" placeholder="Enter your bank's name" maxLength={100} value={draft.otherBank} onChange={(event) => edit({ otherBank: event.target.value })} aria-describedby={error ? errorId : undefined} />}
              </>}
              {step === 1 && <><div className="bank-wizard-types" role="group" aria-label="Account type">{types.map(({ value, icon: Icon, detail }) => <button key={value} type="button" aria-pressed={draft.type === value} className={`bank-wizard-type${draft.type === value ? " selected" : ""}`} onClick={() => edit({ type: value })}><span><Icon size={21} /></span><span><strong>{accountTypeLabels[value]}</strong><small>{detail}</small></span><span className="bank-wizard-check">{draft.type === value && <Check size={14} />}</span></button>)}</div>{draft.type === "credit_card" && <p className="bank-wizard-hint" role="status">Credit cards use Bank Sync. Continue to connect through Plaid; this will not create a manual account.</p>}</>}
              {step === 2 && <><TextField label="Starting balance" icon={<span aria-hidden="true">$</span>} inputMode="decimal" type="text" autoComplete="off" value={draft.balance} onChange={(event) => edit({ balance: event.target.value })} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : "bank-balance-hint"} /><p className="bank-wizard-hint" id="bank-balance-hint">Enter the amount you want to start tracking. Manual opening balances must be $0.00 or more.</p></>}
              {step === 3 && <TextField label="Account name" maxLength={100} autoComplete="off" value={draft.nameEdited ? draft.name : accountName(draft)} onChange={(event) => edit({ name: event.target.value, nameEdited: true })} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />}
              {step === 4 && <dl className="bank-wizard-summary"><div><dt>Bank</dt><dd>{bankName(draft)}</dd></div><div><dt>Account type</dt><dd>{draft.type && accountTypeLabels[draft.type]}</dd></div><div><dt>Starting balance</dt><dd>{formatCurrency(draft.balance)}</dd></div><div><dt>Account name</dt><dd>{accountName(draft)}</dd></div><div><dt>Tracking</dt><dd>Manual account</dd></div></dl>}
            </div>
            {error && <p className="bank-wizard-error" role="alert" id={errorId}>{error}</p>}
            <div className="bank-wizard-actions"><Button variant="ghost" onClick={step === 0 ? close : () => { setStep((current) => current - 1); setError(""); }}>{step === 0 ? "Cancel" : <><ArrowLeft size={15} aria-hidden="true" />Back</>}</Button>
              {step === 4 ? <Button onClick={() => void confirm()} disabled={saving}>{saving ? <><LoaderCircle className="bank-wizard-spinner" size={17} />Creating…</> : <>Create Bank Account<Check size={16} aria-hidden="true" /></>}</Button> : <Button type="submit">{step === 1 && draft.type === "credit_card" ? "Go to Bank Sync" : "Continue"}<ArrowRight size={16} aria-hidden="true" /></Button>}
            </div>
          </fieldset>
          <p className="bank-wizard-footer" aria-live="polite">{saving ? "Creating your account. Please keep this window open." : "Nothing is saved until you confirm. No bank login details are needed."}</p>
        </form>
      </>}
    </Modal>
  </div>;
}
