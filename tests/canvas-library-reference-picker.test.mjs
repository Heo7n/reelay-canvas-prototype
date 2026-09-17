import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-library-reference-picker.js", import.meta.url), "utf8");

function setup(t, { kind = "node", initialEntries = [] } = {}) {
  const dom = new JSDOM("<main></main>");
  const context = vm.createContext({ REELAY_ICONS: { markup: () => '<svg aria-hidden="true"></svg>' } });
  new vm.Script(source).runInContext(context);
  let target = { kind, id: "destination" };
  let valid = true;
  let entries = initialEntries;
  let serial = 0;
  const media = new Map();
  const calls = { add: [], remove: [], exit: [], notify: [], changed: 0 };
  const picker = context.REELAY_CANVAS_LIBRARY_REFERENCE_PICKER.create({
    document: dom.window.document,
    container: dom.window.document.querySelector("main"),
    getTarget: () => target,
    isValid: () => valid,
    getTargetLabel: (current) => `目标 ${current.id}`,
    getEntries: () => entries,
    identityKeys: (asset) => [asset.sourceAssetId, asset.stableId].filter(Boolean),
    resolveMedia: (id, space) => media.get(`${space}:${id}`),
    exit: (options) => { calls.exit.push(options); target = null; },
    notify: (message) => calls.notify.push(message),
    onChange: () => { calls.changed += 1; },
    add: (current, asset) => {
      calls.add.push({ target: current, asset });
      entries = [...entries, { asset: { ...asset, id: `reference-${++serial}` } }];
      return true;
    },
    remove: (current, ids) => {
      calls.remove.push({ target: current, ids: [...ids] });
      entries = entries.filter((entry) => !ids.includes(entry.asset.id));
      return true;
    },
  });
  t.after(() => { picker.destroy(); dom.window.close(); });
  return {
    picker, calls, media, document: dom.window.document,
    bar: dom.window.document.querySelector(".library-reference-mode-bar"),
    count: () => dom.window.document.querySelector(".library-reference-mode-count").textContent,
    setEntries: (next) => { entries = next; },
    getEntries: () => entries,
    invalidate: () => { valid = false; },
    end: () => { target = null; },
  };
}

const asset = { id: "library-item", sourceAssetId: "original", name: "角色.png", url: "https://media.test/role.png" };

test("each click immediately updates references and removes the real reference ID", (t) => {
  const state = setup(t);
  state.media.set("personal:library-item", asset);
  assert.equal(state.picker.toggle("library-item", "personal"), true);
  assert.equal(state.picker.selection(asset).selected, true);
  assert.equal(state.getEntries()[0].asset.id, "reference-1");
  assert.equal(state.count(), "节点 · 1 项");
  assert.equal(state.calls.add[0].asset, asset);
  assert.equal(state.calls.exit.length, 0);
  assert.equal(state.picker.toggle("library-item", "personal"), true);
  assert.deepEqual(state.calls.remove[0].ids, ["reference-1"]);
  assert.equal(state.getEntries().length, 0);
  assert.equal(state.count(), "节点 · 0 项");
  assert.equal(state.calls.changed, 2);
});

test("same source and stable identity match existing references across IDs and URLs", (t) => {
  const state = setup(t, { initialEntries: [
    { asset: { id: "actual-a", sourceAssetId: "original", url: "https://signed.test/a" } },
    { asset: { id: "actual-b", stableId: "stable", url: "https://signed.test/b" } },
  ] });
  const candidate = { ...asset, stableId: "stable" };
  state.media.set("organization:library-item", candidate);
  const selected = state.picker.selection(candidate);
  assert.equal(selected.selected, true);
  assert.equal(selected.entries.length, 2);
  assert.equal(state.picker.toggle("library-item", "organization"), true);
  assert.deepEqual(state.calls.remove[0].ids, ["actual-a", "actual-b"]);
  assert.equal(state.calls.add.length, 0);
});

test("URL fallback matches legacy references but empty URLs never imply identity", (t) => {
  const state = setup(t, { initialEntries: [
    { asset: { id: "legacy", url: asset.url } },
    { asset: { id: "empty", url: "" } },
  ] });
  const candidate = { id: "library-copy", url: asset.url };
  assert.equal(state.picker.selection(candidate).selected, true);
  assert.equal(state.picker.selection({ id: "another", url: "" }).selected, false);
  state.media.set("personal:library-copy", candidate);
  state.picker.toggle("library-copy", "personal");
  assert.deepEqual(state.calls.remove[0].ids, ["legacy"]);
  assert.equal(state.getEntries()[0].asset.id, "empty");
});

test("linked references stay selected and reject removal without affecting manual duplicates", (t) => {
  const state = setup(t, { initialEntries: [
    { asset: { ...asset, id: "linked" }, connectionId: "edge" },
    { asset: { ...asset, id: "manual" } },
  ] });
  state.media.set("personal:library-item", asset);
  const selected = state.picker.selection(asset);
  assert.equal(selected.selected, true);
  assert.equal(selected.disabled, true);
  assert.match(selected.hint, /连线/);
  assert.equal(state.picker.toggle("library-item", "personal"), false);
  assert.equal(state.calls.add.length + state.calls.remove.length, 0);
  assert.equal(state.getEntries().length, 2);
  assert.match(state.calls.notify[0], /连线/);
});

test("invalid targets exit on sync and never mutate or resolve a stale reference selection", (t) => {
  const state = setup(t, { initialEntries: [{ asset }] });
  state.media.set("personal:library-item", asset);
  assert.equal(state.picker.sync(), true);
  state.invalidate();
  assert.equal(state.picker.sync(), false);
  assert.equal(state.bar.hidden, true);
  assert.equal(state.calls.exit.length, 1);
  assert.equal(state.calls.exit[0].restoreFocus, false);
  assert.equal(state.picker.toggle("library-item", "personal"), false);
  assert.equal(state.calls.add.length + state.calls.remove.length, 0);
  assert.equal(state.getEntries().length, 1);
  assert.equal(state.picker.selection(asset).disabled, true);
});

test("a removed library source cannot mutate the captured target", (t) => {
  const state = setup(t);
  state.media.set("personal:library-item", asset);
  state.media.delete("personal:library-item");
  assert.equal(state.picker.toggle("library-item", "personal"), false);
  assert.equal(state.calls.add.length + state.calls.remove.length, 0);
  assert.equal(state.calls.changed, 0);
  assert.match(state.calls.notify[0], /素材已不可用/);
});

test("status reflects actual target entries and exit keeps all existing references", (t) => {
  const entries = [{ asset }, { asset: { id: "unrelated", url: "https://media.test/other.png" } }];
  const state = setup(t, { kind: "agent", initialEntries: entries });
  assert.equal(state.bar.hidden, true);
  state.picker.sync();
  assert.equal(state.bar.hidden, false);
  assert.equal(state.count(), "对话 · 2 项");
  assert.equal(state.bar.title, "目标 destination");
  assert.equal(state.bar.querySelector(".library-reference-mode-count").getAttribute("aria-live"), "polite");
  state.bar.querySelector("button").click();
  assert.equal(state.calls.exit.length, 1);
  assert.equal(state.calls.exit[0].restoreFocus, true);
  assert.equal(state.getEntries(), entries);
  assert.equal(state.calls.add.length + state.calls.remove.length, 0);
  assert.equal(state.picker.sync(), false);
  assert.equal(state.bar.hidden, true);
});

test("external reference removal and addition immediately reproject selected state and count", (t) => {
  const state = setup(t, { initialEntries: [{ asset: { ...asset, id: "old-reference" } }] });
  state.media.set("personal:library-item", asset);
  assert.equal(state.picker.selection(asset).selected, true);
  state.setEntries([]);
  state.picker.sync();
  assert.equal(state.picker.selection(asset).selected, false);
  assert.equal(state.count(), "节点 · 0 项");
  state.picker.toggle("library-item", "personal");
  assert.equal(state.calls.add.length, 1);
  assert.equal(state.calls.remove.length, 0);
  state.setEntries([{ asset: { ...asset, id: "external-reference" } }]);
  state.picker.toggle("library-item", "personal");
  assert.deepEqual(state.calls.remove[0].ids, ["external-reference"]);
});
