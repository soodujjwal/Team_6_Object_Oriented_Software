export type ExtractionStatus = "unavailable" | "extracted";

export type ReceiptExtractionResult = {
  status: ExtractionStatus;
  message: string;
  merchant?: string;
  date?: string;
  paymentAccountHint?: string;
  total?: string;
  tax?: string;
  items?: { name: string; quantity: number; price: string }[];
};

export type BankStatementExtractionResult = {
  status: ExtractionStatus;
  message: string;
  transactions?: {
    amount: string;
    date: string;
    description: string;
    type?: "income" | "expense";
  }[];
};

/** Provider seam for a private OCR service. No document leaves the browser today. */
export async function extractReceipt(_file: File): Promise<ReceiptExtractionResult> {
  return {
    status: "unavailable",
    message: "OCR is not configured yet. Review the receipt image and enter the transaction details before saving.",
  };
}

export async function extractBankStatement(_file: File): Promise<BankStatementExtractionResult> {
  return {
    status: "unavailable",
    message: "PDF statement parsing is not configured yet. No transactions were created.",
  };
}
