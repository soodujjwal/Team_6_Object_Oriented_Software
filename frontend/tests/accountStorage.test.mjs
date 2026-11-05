import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../src/api/accountStorage.ts", import.meta.url), "utf8"))
  .replace('import { apiGet, apiPatch } from "./client";', 'const { apiGet, apiPatch } = globalThis.accountApi;');
let state = {}, fail = false;
const browser = new Map();
const events = [];
globalThis.localStorage = { getItem: (key) => browser.get(key) ?? null, removeItem: (key) => browser.delete(key) };
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
globalThis.window = { dispatchEvent: (event) => events.push(event) };
globalThis.accountApi = {
  apiGet: async () => ({ ...state }),
  apiPatch: async (path, payload) => {
    if (fail) throw new Error("offline");
    state[path.split("/").at(-1)] = payload.value;
    return payload;
  },
};
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const storage = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const user = { id: 1, email: "one@example.test" };

test("database state restores without local data and clears on account switch", async () => {
  state = { onboarding_complete: "true", budget_preferences: '{"needs":60}' };
  await storage.loadAccountStorage(user);
  assert.equal(storage.accountStorage.getItem(`pfm_onboarding_complete_${user.email}`), "true");
  assert.equal(storage.accountStorage.getItem("pfm_budget_preferences_v1"), '{"needs":60}');
  state = {};
  await storage.loadAccountStorage({ id: 2, email: "other@example.test" });
  assert.equal(storage.accountStorage.getItem("pfm_budget_preferences_v1"), null);
  assert.throws(() => storage.accountStorage.getItem(`pfm_onboarding_complete_${user.email}`));
});

test("only owner-named legacy data migrates automatically; shared data requires import", async () => {
  state = {};
  browser.set(`pfm_onboarding_complete_${user.email}`, "true");
  browser.set("pfm_onboarding_complete_other@example.test", "true");
  browser.set("pfm_import_history", "[]");
  await storage.loadAccountStorage(user);
  assert.equal(state.onboarding_complete, "true");
  assert.equal(browser.has(`pfm_onboarding_complete_${user.email}`), false);
  assert.equal(browser.has("pfm_onboarding_complete_other@example.test"), true);
  assert.equal(state.import_history, undefined);
  assert.equal(storage.hasLegacyBrowserSettings(), true);
  await storage.importLegacyBrowserSettings();
  assert.equal(state.import_history, "[]");
  assert.equal(browser.has("pfm_import_history"), false);
});

test("failed save reports an error and retries without writing browser storage", async () => {
  fail = true;
  storage.accountStorage.setItem("pfm_budget_preferences_v1", '{"needs":70}');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.at(-1).detail, true);
  assert.equal(browser.has("pfm_budget_preferences_v1"), false);
  fail = false;
  await storage.retryAccountSync();
  assert.equal(state.budget_preferences, '{"needs":70}');
  assert.equal(events.at(-1).detail, false);
});
