export function parseReceiptText(text: string) {
  const items: { name: string; quantity: number; price: string }[] = [];
  let tax = "0.00", tip = "0.00", total: string | null = null, subtotal: string | null = null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^(.*?)\s+\$?([\d,]+[.]\d{2})\s*[A-Z]?$/i);
    if (!match) continue;
    const label = match[1].trim();
    const price = match[2].replaceAll(",", "");
    if (/\bsub\s*total\b/i.test(label)) { subtotal = price; continue; }
    if (/\b(suggested|suggestion|%|balance|change|tender|visa|mastercard|cash|credit|debit|savings|discount)\b/i.test(label)) continue;
    if (/\b(tax|sales tax)\b/i.test(label)) { tax = (Number(tax) + Number(price)).toFixed(2); continue; }
    if (/\b(tip|gratuity)\b/i.test(label)) { tip = price; continue; }
    if (/\b(total|amount due)\b/i.test(label)) { total = price; continue; }
    // Receipt amounts normally represent line totals. Preserve that total as one
    // editable line instead of guessing a unit price that could change the bill.
    if (label && !/^-/.test(label)) items.push({ name: label, quantity: 1, price });
  }
  return { title: lines[0] ?? "Split bill", items, subtotal, tax, tip, total };
}

export async function scanSplitReceipt(file: File, progress: (message: string) => void) {
  if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) throw new Error("Use a JPG, PNG, WebP, or BMP receipt image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a receipt image smaller than 20 MB.");
  const { createWorker } = await import("tesseract.js");
  let fail: (reason: Error) => void = () => {};
  const failure = new Promise<never>((_, reject) => { fail = reject; });
  const timeout = window.setTimeout(() => fail(new Error("Scanning timed out. Check your connection or enter the receipt manually.")), 120_000);
  let expired = false;
  const pendingWorker = createWorker("eng", 1, {
    logger: (event) => progress(`${event.status} ${Math.round((event.progress ?? 0) * 100)}%`),
    errorHandler: () => fail(new Error("Could not read the receipt. Check your connection and try a clearer image, or enter the items manually.")),
  });
  // A worker that finishes loading after a timeout must not stay alive.
  void pendingWorker.then((worker) => { if (expired) void worker.terminate(); }, () => {});
  let worker: Awaited<typeof pendingWorker> | undefined;
  try {
    worker = await Promise.race([pendingWorker, failure]);
    const result = await Promise.race([worker.recognize(file), failure]);
    return { text: result.data.text, ...parseReceiptText(result.data.text) };
  } finally {
    expired = true;
    window.clearTimeout(timeout);
    if (worker) await worker.terminate();
  }
}
