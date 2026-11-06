import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../src/api/client.ts", import.meta.url), "utf8"))
  .replace('import.meta.env?.VITE_API_BASE_URL', '"https://api.example.test"');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const values = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, removeItem: (key) => values.delete(key) };
globalThis.window = { dispatchEvent() {} };
const token = (id) => `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 3600, sub: id }))}.signature`;
const client = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const ok = (value) => ({ ok: true, status: 200, json: async () => value });

test("simultaneous matching reads share one request, with no persistent cache", async () => {
  values.set(client.AUTH_TOKEN_KEY, token("one"));
  let complete, calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise((resolve) => { complete = resolve; }); };
  const first = client.apiGet("/accounts");
  const second = client.apiGet("/accounts");
  assert.equal(calls, 1);
  complete(ok([{ id: 1 }]));
  assert.deepEqual(await first, await second);
  globalThis.fetch = async () => { calls++; return ok([]); };
  await client.apiGet("/accounts");
  assert.equal(calls, 2);
});

test("reads are isolated by user and successful writes invalidate in-flight sharing", async () => {
  const completions = [];
  globalThis.fetch = async (_url, options) => options.method === "GET" ? new Promise((resolve) => completions.push(resolve)) : ok({});
  values.set(client.AUTH_TOKEN_KEY, token("one"));
  const first = client.apiGet("/accounts");
  values.set(client.AUTH_TOKEN_KEY, token("two"));
  const otherUser = client.apiGet("/accounts");
  assert.equal(completions.length, 2);
  await client.apiPost("/accounts", {});
  const afterWrite = client.apiGet("/accounts");
  assert.equal(completions.length, 3);
  completions.forEach((resolve, i) => resolve(ok({ i })));
  assert.deepEqual(await Promise.all([first, otherUser, afterWrite]), [{ i: 0 }, { i: 1 }, { i: 2 }]);
});

test("hanging reads time out and cancelled reads can be retried", async () => {
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  await assert.rejects(client.apiGet("/auth/state", { timeoutMs: 5 }), /taking too long/);
  const controller = new AbortController();
  const cancelled = client.apiGet("/auth/state", { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  globalThis.fetch = async () => ok({ onboarding_complete: "true" });
  assert.deepEqual(await client.apiGet("/auth/state"), { onboarding_complete: "true" });
});
