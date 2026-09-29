import type { User } from "./auth";

export const API_BASE_URL = "http://127.0.0.1:8000";
export const AUTH_TOKEN_KEY = "pfm_access_token";
export const AUTH_USER_KEY = "pfm_user";
export const SESSION_EXPIRED_EVENT = "pfm:session-expired";
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

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
  const stored = localStorage.getItem(AUTH_USER_KEY);
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  try {
    const user = stored ? JSON.parse(stored) as User : null;
    if (isTokenCurrent(token) && user && typeof user.id === "number" && typeof user.name === "string" && typeof user.email === "string") {
      return { user, expired: false };
    }
  } catch {
    // Corrupt browser storage should lead to Login, not a broken dashboard.
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  return { user: null, expired: Boolean(stored || token) };
}

function expireSession(requestToken: string | null) {
  // An old request must not sign out a newly authenticated session.
  if (localStorage.getItem(AUTH_TOKEN_KEY) !== requestToken) return;
  const hadSession = Boolean(requestToken || localStorage.getItem(AUTH_USER_KEY));
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  if (hadSession) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const publicRoute = path === "/auth/login" || path === "/auth/register";
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!publicRoute && !isTokenCurrent(token)) {
    expireSession(token);
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  const headers: Record<string, string> = {};
  if (!publicRoute && token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    if (!publicRoute && response.status === 401) {
      expireSession(token);
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    throw new Error(await getErrorMessage(response));
  }
  if (method === "DELETE" || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => request<T>(path, "GET");
export const apiPost = <T>(path: string, body: unknown) => request<T>(path, "POST", body);
export const apiPatch = <T>(path: string, body: unknown) => request<T>(path, "PATCH", body);
export const apiPut = <T>(path: string, body: unknown) => request<T>(path, "PUT", body);
export const apiDelete = (path: string) => request<void>(path, "DELETE");

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
