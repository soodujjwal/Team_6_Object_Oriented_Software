export type BankOption = {
  id: string;
  logoUrl?: string;
  name: string;
};

export const BANK_OPTIONS: BankOption[] = [
  { id: "chase", logoUrl: "https://logo.clearbit.com/chase.com?size=96", name: "Chase" },
  { id: "bank-of-america", logoUrl: "https://logo.clearbit.com/bankofamerica.com?size=96", name: "Bank of America" },
  { id: "wells-fargo", logoUrl: "https://logo.clearbit.com/wellsfargo.com?size=96", name: "Wells Fargo" },
  { id: "capital-one", logoUrl: "https://logo.clearbit.com/capitalone.com?size=96", name: "Capital One" },
  { id: "citibank", logoUrl: "https://logo.clearbit.com/citi.com?size=96", name: "Citibank" },
  { id: "us-bank", logoUrl: "https://logo.clearbit.com/usbank.com?size=96", name: "US Bank" },
  { id: "pnc-bank", logoUrl: "https://logo.clearbit.com/pnc.com?size=96", name: "PNC Bank" },
  { id: "other", name: "Other" },
];
