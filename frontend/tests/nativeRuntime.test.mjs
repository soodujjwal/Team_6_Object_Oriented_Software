import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";

const source = (await readFile(new URL("../src/native/runtime.ts", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const runtime = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

async function setup(html) {
  const dom = new JSDOM(html, { url: "https://localhost/app" });
  const listeners = new Map();
  let minimized = 0;
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document,
    Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent,
    Capacitor: { isNativePlatform: () => true }, setConnectivity() {},
    Network: { getStatus: async () => ({ connected: true }), addListener: async () => {} },
    App: { addListener: async (name, callback) => listeners.set(name, callback), minimizeApp: async () => { minimized++; } },
  });
  await runtime.initializeNativeRuntime();
  return { dom, back: () => listeners.get("backButton")(), minimized: () => minimized };
}

test("closed drawer allows Android Back to reach page navigation", async () => {
  const state = await setup('<div class="drawer-layer" aria-hidden="true"><aside role="dialog"></aside></div>');
  let navigated = false;
  window.addEventListener("pfm:android-back", event => { navigated = true; event.preventDefault(); });
  state.back();
  assert.equal(navigated, true);
  assert.equal(state.minimized(), 0);
  state.dom.window.close();
});

test("open drawer consumes Android Back as Escape", async () => {
  const state = await setup('<div class="drawer-layer open" aria-hidden="false"><aside role="dialog"></aside></div>');
  let escaped = false;
  document.addEventListener("keydown", event => { escaped = event.key === "Escape"; });
  state.back();
  assert.equal(escaped, true);
  assert.equal(state.minimized(), 0);
  state.dom.window.close();
});

test("root Android Back minimizes when the only dialog is a closed drawer", async () => {
  const state = await setup('<div class="drawer-layer" aria-hidden="true"><aside role="dialog"></aside></div>');
  state.back();
  assert.equal(state.minimized(), 1);
  state.dom.window.close();
});