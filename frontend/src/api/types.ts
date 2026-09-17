export type TransactionType = "income" | "expense";

export type Account = {
  account_type: "savings" | "checking" | "other";
  id: number;
  bank_name: string;
  name: string;
  starting_balance: string;
  current_balance: string | null;
};

export type Transaction = {
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
  merchant?: string;
  subtotal?: string;
  tax?: string;
  tip?: string;
  currency?: string;
  source?: "receipt" | "csv" | "pdf";
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
