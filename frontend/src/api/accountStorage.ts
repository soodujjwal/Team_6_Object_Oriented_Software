import { apiGet, apiPatch } from "./client";
import type { User } from "./auth";

// Financial records live in their own APIs. This stores the remaining setup
// and preference data under the authenticated account, never in browser storage.
const aliases: Record<string, string> = {
  pfm_budget_preferences_v1: "budget_preferences",
  pfm_import_history: "import_history",
  pfm_savings_goal_completed_months: "completed_goal_months",
};
let values: Record<string, string | null> = {};
let owner = "";
let generation = 0;
let saving = false;
const pending = new Map<string, string | null>();
export const ACCOUNT_SYNC_EVENT = "pfm:account-sync";
export const hasPendingAccountChanges = () => pending.size > 0;

export async function refreshAccountStorage() {
  if (!owner || saving || pending.size) return;
  const current = generation;
  const stored = await apiGet<Record<string, string | null>>("/auth/state");
  if (current === generation && !saving && !pending.size) values = stored;
}

export function hasLegacyBrowserSettings() {
  try { return Object.keys(aliases).some((key) => localStorage.getItem(key) !== null && !(aliases[key] in values)); }
  catch { return false; }
}

export async function importLegacyBrowserSettings() {
  const current = generation;
  for (const [legacyKey, name] of Object.entries(aliases)) {
    if (name in values) continue;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) continue;
    await apiPatch(`/auth/state/${name}`, { value: legacy });
    if (current !== generation) return;
    values[name] = legacy;
    localStorage.removeItem(legacyKey);
  }
}

function keyFor(key: string) {
  if (aliases[key]) return aliases[key];
  const prefixes: Record<string, string> = {
    pfm_onboarding_complete_: "onboarding_complete", pfm_onboarding_step_: "onboarding_step",
    pfm_onboarding_: "onboarding_draft", pfm_financial_goals_: "financial_goals",
  };
  for (const [prefix, name] of Object.entries(prefixes)) {
    if (key === `${prefix}${owner}`) return name;
  }
  throw new Error("Unknown account preference.");
}

function announce(error: boolean) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_SYNC_EVENT, { detail: error }));
}

export async function retryAccountSync() {
  if (saving) return;
  saving = true;
  const current = generation;
  try {
    while (pending.size && current === generation) {
      const [key, value] = pending.entries().next().value!;
      await apiPatch(`/auth/state/${key}`, { value });
      if (current !== generation) return;
      if (pending.get(key) === value) pending.delete(key);
    }
    if (current === generation) announce(false);
  } catch {
    if (current === generation) announce(true);
  } finally {
    saving = false;
    if (current !== generation && pending.size) void retryAccountSync();
  }
}

export function clearAccountStorage() {
  generation++;
  owner = "";
  values = {};
  pending.clear();
}

export async function loadAccountStorage(user: User, signal?: AbortSignal) {
  clearAccountStorage();
  const current = generation;
  const stored = await apiGet<Record<string, string | null>>("/auth/state", { signal });
  if (current !== generation) return false;
  owner = user.email;
  values = stored;
  // Only migrate legacy entries explicitly named for this account. Shared
  // browser preferences have no reliable owner and must not leak across users.
  for (const prefix of ["pfm_onboarding_complete_", "pfm_onboarding_step_", "pfm_onboarding_", "pfm_financial_goals_"]) {
    const legacyKey = `${prefix}${user.email}`;
    const key = keyFor(legacyKey);
    let legacy: string | null = null;
    try { legacy = localStorage.getItem(legacyKey); } catch { continue; }
    try {
      if (legacy !== null && !(key in values)) {
        await apiPatch(`/auth/state/${key}`, { value: legacy });
        if (current !== generation) return false;
        values[key] = legacy;
        localStorage.removeItem(legacyKey);
      }
    } catch {
      throw new Error("Could not restore saved setup data. Please retry.");
    }
  }
  return true;
}

export const accountStorage = {
  getItem(key: string) { return values[keyFor(key)] ?? null; },
  setItem(key: string, value: string) {
    const name = keyFor(key);
    if (values[name] === value) return;
    values[name] = value;
    pending.set(name, value);
    void retryAccountSync();
  },
  removeItem(key: string) {
    const name = keyFor(key);
    values[name] = null;
    pending.set(name, null);
    void retryAccountSync();
  },
};
