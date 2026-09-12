import { Coffee, ShoppingCart } from "lucide-react";
import type { Transaction } from "../api/types";
import { formatCurrency, formatDate } from "../utils/format";
import { GlassCard } from "./ui";

type TransactionItemProps = {
  transaction: Transaction;
};

export function TransactionItem({ transaction }: TransactionItemProps) {
  const isIncome = transaction.transaction_type === "income";
  const Icon = transaction.category.toLowerCase().includes("coffee") ? Coffee : ShoppingCart;

  return (
    <GlassCard className="transaction-item" variant="subtle">
      <div className="transaction-icon">
        <Icon size={19} />
      </div>
      <div>
        <strong>{transaction.note || transaction.category}</strong>
        <span>{formatDate(transaction.transaction_date)}</span>
      </div>
      <b className={isIncome ? "positive" : "negative"}>
        {isIncome ? "+" : "-"} {formatCurrency(transaction.amount)}
      </b>
    </GlassCard>
  );
}
