import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [appSource, html] = await Promise.all([
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("index.html", root), "utf8"),
]);

test("a fresh page lifecycle retains the 3000 / 0 credit contract", () => {
  assert.match(
    appSource,
    /account:\s*\{\s*credits:\s*3000,\s*consumedCredits:\s*0,?\s*\}/,
  );
  assert.match(html, /id="avatarCreditBadge"[^>]*>3000<\/span>/);
  assert.match(html, /id="profileCreditConsumed">0<\/span>/);
});

test("model data and prototype config load before the application", () => {
  const catalogIndex = html.indexOf("./data/model-catalog.js");
  const configIndex = html.indexOf("./src/config/prototype-config.js");
  const appIndex = html.indexOf("./app.js");
  assert.ok(catalogIndex >= 0 && catalogIndex < configIndex && configIndex < appIndex);
});

test("the current prototype still starts with the Agent panel closed", () => {
  assert.match(appSource, /\bsetAgentOpen\(false\);/);
});
