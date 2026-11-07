import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativePlaidResult = { status: "success"; publicToken: string; metadata: { institution?: { institution_id: string; name: string } } } | { status: "cancelled" };
const NativePlaid = registerPlugin<{ open(options: { token: string }): Promise<NativePlaidResult> }>("FinancePlaid");
export const usesAndroidPlaid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
export async function openAndroidPlaid(token: string): Promise<NativePlaidResult> {
  if (!Capacitor.isPluginAvailable("FinancePlaid")) throw new Error("Install the latest Finance Builder APK to connect a bank.");
  return NativePlaid.open({ token });
}
