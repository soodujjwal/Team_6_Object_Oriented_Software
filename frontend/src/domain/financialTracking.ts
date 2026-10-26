import type { Transaction } from "../api/types";

// Bank movements remain intact; budgets and reports use the user's own share.
export function reportingAmount(transaction: Transaction): number {
  if (transaction.financial_kind === "transfer" || transaction.financial_kind === "reimbursement"
      || transaction.receipt_metadata?.pending || transaction.receipt_metadata?.bank_removed) return 0;
  return Number(transaction.reporting_amount ?? transaction.amount);
}

export function isReportable(transaction: Transaction): boolean {
  return reportingAmount(transaction) > 0;
}
