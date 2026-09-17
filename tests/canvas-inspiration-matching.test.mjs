import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-inspiration-matching.js", import.meta.url), "utf8");
function harness(t) {
  const dom = new JSDOM('<section id="host" hidden></section>', { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  dom.window.eval(source);
  const state = { scope: "canvas1", source: { text: "跟拍人物", label: "节点文字" }, calls: [], preferences: [], changed: 0 };
  const host = dom.window.document.getElementById("host");
  const controller = dom.window.REELAY_CANVAS_INSPIRATION_MATCHING.create({ host,
    model: {
      extract(text) { return ["跟拍", "海岸", "日光"].filter((word) => text.includes(word)).map((label) => ({ id: label, label, group: "test" })); },
      match({ text, preferences }) { state.calls.push(text); state.preferences.push({ ...preferences }); return [{ clipId: "b", shotId: "b1" }, { clipId: "a", shotId: "a1" }]; },
    },
    clips: [], getScope: () => state.scope, readSource: () => state.source, onChange: () => state.changed++,
  });
  return { host, state, controller };
}

test("matching freezes input and result order until explicit update without replacing the source", (t) => {
  const { host, state, controller } = harness(t);
  assert.equal(controller.begin({ kind: "node" }), true);
  assert.equal(host.hidden, false);
  const sourceObject = state.source;
  state.source.text = "海岸日光";
  controller.sync();
  assert.equal(host.querySelector("p").textContent, "跟拍人物");
  assert.deepEqual(state.calls, ["跟拍人物"]);
  const update = host.querySelector('[data-match-action="update"]');
  assert.equal(update.disabled, false);
  update.click();
  assert.deepEqual(state.calls, ["跟拍人物", "海岸日光"]);
  assert.equal(update.disabled, true);
  assert.equal(state.source, sourceObject);
  assert.equal(state.changed, 1);
});

test("explicit search/filter candidates strictly intersect cached recommendations", (t) => {
  const { controller } = harness(t);
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(controller.results(candidates), candidates);
  controller.begin({});
  assert.deepEqual(Array.from(controller.results(candidates), (clip) => clip.id), ["b", "a"]);
  assert.deepEqual(Array.from(controller.results([{ id: "a" }, { id: "c" }]), (clip) => clip.id), ["a"]);
  assert.equal(controller.results([{ id: "c" }]).length, 0);
  controller.clear();
  assert.equal(controller.results(candidates), candidates);
});

test("scope changes and missing targets retire old matches while blank edits keep the prior snapshot", (t) => {
  const { host, state, controller } = harness(t);
  controller.begin({});
  state.source.text = " ";
  controller.sync();
  assert.equal(controller.active, true);
  assert.equal(host.querySelector('[data-match-action="update"]').disabled, true);
  state.scope = "canvas2";
  assert.equal(controller.sync(), true);
  assert.equal(controller.active, false);
  assert.equal(host.hidden, true);
  state.source.text = "人物跟拍";
  controller.begin({});
  state.source = null;
  assert.equal(controller.matchFor("a"), null);
  assert.equal(host.hidden, true);
});

test("clear and disposal are read-only and cannot reopen an old matching session", (t) => {
  const { host, state, controller } = harness(t);
  controller.begin({});
  host.querySelector('[data-match-action="clear"]').click();
  assert.equal(controller.active, false);
  assert.equal(state.source.text, "跟拍人物");
  assert.equal(state.changed, 1);
  controller.destroy();
  assert.equal(controller.begin({}), false);
});

test("focus and removal edit matching preferences only, and reset restores the snapshot conditions", (t) => {
  const { host, state, controller } = harness(t);
  state.source.text = "海岸跟拍";
  controller.begin({});
  const action = (name, id) => host.querySelector(`[data-match-action="${name}"][data-match-term="${id}"]`);
  action("focus", "海岸").click();
  assert.equal(action("focus", "海岸").getAttribute("aria-pressed"), "true");
  assert.equal(state.preferences.at(-1)["海岸"], "focus");
  action("focus", "海岸").click();
  assert.equal(action("focus", "海岸").getAttribute("aria-pressed"), "false");
  action("remove", "跟拍").click();
  assert.equal(action("focus", "跟拍"), null);
  assert.equal(state.preferences.at(-1)["跟拍"], "removed");
  assert.equal(host.ownerDocument.activeElement, action("focus", "海岸"));
  action("remove", "海岸").click();
  const candidates = [{ id: "unrelated" }];
  assert.equal(controller.results(candidates), candidates);
  assert.match(host.querySelector('[role="status"]').textContent, /已移除全部/);
  assert.equal(controller.active, true);
  host.querySelector('[data-match-action="reset"]').click();
  assert.ok(action("focus", "跟拍"));
  assert.equal(host.querySelector('[data-match-action="reset"]').hidden, true);
  assert.equal(state.source.text, "海岸跟拍");
  assert.equal(host.querySelector("p").textContent, "海岸跟拍");
});

test("explicit text updates preserve surviving preferences and fresh sessions start with defaults", (t) => {
  const { host, state, controller } = harness(t);
  controller.begin({});
  host.querySelector('[data-match-action="focus"]').click();
  state.source.text = "跟拍海岸";
  controller.sync();
  assert.equal(host.querySelectorAll('[data-match-action="focus"]').length, 1);
  host.querySelector('[data-match-action="update"]').click();
  assert.equal(state.preferences.at(-1)["跟拍"], "focus");
  assert.equal(host.querySelector('[data-match-term="海岸"]').getAttribute("aria-pressed"), "false");
  state.source.text = "海岸日光";
  controller.sync();
  host.querySelector('[data-match-action="update"]').click();
  assert.deepEqual(state.preferences.at(-1), {});
  host.querySelector('[data-match-action="focus"]').click();
  controller.begin({});
  assert.deepEqual(state.preferences.at(-1), {});
});

test("unrecognized text stays distinct from explicitly removed conditions", (t) => {
  const { host, state, controller } = harness(t);
  state.source.text = "宿命感";
  controller.begin({});
  assert.match(host.querySelector('[role="status"]').textContent, /暂未识别/);
  assert.equal(controller.results([{ id: "unrelated" }]).length, 0);
});
