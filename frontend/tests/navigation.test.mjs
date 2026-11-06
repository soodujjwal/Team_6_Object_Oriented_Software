import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/domain/navigation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { readRoute, resolveRoute } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("home remains a public landing page with or without a saved session", () => {
  assert.equal(resolveRoute("/", false), "/");
  assert.equal(resolveRoute("/", true), "/");
});
test("protected dashboard requires an authenticated session", () => {
  assert.equal(resolveRoute("/app", false), "/login");
  assert.equal(resolveRoute("/app", true), "/app");
});
test("login and signup remain reachable for visitors and redirect signed-in users to the app", () => {
  for (const route of ["/login", "/register"]) {
    assert.equal(resolveRoute(route, false), route);
    assert.equal(resolveRoute(route, true), "/app");
  }
});
test("direct and history navigation recognize supported paths and safely handle unknown paths", () => {
  for (const route of ["/", "/app", "/register", "/login", "/download"]) assert.equal(readRoute(route), route);
  assert.equal(readRoute("/unknown"), "/");
});

test("download page is public for visitors and authenticated users", () => {
  assert.equal(resolveRoute("/download", false), "/download");
  assert.equal(resolveRoute("/download", true), "/download");
});
