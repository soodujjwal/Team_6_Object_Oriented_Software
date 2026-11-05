export type TransactionType = "income" | "expense";

export type Account = {
  bank_current_balance?: string | null;
  bank_available_balance?: string | null;
  bank_account_type?: string | null;
  bank_credit_limit?: string | null;
  debt_owed?: string | null;
  available_credit?: string | null;
  balance_synced_at?: string | null;
  estimated_balance?: string | null;
  unmatched_movement?: string;
  account_type: "savings" | "checking" | "other";
  id: number;
  bank_name: string;
  name: string;
  starting_balance: string;
  current_balance: string | null;
};

export type Transaction = {
  financial_kind?: "standard" | "reimbursement" | "transfer";
  reporting_amount?: string;
  personal_amount?: string | null;
  id: number;
  account_id: number;
  amount: string;
  category: string;
  transaction_type: TransactionType;
  transaction_date: string;
  note: string | null;
  receipt_items?: ReceiptItem[] | null;
  receipt_metadata?: ReceiptMetadata | null;
};

export type ReceiptItem = {
  name: string;
  quantity: number;
  price: string;
};

export type ReceiptMetadata = {
  transfer_id?: number;
  split_bill_id?: number;
  pending?: boolean;
  bank_removed?: boolean;
  matched_manual?: boolean;
  bank_description?: string;
  merchant?: string;
  subtotal?: string;
  tax?: string;
  tip?: string;
  currency?: string;
  source?: "receipt" | "csv" | "pdf" | "plaid";
  original_filename?: string;
};

export type Budget = {
  id: number;
  category: string;
  monthly_limit: string;
  month: number;
  year: number;
  used_amount: string | null;
  remaining_amount: string | null;
  usage_percent: string | null;
};
