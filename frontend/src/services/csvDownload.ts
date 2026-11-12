import { Capacitor, registerPlugin } from "@capacitor/core";

type SaveResult = { saved: boolean };
const NativeCsv = registerPlugin<{ save(options: { filename: string; content: string }): Promise<SaveResult> }>("FinanceCsv");

export async function downloadCsv(csv: string, filename: string): Promise<"saved" | "started" | "canceled"> {
  const content = `\uFEFF${csv}`;
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable("FinanceCsv")) {
      throw new Error("Install the latest Finance Builder app or export from your browser.");
    }
    return (await NativeCsv.save({ filename, content })).saved ? "saved" : "canceled";
  }

  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    return "started";
  } finally {
    link.remove();
    // Give the browser time to start reading the file before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
