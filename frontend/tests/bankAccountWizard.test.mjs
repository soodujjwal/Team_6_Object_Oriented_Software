import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { act, createElement, StrictMode } from "react";

const dom = new JSDOM("<!doctype html><body><div id='root'></div></body>", { url: "https://finance.example", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "MouseEvent", "KeyboardEvent", "Node"]) globalThis[key] = key === "window" ? dom.window : dom.window[key];
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollIntoView = function () {};
const { createRoot } = await import("react-dom/client");
const require = createRequire(import.meta.url);
let calls = [], added = [], connectCount = 0, server;
const result = await build({ entryPoints: [fileURLToPath(new URL("../src/components/CreateBankAccountFlow.tsx", import.meta.url))], bundle: true, platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" }, write: false,
  plugins: [{ name: "mock-account-api", setup(builder) { builder.onLoad({ filter: /[\\/]api[\\/]accounts\.ts$/ }, () => ({ contents: "export const createAccount = (payload) => globalThis.__createAccount(payload);", loader: "ts" })); } }] });
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, requestAnimationFrame, cancelAnimationFrame,
  document, window, HTMLElement, Error, __createAccount: async (payload) => { calls.push(JSON.parse(JSON.stringify(payload))); return server(payload); } });
const { CreateBankAccountFlow } = module.exports;
let root;
const dialog = () => document.querySelector('[role="dialog"]');
const button = (text, scope = dialog() ?? document) => [...scope.querySelectorAll("button")].find((item) => item.textContent.trim() === text);
async function click(element) { assert.ok(element, "Expected control exists"); await act(async () => { element.click(); }); }
async function input(element, value) { assert.ok(element); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function enterForm() { await act(async () => { dialog().querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
async function setup() {
  calls = []; added = []; connectCount = 0;
  server = async (payload) => ({ ...payload, id: 101, current_balance: payload.starting_balance });
  root = createRoot(document.querySelector("#root"));
  await act(async () => { root.render(createElement(CreateBankAccountFlow, { onCreated: (account) => added.push(account), onConnectCredit: () => connectCount++ })); });
  await click(button("Create Bank Account", document));
}
async function cleanup() { await act(async () => root.unmount()); }
async function chooseBank(name = "Chase") {
  await click(dialog().querySelector('[aria-haspopup="listbox"]'));
  await input(dialog().querySelector(".glass-select-search input"), name);
  const option = dialog().querySelector('[role="option"]');
  assert.ok(option.textContent.includes(name));
  await act(async () => { option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
}
async function review() {
  await chooseBank(); await enterForm();
  await click([...dialog().querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Checking")));
  await enterForm(); await input(dialog().querySelector("input"), "1234.50"); await enterForm();
  assert.equal(dialog().querySelector("input").value, "Chase Checking");
  await input(dialog().querySelector("input"), "Everyday account"); await enterForm();
}

test("five-step flow preserves values and sends exactly one request only after explicit confirmation", async () => {
  await setup();
  try {
    await review();
    assert.equal(calls.length, 0);
    assert.match(dialog().textContent, /Step 5 of 5/);
    await enterForm(); // Enter carried over from the previous input must not save.
    assert.equal(calls.length, 0);
    await click(button("Back")); assert.equal(dialog().querySelector("input").value, "Everyday account");
    await click(button("Back")); assert.equal(dialog().querySelector("input").value, "1234.50");
    await enterForm(); await enterForm();
    let finish;
    server = (payload) => new Promise((resolve) => { finish = () => resolve({ ...payload, id: 101, current_balance: payload.starting_balance }); });
    const confirm = button("Create Bank Account");
    await act(async () => { confirm.click(); confirm.click(); });
    assert.equal(calls.length, 1);
    assert.equal(added.length, 0);
    assert.ok(button("Creating…").disabled);
    await act(async () => finish());
    assert.match(dialog().textContent, /Account created/);
    assert.equal(added.length, 1);
    assert.deepEqual(calls[0], { bank_name: "Chase", name: "Everyday account", account_type: "checking", starting_balance: "1234.50" });
    await click(button("Done")); assert.equal(dialog(), null);
  } finally { await cleanup(); }
});

test("other bank, zero default, validation and closing never save early", async () => {
  await setup();
  try {
    await enterForm(); assert.match(dialog().querySelector('[role="alert"]').textContent, /Choose a bank/);
    await chooseBank("Other"); await input(dialog().querySelector('input:not(.glass-select-search input)'), "Local Credit Union"); await enterForm();
    await click([...dialog().querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Savings"))); await enterForm();
    assert.equal(dialog().querySelector("input").value, "0.00");
    for (const value of ["-10", "NaN", "1.234", "1e3", "10000000000", ""]) {
      await input(dialog().querySelector("input"), value); await enterForm();
      assert.match(dialog().textContent, /Step 3 of 5/); assert.ok(dialog().querySelector('[role="alert"]'));
    }
    await input(dialog().querySelector("input"), "0"); await enterForm();
    assert.equal(dialog().querySelector("input").value, "Local Credit Union Savings");
    await input(dialog().querySelector("input"), "   "); await enterForm(); assert.ok(dialog().querySelector('[role="alert"]'));
    await click(dialog().querySelector('[aria-label="Close dialog"]'));
    assert.equal(dialog(), null); assert.equal(calls.length, 0);
  } finally { await cleanup(); }
});

test("API errors keep the review available and support an explicit retry", async () => {
  await setup();
  try {
    await review(); server = async () => { throw new Error("Could not save. Please try again."); };
    await click(button("Create Bank Account"));
    assert.match(dialog().querySelector('[role="alert"]').textContent, /Could not save/);
    assert.equal(added.length, 0); assert.equal(calls.length, 1);
    server = async (payload) => ({ ...payload, id: 102 });
    await click(button("Create Bank Account")); assert.equal(added.length, 1); assert.equal(calls.length, 2);
  } finally { await cleanup(); }
});

test("credit cards hand off to Plaid without creating a manual account", async () => {
  await setup();
  try {
    await chooseBank(); await enterForm();
    await click([...dialog().querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Credit Card")));
    await click(button("Go to Bank Sync"));
    assert.equal(connectCount, 1); assert.equal(calls.length, 0); assert.equal(dialog(), null);
  } finally { await cleanup(); }
});

test("Escape closes the bank dropdown first, then cancels the flow with no save", async () => {
  await setup();
  try {
    await click(dialog().querySelector('[aria-haspopup="listbox"]'));
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.ok(dialog()); assert.equal(dialog().querySelector('[role="listbox"]'), null);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(dialog(), null); assert.equal(calls.length, 0);
  } finally { await cleanup(); }
});

test("keyboard Tab stays inside the dialog", { timeout: 10000 }, async () => {
  await setup();
  try {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    const first = dialog().querySelector("button");
    const last = button("Continue");
    await act(async () => { last.focus(); last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    assert.ok(document.activeElement === first, "Tab wraps to the first control");
    await act(async () => { first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    assert.ok(document.activeElement === last, "Shift+Tab wraps to the last control");
  } finally { await cleanup(); }
});

const panelBuild = await build({ entryPoints: [fileURLToPath(new URL("../src/components/AccountTrackingPanel.tsx", import.meta.url))], bundle: true, platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" }, write: false,
  define: { "import.meta.env": "{}" },
  plugins: [{ name: "mock-mode-api", setup(builder) {
    builder.onLoad({ filter: /[\\/]api[\\/]trackingMode\.ts$/ }, () => ({ contents: 'export const TRACKING_MODE_UPDATED="test:mode"; export const getTrackingMode=()=>globalThis.__getMode(); export const chooseTrackingMode=(mode)=>globalThis.__chooseMode(mode);', loader: "ts" }));
    builder.onLoad({ filter: /[\\/]api[\\/]plaid\.ts$/ }, () => ({ contents: 'export const getPlaidStatus=async()=>({configured:true,connections:[]}); export const createPlaidLinkToken=()=>globalThis.__plaidLink(); export const exchangePlaidToken=async()=>({}); export const disconnectPlaid=async()=>({}); export const refreshPlaid=async()=>({requested:0}); export const syncPlaid=async()=>({added:0,modified:0,removed:0});', loader: "ts" }));
    builder.onLoad({ filter: /[\\/]api[\\/]accounts\.ts$/ }, () => ({ contents: 'export const createAccount=()=>{throw new Error("No account should be created in mode tests")}', loader: "ts" }));
  } }] });
let modeState;
let plaidRequests = 0;
let plaidFailure = false;
const panelModule = { exports: {} };
runInNewContext(panelBuild.outputFiles[0].text, { module: panelModule, exports: panelModule.exports, require, document, window, HTMLElement, Error, requestAnimationFrame, cancelAnimationFrame,
  __getMode: async () => modeState,
  __plaidLink: async () => { plaidRequests++; if (plaidFailure) throw new Error("Could not start the bank connection."); return { link_token: "synthetic-test-token" }; },
  __chooseMode: async (mode) => { if (!modeState.can_switch && modeState.mode !== mode) throw new Error("Resolve existing accounts before switching."); modeState = { ...modeState, mode }; return modeState; } });
const { AccountTrackingPanel } = panelModule.exports;

test("one account-wide tracking choice shows either manual creation or Plaid controls", async () => {
  for (const mode of [null, "manual", "plaid"]) {
    modeState = { mode, manual_accounts: 0, connected_accounts: 0, can_switch: true };
    root = createRoot(document.querySelector("#root"));
    await act(async () => root.render(createElement(AccountTrackingPanel, { onCreated() {}, onAccountsChanged() {} })));
    try {
      if (mode === null) {
        assert.equal(button("Create Bank Account", document), undefined);
        assert.equal(button("Connect Bank", document), undefined);
        await click([...document.querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Track manually")));
      }
      if (mode === "plaid") { assert.ok(button("Connect Bank", document)); assert.equal(button("Create Bank Account", document), undefined); }
      else { assert.ok(button("Create Bank Account", document)); assert.equal(button("Connect Bank", document), undefined); }
    } finally { await cleanup(); }
  }
});

test("a rejected method change leaves the user's existing method intact", async () => {
  modeState = { mode: "manual", manual_accounts: 1, connected_accounts: 0, can_switch: false };
  root = createRoot(document.querySelector("#root"));
  await act(async () => root.render(createElement(AccountTrackingPanel, { onCreated() {}, onAccountsChanged() {} })));
  try {
    await click(button("Change method", document));
    await click([...document.querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Connect with Plaid")));
    assert.match(document.querySelector('[role="alert"]').textContent, /Resolve existing accounts/);
    assert.equal(modeState.mode, "manual"); assert.equal(button("Connect Bank", document), undefined);
  } finally { await cleanup(); }
});

test("selecting manual tracking opens the first wizard question immediately without creating an account", async () => {
  modeState = { mode: null, manual_accounts: 0, connected_accounts: 0, can_switch: true };
  root = createRoot(document.querySelector("#root"));
  await act(async () => root.render(createElement(AccountTrackingPanel, { onCreated() {}, onAccountsChanged() {} })));
  try {
    await click([...document.querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Track manually")));
    assert.ok(dialog(), "Selecting manual opens the wizard directly");
    assert.match(dialog().textContent, /Which bank do you use\?/);
    await click(dialog().querySelector('[aria-label="Close dialog"]'));
    await click(button("Change method", document));
    await click(button("Cancel", document));
    assert.equal(dialog(), null, "Cancelling the method picker does not reopen the wizard");
  } finally { await cleanup(); }
});

test("selecting Plaid launches Link once in StrictMode without a second Connect Bank click", async () => {
  modeState = { mode: null, manual_accounts: 0, connected_accounts: 0, can_switch: true };
  plaidRequests = 0; plaidFailure = false;
  let opened = 0;
  window.Plaid = { create: () => ({ open: () => opened++, exit() {} }) };
  root = createRoot(document.querySelector("#root"));
  await act(async () => root.render(createElement(StrictMode, null, createElement(AccountTrackingPanel, { onCreated() {}, onAccountsChanged() {} }))));
  try {
    await click([...document.querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Connect with Plaid")));
    assert.equal(modeState.mode, "plaid"); assert.equal(plaidRequests, 1); assert.equal(opened, 1);
    await click(button("Change method", document)); await click(button("Cancel", document));
    assert.equal(plaidRequests, 1, "Rerenders and cancelling a picker cannot reopen Link");
  } finally { await cleanup(); delete window.Plaid; }
});

test("an automatic Plaid launch error is shown and the existing Connect Bank action retries", async () => {
  modeState = { mode: null, manual_accounts: 0, connected_accounts: 0, can_switch: true };
  plaidRequests = 0; plaidFailure = true;
  let opened = 0;
  window.Plaid = { create: () => ({ open: () => opened++, exit() {} }) };
  root = createRoot(document.querySelector("#root"));
  await act(async () => root.render(createElement(AccountTrackingPanel, { onCreated() {}, onAccountsChanged() {} })));
  try {
    await click([...document.querySelectorAll(".bank-wizard-type")].find((item) => item.textContent.startsWith("Connect with Plaid")));
    assert.match(document.querySelector('[role="alert"]').textContent, /Could not start the bank connection/);
    assert.equal(opened, 0); plaidFailure = false;
    await click([...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Connect Bank"));
    assert.equal(plaidRequests, 2); assert.equal(opened, 1);
  } finally { await cleanup(); delete window.Plaid; plaidFailure = false; }
});
