import type { TransactionType } from "../api/types";

export type TransactionCategory = {
  id: string;
  label: string;
};

export const TRANSACTION_CATEGORIES: Record<TransactionType, TransactionCategory[]> = {
  expense: [
    { id: "food-dining", label: "Food & Dining" },
    { id: "transportation", label: "Transportation" },
    { id: "housing", label: "Housing" },
    { id: "groceries", label: "Groceries" },
    { id: "entertainment", label: "Entertainment" },
    { id: "shopping", label: "Shopping" },
    { id: "utilities", label: "Utilities" },
    { id: "health-medical", label: "Health & Medical" },
    { id: "travel", label: "Travel" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "education", label: "Education" },
    { id: "debt-payment", label: "Debt Payment" },
    { id: "personal-care", label: "Personal Care" },
    { id: "pets", label: "Pets" },
    { id: "other", label: "Other" },
  ],
  income: [
    { id: "salary", label: "Salary" },
    { id: "freelance", label: "Freelance" },
    { id: "business-income", label: "Business Income" },
    { id: "gifts", label: "Gifts" },
    { id: "investment-income", label: "Investment Income" },
    { id: "interest", label: "Interest" },
    { id: "rental-income", label: "Rental Income" },
    { id: "refund", label: "Refund" },
    { id: "bonus", label: "Bonus" },
    { id: "tax-refund", label: "Tax Refund" },
    { id: "other", label: "Other" },
  ],
};

export function getCategoriesForType(type: TransactionType) {
  return TRANSACTION_CATEGORIES[type];
}

export function getDefaultCategory(type: TransactionType) {
  return getCategoriesForType(type)[0].label;
}
