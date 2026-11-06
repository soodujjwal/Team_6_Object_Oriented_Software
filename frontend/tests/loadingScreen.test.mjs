import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const result = await build({ entryPoints: [fileURLToPath(new URL("../src/components/LoadingScreen.tsx", import.meta.url))], bundle: true,
  platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" }, write: false });
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require });
const { LoadingScreen } = module.exports;
const pageResult = await build({ entryPoints: [fileURLToPath(new URL("../src/components/PageSkeleton.tsx", import.meta.url))], bundle: true,
  platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" }, write: false });
const pageModule = { exports: {} };
runInNewContext(pageResult.outputFiles[0].text, { module: pageModule, exports: pageModule.exports, require });
const { PageSkeleton } = pageModule.exports;

test("account skeleton is announced accessibly and never pretends to show financial data", () => {
  const html = renderToStaticMarkup(createElement(LoadingScreen));
  assert.match(html, /Getting your dashboard ready/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /\$\d/);
});
test("error state offers actionable retry and sign out instead of endless loading", () => {
  const html = renderToStaticMarkup(createElement(LoadingScreen, { error: true, onRetry() {}, onSignOut() {} }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Try again/);
  assert.match(html, /Sign out/);
  assert.match(html, /aria-busy="false"/);
});

test("Reports shows a donut and cash-flow skeleton instead of dashboard balances", () => {
  const html = renderToStaticMarkup(createElement(PageSkeleton, { page: "reports" }));
  assert.match(html, /Monthly Report/);
  assert.doesNotMatch(html, /Income vs Expenses/);
  assert.match(html, /Net Cash Flow/);
  assert.match(html, /sk-donut/);
  assert.doesNotMatch(html, /skeleton-balance/);
  assert.doesNotMatch(html, /Getting your dashboard/);
});

test("each destination gets its own loading layout, including authentication pages", () => {
  const pages = ["dashboard", "reports", "accounts", "transactions", "budgets", "goals", "recurring", "settings", "add", "afford", "help", "split", "login", "register", "landing", "download", "onboarding"];
  for (const page of pages) {
    const html = renderToStaticMarkup(createElement(PageSkeleton, { page }));
    assert.match(html, new RegExp(`data-skeleton-page="${page}"`));
    assert.match(html, /aria-busy="true"/);
    assert.doesNotMatch(html, /\$\d/);
    if (page !== "dashboard") assert.doesNotMatch(html, /skeleton-balance/);
  }
  const accounts = renderToStaticMarkup(createElement(PageSkeleton, { page: "accounts" }));
  assert.match(accounts, /Your Accounts/);
  assert.doesNotMatch(accounts, /sk-donut/);
  const transactions = renderToStaticMarkup(createElement(PageSkeleton, { page: "transactions" }));
  assert.match(transactions, /sk-fields/);
  assert.match(transactions, /skeleton-row/);
});
