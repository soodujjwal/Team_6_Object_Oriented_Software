export type BillPerson = { id: string; name: string };
export type BillItem = { id: string; name: string; quantity: number; price: string; people: string[] };
export type BillDraft = {
  title: string;
  people: BillPerson[];
  self_id: string;
  items: BillItem[];
  tax: string;
  tip: string;
  receipt_total: string | null;
  tip_method: "bank" | "cash";
  account_id: number | null;
  category: string;
  bill_date: string;
};
export const toCents = (value: string | null) => Math.round(Number(value || 0) * 100);

export function allocate(cents: number, weights: number[]): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!total || !Number.isSafeInteger(cents) || cents < 0 || weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) return weights.map(() => 0);
  const products = weights.map((weight) => BigInt(cents) * BigInt(weight));
  const divisor = BigInt(total);
  const shares = products.map((product) => Number(product / divisor));
  const order = weights.map((_, index) => index).sort((a, b) => Number(products[b] % divisor - products[a] % divisor) || a - b);
  order.slice(0, cents - shares.reduce((sum, value) => sum + value, 0)).forEach((index) => shares[index]++);
  return shares;
}

export function calculateBill(draft: BillDraft) {
  const subtotals = draft.people.map(() => 0);
  let subtotal = 0;
  let unassigned = 0;
  for (const item of draft.items) {
    const amount = toCents(item.price) * item.quantity;
    subtotal += amount;
    if (!item.people.length) unassigned += amount;
    else allocate(amount, draft.people.map((person) => Number(item.people.includes(person.id))))
      .forEach((share, index) => subtotals[index] += share);
  }
  const tax = toCents(draft.tax), tip = toCents(draft.tip);
  const taxes = allocate(tax, subtotals), tips = allocate(tip, subtotals);
  const total = subtotal + tax + tip;
  const people = draft.people.map((person, index) => ({ ...person, subtotal: subtotals[index], tax: taxes[index], tip: tips[index], total: subtotals[index] + taxes[index] + tips[index] }));
  return { subtotal, tax, tip, total, people, unassigned, all_assigned: draft.items.every((item) => item.people.length > 0),
    matches: draft.receipt_total !== null && draft.receipt_total !== "" && toCents(draft.receipt_total) === total,
    allocated: people.reduce((sum, person) => sum + person.total, 0), bank_debit: subtotal + tax + (draft.tip_method === "bank" ? tip : 0) };
}
