import { useMemo } from "react";
import qrcode from "qrcode-generator";

export function createApkQr(url: string) {
  const qr = qrcode(0, "M");
  qr.addData(url, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  // Four modules of quiet space on every side are required for reliable scanning.
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
  }
  return { size: count + 8, path };
}

export function ApkQrCode({ url }: { url: string }) {
  const code = useMemo(() => { try { return createApkQr(url); } catch { return undefined; } }, [url]);
  if (!code) return <p>Use the download button to get the Android app.</p>;
  return <a className="dl-qr-link" href={url} aria-label="Open the Finance Builder download page">
    <svg viewBox={`0 0 ${code.size} ${code.size}`} role="img" aria-label="QR code for the Finance Builder download page" shapeRendering="crispEdges">
      <rect width={code.size} height={code.size} fill="#fff" /><path d={code.path} fill="#102d20" />
    </svg>
  </a>;
}
