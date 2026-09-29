import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/api/client.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const user = { id: 1, name: "Test", email: "test@example.com" };
const token = (seconds = 3600, sub = "test") => `header.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + seconds, sub })).toString("base64url")}.signature`;
let events;
beforeEach(() => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  events = 0;
  globalThis.window = { dispatchEvent: () => { events++; } };
  globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
});
function session(value = token()) {
  localStorage.setItem(api.AUTH_TOKEN_KEY, value);
  localStorage.setItem(api.AUTH_USER_KEY, JSON.stringify(user));
  return value;
}

test("restore requires both a valid cached profile and an unexpired token", () => {
  session();
  assert.deepEqual(api.readStoredSession(), { user, expired: false });
  session(token(-60));
  assert.deepEqual(api.readStoredSession(), { user: null, expired: true });
  assert.equal(localStorage.getItem(api.AUTH_TOKEN_KEY), null);
});
test("missing token and corrupt storage return Login without crashing", () => {
  localStorage.setItem(api.AUTH_USER_KEY, JSON.stringify(user));
  assert.equal(api.readStoredSession().user, null);
  session();
  localStorage.setItem(api.AUTH_USER_KEY, "bad json");
  assert.equal(api.readStoredSession().expired, true);
  assert.equal(api.isTokenCurrent("bad.token"), false);
});
test("expired sessions stop all protected request methods before fetching", async () => {
  session(token(-60));
  const results = await Promise.allSettled([api.apiGet("/accounts"), api.apiPost("/transactions", {}), api.apiPatch("/accounts/1", {}), api.apiPut("/split-bills/1", {}), api.apiDelete("/accounts/1")]);
  assert.ok(results.every((result) => result.status === "rejected" && result.reason.message === api.SESSION_EXPIRED_MESSAGE));
  assert.equal(events, 1);
});
test("backend 401 clears an apparently current session once", async () => {
  const value = session();
  globalThis.fetch = async (_, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${value}`);
    return new Response(JSON.stringify({ detail: "user not found" }), { status: 401 });
  };
  await Promise.allSettled([api.apiGet("/accounts"), api.apiGet("/budgets")]);
  assert.equal(events, 1);
  assert.equal(localStorage.getItem(api.AUTH_USER_KEY), null);
});
test("failed login is reported without expiring a session", async () => {
  const value = session();
  globalThis.fetch = async (_, options) => {
    assert.equal(options.headers.Authorization, undefined);
    return new Response(JSON.stringify({ detail: "Invalid email or password" }), { status: 401 });
  };
  await assert.rejects(api.apiPost("/auth/login", {}), /Invalid email or password/);
  assert.equal(localStorage.getItem(api.AUTH_TOKEN_KEY), value);
  assert.equal(events, 0);
});
test("an old in-flight 401 cannot log out a newly signed-in user", async () => {
  session();
  let finish;
  globalThis.fetch = () => new Promise((resolve) => { finish = resolve; });
  const request = api.apiGet("/accounts");
  const replacement = session(token(7200, "new session"));
  finish(new Response("{}", { status: 401 }));
  await assert.rejects(request, /sign in again/);
  assert.equal(localStorage.getItem(api.AUTH_TOKEN_KEY), replacement);
  assert.equal(events, 0);
});
test("network errors and forbidden requests preserve a valid session", async () => {
  const value = session();
  globalThis.fetch = async () => { throw new Error("Offline"); };
  await assert.rejects(api.apiGet("/accounts"), /Offline/);
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 });
  await assert.rejects(api.apiGet("/accounts"), /Forbidden/);
  assert.equal(localStorage.getItem(api.AUTH_TOKEN_KEY), value);
  assert.equal(events, 0);
});
test("successful requests retain the existing JSON and DELETE behavior", async () => {
  session();
  globalThis.fetch = async (_, options) => options.method === "DELETE" ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ ok: true }));
  assert.deepEqual(await api.apiGet("/accounts"), { ok: true });
  assert.deepEqual(await api.apiPost("/transactions", {}), { ok: true });
  assert.equal(await api.apiDelete("/accounts/1"), undefined);
});
