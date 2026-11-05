import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(path) {
  // Device and routing functions do not need the native bridge in Node.
  const source = (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^import .*@capacitor\/core.*;\r?\n/m, "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { detectDevice, downloadUrl } = await load("../src/domain/mobile.ts");
const { resolveRoute } = await load("../src/domain/navigation.ts");

test("downloads target Android, iPhone, iPad desktop mode, and desktop", () => {
  assert.equal(detectDevice("Mozilla/5.0 (Linux; Android 14)", "Linux", 5), "android");
  assert.equal(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", "iPhone", 5), "ios");
  assert.equal(detectDevice("Mozilla/5.0 Macintosh", "MacIntel", 5), "ios");
  assert.equal(detectDevice("Mozilla/5.0 Macintosh", "MacIntel", 0), "desktop");
  assert.equal(detectDevice("Mozilla/5.0 Windows NT", "Win32", 0), "desktop");
});
test("native entry and logout bypass landing while website retains it", () => {
  assert.equal(resolveRoute("/", false, true), "/login");
  assert.equal(resolveRoute("/", true, true), "/app");
  assert.equal(resolveRoute("/", false), "/");
  assert.equal(resolveRoute("/register", false, true), "/register");
  assert.equal(resolveRoute("/app", false, true), "/login");
});
test("download links reject executable and insecure external URLs", () => {
  globalThis.window = { location: { origin: "https://finance.example" } };
  assert.equal(downloadUrl(undefined), undefined);
  assert.equal(downloadUrl("javascript:alert(1)"), undefined);
  assert.equal(downloadUrl("http://other.example/app.apk"), undefined);
  assert.equal(downloadUrl("https://downloads.example/app.apk"), "https://downloads.example/app.apk");
  assert.equal(downloadUrl("/downloads/app.apk"), "https://finance.example/downloads/app.apk");
});
