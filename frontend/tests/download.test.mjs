import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import jsQR from "jsqr";

const require = createRequire(import.meta.url);
async function load(file) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true,
    platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" },
    define: { "import.meta.env": "{}" }, write: false });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, URL, Intl });
  return module.exports;
}
const { DownloadPage } = await load("../src/pages/DownloadPage.tsx");
const { MarketingHeader } = await load("../src/components/MarketingHeader.tsx");
const { getAndroidRelease } = await load("../src/domain/androidRelease.ts");
const { createApkQr } = await load("../src/components/ApkQrCode.tsx");
const render = (component, props) => renderToStaticMarkup(createElement(component, props));

test("navigation keeps dashboard and open-app destinations with Download immediately between them", () => {
  const html = render(MarketingHeader, { signedIn: true, active: "download" });
  assert.match(html, /href="\/app">Dashboard<\/a>\s*<a[^>]*href="\/download"[^>]*aria-current="page"/);
  assert.match(html, /<span>Download<\/span><\/a>\s*<a[^>]*href="\/app">Open app/);
  for (const anchor of ["features", "how-it-works", "questions"]) assert.ok(html.includes(`href="/#${anchor}"`));
  const guest = render(MarketingHeader, { signedIn: false });
  assert.match(guest, /href="\/login">Log in/);
  assert.match(guest, /href="\/register">Get started/);
});

test("missing APK shows Coming soon without an APK link or invented metadata", () => {
  const html = render(DownloadPage, { signedIn: false, release: {} });
  assert.equal((html.match(/disabled=""/g) || []).length, 1);
  assert.match(html, /Coming soon/);
  assert.doesNotMatch(html, /Version |\d+(\.\d+)? MB|QR code for the Finance Builder Android APK/);
  assert.match(html, /href="\/app">Continue in browser/);
});

test("only a public HTTPS download URL enables release metadata", () => {
  for (const url of [undefined, "", "/downloads/app.apk", "http://example.test/app.apk", "javascript:alert(1)", "https://localhost/app.apk", "https://user:password@example.test/app.apk"]) {
    assert.equal(getAndroidRelease({ url, version: "1.2.3", sizeBytes: "5400000" }).url, undefined);
  }
  const release = getAndroidRelease({ url: "https://example.test/releases/finance.apk", sizeBytes: "bad" });
  assert.equal(release.version, undefined);
  assert.equal(release.sizeBytes, undefined);
});

test("Android buttons use the configured APK; the QR opens the permanent download page", () => {
  const release = getAndroidRelease({ url: "https://example.test/releases/finance-1.2.3.apk?download=1&source=web", version: "1.2.3", sizeBytes: "5400000" });
  const html = render(DownloadPage, { signedIn: true, release });
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
  assert.equal(hrefs.filter((href) => href === release.url).length, 1);
  assert.ok(hrefs.includes("https://finance-builder.vercel.app/download"));
  assert.match(html, /Version 1\.2\.3 · 5\.4 MB · Android APK/);
  assert.doesNotMatch(html, /disabled=""|Coming soon/);
});

test("a scanner decodes the QR modules to the permanent download page", () => {
  const urls = ["https://finance-builder.vercel.app/download"];
  for (const url of urls) {
    const { size, path } = createApkQr(url);
    const scale = 6;
    const width = size * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (const match of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      const col = Number(match[1]), row = Number(match[2]);
      for (let y = row * scale; y < (row + 1) * scale; y++) {
        for (let x = col * scale; x < (col + 1) * scale; x++) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 16; pixels[offset + 1] = 45; pixels[offset + 2] = 32;
        }
      }
    }
    assert.equal(jsQR(pixels, width, width)?.data, url);
  }
});


test("download hero preserves the sample preview and groups installation with the real page QR", () => {
  const html = render(DownloadPage, { signedIn: false });
  for (const label of ["Track Spending", "Manage Budgets", "Savings Goals", "Stay in Sync", "Get the app on your phone", "Install Finance Builder on Android"]) assert.ok(html.includes(label));
  assert.match(html, /illustrative sample data/);
  assert.equal((html.match(/class="dl-info-card /g) ?? []).length, 2);
  assert.equal((html.match(/<li>/g) ?? []).length, 9);
  assert.match(html, /href="https:\/\/finance-builder\.vercel\.app\/download" aria-label="Open the Finance Builder download page"/);
});

test("the published signed APK is downloadable with real metadata and an early-access notice", () => {
  const html = render(DownloadPage, { signedIn: false });
  assert.match(html, /releases\/download\/android-v1\.0\.4\/Finance-Builder-1\.0\.4\.apk/);
  assert.match(html, /Version 1\.0\.4 · 5\.8 MB · Android APK/);
  assert.match(html, /Early access · Android 7\.1\+/);
  assert.match(html, /Use the same Finance Builder account/);
  assert.doesNotMatch(html, /Coming soon|disabled=""/);
});
