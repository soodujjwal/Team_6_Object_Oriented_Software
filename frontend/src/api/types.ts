export type TransactionType = "income" | "expense";

export type Account = {
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
