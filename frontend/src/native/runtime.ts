import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { setConnectivity } from "../api/client";

export async function initializeNativeRuntime() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.dataset.native = "true";
  const status = await Network.getStatus();
  setConnectivity(status.connected);
  await Network.addListener("networkStatusChange", ({ connected }) => {
    setConnectivity(connected);
    window.dispatchEvent(new Event(connected ? "online" : "offline"));
  });
  await App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event("pfm:foreground"));
  });
  await App.addListener("backButton", () => {
    const hasOpenOverlay = Array.from(document.querySelectorAll('[role="dialog"], .drawer-layer.open, .notifications-panel, [aria-haspopup="listbox"][aria-expanded="true"]'))
      .some((element) => !element.closest('[aria-hidden="true"]'));
    if (hasOpenOverlay) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      return;
    }
    const back = new Event("pfm:android-back", { cancelable: true });
    if (window.dispatchEvent(back)) void App.minimizeApp();
  });
}
