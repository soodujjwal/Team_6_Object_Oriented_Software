import { Capacitor, registerPlugin } from "@capacitor/core";
import type { User } from "../api/auth";
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, configureCredentialStore } from "../api/client";

const NativeSession = registerPlugin<{
  read(): Promise<{ value?: string }>;
  write(options: { value: string }): Promise<void>;
  clear(): Promise<void>;
}>("SecureSession");

export async function initializeNativeSession() {
  if (!Capacitor.isNativePlatform()) return;
  let session: { token: string; user: User } | undefined;
  const stored = await NativeSession.read();
  try { session = stored.value ? JSON.parse(stored.value) : undefined; } catch { await NativeSession.clear(); }
  // Never migrate plaintext credentials from an earlier development APK.
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  let queue: Promise<void> = Promise.resolve();
  configureCredentialStore({
    getItem: (key) => !session ? null : key === AUTH_TOKEN_KEY ? session.token : JSON.stringify(session.user),
    clear() {
      session = undefined;
      queue = queue.catch(() => {}).then(() => NativeSession.clear());
      void queue.catch(() => window.dispatchEvent(new Event("pfm:secure-storage-error")));
    },
    async save(token, user) {
      const next = { token, user };
      queue = queue.catch(() => {}).then(() => NativeSession.write({ value: JSON.stringify(next) }));
      await queue;
      session = next;
    },
  });
}
