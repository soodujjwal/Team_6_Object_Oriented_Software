export type AndroidRelease = { url?: string; version?: string; sizeBytes?: number };

export function getAndroidRelease(config: { url?: string; version?: string; sizeBytes?: string }): AndroidRelease {
  try {
    const url = new URL(config.url?.trim() || "");
    if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) return {};
    const sizeBytes = Number(config.sizeBytes);
    return { url: url.href, version: config.version?.trim() || undefined,
      sizeBytes: Number.isSafeInteger(sizeBytes) && sizeBytes > 0 ? sizeBytes : undefined };
  } catch { return {}; }
}

export function formatApkSize(bytes: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(bytes / 1_000_000)} MB`;
}
