import { Capacitor } from "@capacitor/core";

export const isNativeApp = () => Capacitor.isNativePlatform();

export function detectDevice(userAgent = navigator.userAgent, platform = navigator.platform, touchPoints = navigator.maxTouchPoints): "android" | "ios" | "desktop" {
  if (/android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && touchPoints > 1)) return "ios";
  return "desktop";
}

export function downloadUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || (url.origin === window.location.origin && url.protocol === "http:") ? url.href : undefined;
  } catch { return undefined; }
}
