import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-theme-controller.js", import.meta.url), "utf8");

function harness(t, { saved = null, systemLight = false, storageBlocked = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <span id="themeModeIcon"></span><span id="themeCurrentLabel"></span>
    <span data-theme-inline-switch></span>
  </body></html>`, { url: "http://reelay.test", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const systemTheme = { matches: systemLight };
  const timers = new Map();
  const changes = [];
  const applied = [];
  let nextTimerId = 0;
  let iconRefreshes = 0;
  window.matchMedia = () => systemTheme;
  if (storageBlocked) {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
  } else if (saved !== null) {
    window.localStorage.setItem("reelay-theme-mode", saved);
  }
  window.setTimeout = (callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.eval(source);
  const controller = window.REELAY_CANVAS_THEME_CONTROLLER.createController({
    document: window.document,
    refreshIcons: () => { iconRefreshes += 1; },
    onApply: (mode) => applied.push([mode, window.document.documentElement.dataset.theme]),
    onChange: (mode) => changes.push(mode),
  });
  return { window, controller, systemTheme, timers, changes, applied,
    iconRefreshes: () => iconRefreshes,
    feedback: window.document.querySelector("[data-theme-inline-switch]") };
}

test("startup reads saved theme without mutating DOM or notifying the host until apply", (t) => {
  const { window, controller, changes, applied, iconRefreshes } = harness(t, { saved: "dark" });
  assert.equal(controller.getMode(), "dark");
  assert.equal(window.document.documentElement.dataset.theme, undefined);
  assert.deepEqual(applied, []);
  controller.apply();
  assert.equal(window.document.documentElement.dataset.themeMode, "dark");
  assert.equal(window.document.querySelector("#themeCurrentLabel").textContent, "深色模式");
  assert.equal(window.document.querySelector("[data-lucide]").dataset.lucide, "moon");
  assert.equal(iconRefreshes(), 1);
  assert.deepEqual(applied, [["dark", "dark"]], "layout observes the newly applied theme");
  assert.deepEqual(changes, []);
});

test("legacy system preference resolves once at load; invalid preferences use light", async (t) => {
  for (const [saved, systemLight, expected] of [["system", true, "light"], ["system", false, "dark"], ["unknown", false, "light"], [null, false, "light"]]) {
    await t.test(`${saved}, system light ${systemLight}`, (subtest) => {
      const { window, controller, systemTheme } = harness(subtest, { saved, systemLight });
      assert.equal(controller.getMode(), expected);
      systemTheme.matches = !systemLight;
      controller.apply();
      assert.equal(window.localStorage.getItem("reelay-theme-mode"), expected);
    });
  }
});

test("user changes notify once, host synchronization never echoes, and DOM follows the same owner", (t) => {
  const { window, controller, changes, feedback } = harness(t);
  controller.apply();
  controller.toggle();
  assert.equal(controller.getMode(), "dark");
  assert.equal(feedback.style.getPropertyValue("--theme-index"), "1");
  assert.deepEqual(changes, ["dark"]);
  controller.apply("dark");
  assert.deepEqual(changes, ["dark"]);
  controller.apply("light", { notifyHost: false });
  assert.deepEqual(changes, ["dark"]);
  assert.equal(window.document.documentElement.dataset.theme, "light");
  assert.equal(window.document.querySelector("[data-lucide]").dataset.lucide, "sun");
  controller.toggle();
  assert.deepEqual(changes, ["dark", "dark"]);
});

test("blocked storage keeps theme changes and host communication working", (t) => {
  const { window, controller, changes } = harness(t, { storageBlocked: true });
  assert.equal(controller.getMode(), "light");
  assert.doesNotThrow(() => controller.apply());
  assert.doesNotThrow(() => controller.toggle());
  assert.equal(window.document.documentElement.dataset.theme, "dark");
  assert.deepEqual(changes, ["dark"]);
});

test("rapid changes replace feedback timer; hidden pages clear it and restored pages can use it again", (t) => {
  const { controller, timers, feedback } = harness(t);
  controller.toggle();
  assert.equal(timers.size, 1);
  const firstTimer = [...timers.keys()][0];
  controller.toggle();
  assert.equal(timers.size, 1);
  assert.equal(timers.has(firstTimer), false);
  assert.equal([...timers.values()][0].delay, 1100);
  assert.equal(feedback.classList.contains("is-visible"), true);
  controller.clearFeedback();
  assert.equal(timers.size, 0);
  assert.equal(feedback.classList.contains("is-visible"), false);
  controller.toggle();
  assert.equal(timers.size, 1);
  [...timers.values()][0].callback();
  assert.equal(timers.size, 0);
  assert.equal(feedback.classList.contains("is-visible"), false);
});

test("disposal clears feedback and stops further writes or notifications", (t) => {
  const { controller, timers, changes, feedback, applied } = harness(t);
  controller.toggle();
  controller.dispose();
  controller.dispose();
  assert.equal(timers.size, 0);
  assert.equal(feedback.classList.contains("is-visible"), false);
  controller.toggle();
  controller.apply("light");
  assert.equal(controller.getMode(), "dark");
  assert.deepEqual(changes, ["dark"]);
  assert.deepEqual(applied, [["dark", "dark"]]);
});
