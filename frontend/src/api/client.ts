import type { User } from "./auth";

export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://127.0.0.1:8000";
export const AUTH_TOKEN_KEY = "pfm_access_token";
export const AUTH_USER_KEY = "pfm_user";
export const SESSION_EXPIRED_EVENT = "pfm:session-expired";
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

type CredentialStore = {
  getItem: (key: string) => string | null;
  clear: () => void;
  save: (token: string, user: User) => Promise<void>;
};
let credentialStore: CredentialStore | undefined;
export function configureCredentialStore(store: CredentialStore) { credentialStore = store; }
export function getAccessToken() { return credentialStore ? credentialStore.getItem(AUTH_TOKEN_KEY) : localStorage.getItem(AUTH_TOKEN_KEY); }
function getSavedUser() { return credentialStore ? credentialStore.getItem(AUTH_USER_KEY) : localStorage.getItem(AUTH_USER_KEY); }
export function clearSession() {
  if (credentialStore) credentialStore.clear();
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  invalidateReads();
}
export async function storeSession(token: string, user: User) {
  if (credentialStore) await credentialStore.save(token, user);
  else {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
  invalidateReads();
}
export const DATA_CHANGED_EVENT = "pfm:data-changed";
export const OFFLINE_MESSAGE = "You're offline. Connect to the internet to use Finance Builder.";
let connected = true;
export function setConnectivity(value: boolean) { connected = value; }
export function isConnected() { return connected && (typeof navigator === "undefined" || navigator.onLine !== false); }
let readGeneration = 0;
export function invalidateReads() { readGeneration++; pendingReads.clear(); }

// This only checks whether a cached session can be used. The backend still
// verifies the signature and authorizes every protected request.
export function isTokenCurrent(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function readStoredSession(): { user: User | null; expired: boolean } {
  const stored = getSavedUser();
  const token = getAccessToken();
  try {
    const user = stored ? JSON.parse(stored) as User : null;
    if (isTokenCurrent(token) && user && typeof user.id === "number" && typeof user.name === "string" && typeof user.email === "string") {
      return { user, expired: false };
    }
  } catch {
    // Corrupt browser storage should lead to Login, not a broken dashboard.
  }
  clearSession();
  return { user: null, expired: Boolean(stored || token) };
}

function expireSession(requestToken: string | null) {
  // An old request must not sign out a newly authenticated session.
  if (getAccessToken() !== requestToken) return;
  const hadSession = Boolean(requestToken || getSavedUser());
  clearSession();
  if (hadSession) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

type ReadOptions = { signal?: AbortSignal; timeoutMs?: number };
const pendingReads = new Map<string, Promise<unknown>>();

async function request<T>(path: string, method: string, body?: unknown, options: ReadOptions = {}, refreshed = false): Promise<T> {
  if (!isConnected()) throw new Error(OFFLINE_MESSAGE);
  const publicRoute = path === "/auth/login" || path === "/auth/register";
  const token = getAccessToken();
  if (!publicRoute && !isTokenCurrent(token)) {
    expireSession(token);
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  const headers: Record<string, string> = {};
  if (!publicRoute && token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") invalidateReads();
  const generation = readGeneration;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  // Slow server wake-ups are allowed, but reads must never spin indefinitely.
  // Financial writes are not automatically aborted or retried.
  const timer = method === "GET" ? setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 75_000) : undefined;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method, headers, signal: controller.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      if (!publicRoute && response.status === 401) {
        expireSession(token);
        throw new Error(SESSION_EXPIRED_MESSAGE);
      }
      throw new Error(await getErrorMessage(response));
    }
    const data = method === "DELETE" || response.status === 204 ? undefined : await response.json();
    if (!publicRoute && getAccessToken() !== token) throw new Error("The session changed. Please reopen this page.");
    if (method === "GET" && generation !== readGeneration) {
      if (refreshed) throw new Error("Data changed while loading. Please refresh.");
      return request<T>(path, method, body, options, true);
    }
    if (method !== "GET" && !publicRoute) {
      invalidateReads();
      if (!path.startsWith("/auth/")) window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
    }
    return data as T;
  } catch (error) {
    if (timedOut) throw new Error("The connection is taking too long. Please try again.");
    if (error instanceof TypeError) throw new Error(method === "GET" || publicRoute
      ? "Could not reach Finance Builder. Check your connection and try again."
      : "Could not confirm this change. Reconnect and refresh your records before trying again.");
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    if (method !== "GET") pendingReads.clear();
  }
}

export function apiGet<T>(path: string, options: ReadOptions = {}): Promise<T> {
  // Cancellable reads own their request so one component cannot cancel another.
  if (options.signal || options.timeoutMs !== undefined) return request<T>(path, "GET", undefined, options);
  const key = JSON.stringify([getAccessToken(), path]);
  const existing = pendingReads.get(key);
  if (existing) return existing as Promise<T>;
  const promise = request<T>(path, "GET").finally(() => {
    if (pendingReads.get(key) === promise) pendingReads.delete(key);
  });
  pendingReads.set(key, promise);
  return promise;
}
const pendingWrites = new Map<string, Promise<unknown>>();
function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const key = JSON.stringify([getAccessToken(), path, method, body]);
  const existing = pendingWrites.get(key);
  if (existing) return existing as Promise<T>;
  const promise = request<T>(path, method, body).finally(() => {
    if (pendingWrites.get(key) === promise) pendingWrites.delete(key);
  });
  pendingWrites.set(key, promise);
  return promise;
}
export const apiPost = <T>(path: string, body: unknown) => mutate<T>(path, "POST", body);
export const apiPatch = <T>(path: string, body: unknown) => mutate<T>(path, "PATCH", body);
export const apiPut = <T>(path: string, body: unknown) => mutate<T>(path, "PUT", body);
export const apiDelete = (path: string) => mutate<void>(path, "DELETE");

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  } catch {
    // Fall through to status text.
  }
  return `Request failed: ${response.status}`;
}
