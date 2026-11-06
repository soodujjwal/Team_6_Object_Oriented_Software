import type { AccountPayload } from "../api/accounts";

export type WizardAccountType = "checking" | "savings" | "credit_card" | "other" | "";
export type BankAccountDraft = { bank: string; otherBank: string; type: WizardAccountType; balance: string; name: string; nameEdited: boolean };
export const accountTypeLabels = { checking: "Checking", savings: "Savings", credit_card: "Credit Card", other: "Other" };
export const newBankAccountDraft = (): BankAccountDraft => ({ bank: "", otherBank: "", type: "", balance: "0.00", name: "", nameEdited: false });
export const bankName = (draft: BankAccountDraft) => (draft.bank === "Other" ? draft.otherBank : draft.bank).trim();
export const suggestedAccountName = (draft: BankAccountDraft) => `${bankName(draft)} ${draft.type ? accountTypeLabels[draft.type] : ""}`.trim();
export const accountName = (draft: BankAccountDraft) => (draft.nameEdited ? draft.name : suggestedAccountName(draft)).trim();

export function normalizeOpeningBalance(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(trimmed)) return undefined;
  const [whole, fraction = ""] = trimmed.split(".");
  return `${Number(whole)}.${fraction.padEnd(2, "0")}`;
}

export function validateAccountStep(step: number, draft: BankAccountDraft): string {
  if (step === 0 && (!bankName(draft) || bankName(draft).length > 100)) return "Choose a bank or enter a bank name with 1–100 characters.";
  if (step === 1 && !draft.type) return "Choose an account type to continue.";
  if (step === 2 && normalizeOpeningBalance(draft.balance) === undefined) return "Enter an amount from $0.00 to $9,999,999,999.99 with up to two decimal places. Manual opening balances cannot be negative.";
  if (step === 3 && (!accountName(draft) || accountName(draft).length > 100)) return "Enter an account name with 1–100 characters.";
  return "";
}

export function accountPayload(draft: BankAccountDraft): AccountPayload {
  for (let step = 0; step < 4; step++) {
    const error = validateAccountStep(step, draft);
    if (error) throw new Error(error);
  }
  if (draft.type === "credit_card") throw new Error("Connect credit cards through Bank Sync with Plaid.");
  return { bank_name: bankName(draft), name: accountName(draft), account_type: draft.type as AccountPayload["account_type"], starting_balance: normalizeOpeningBalance(draft.balance)! };
}
