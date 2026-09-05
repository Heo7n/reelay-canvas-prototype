import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
for (const file of ["canvas-command-executor.js", "canvas-content-commands.js", "canvas-node-task-runner.js"]) {
  vm.runInContext(await readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8"), context);
}
const policy = context.REELAY_CANVAS_CONTENT_COMMANDS;
const plain = (value) => JSON.parse(JSON.stringify(value));
const node = (id, extra = {}) => ({ id, name: id, groupId: null, ...extra });
const group = (id, nodeIds = [], extra = {}) => ({ id, name: id, nodeIds, x: 0, y: 0, width: 400, height: 300, z: 1, ...extra });
const patch = (collection, record, values) => policy.buildFieldChange(collection, record, { ...record, ...values }, Object.keys(values));
const recordChange = (id, before, after) => ({ collection: "groups", id, before: { record: policy.pickGroupContent(before) }, after: { record: policy.pickGroupContent(after) } });

function harness(nodes = [], groups = [], options = {}) {
  const canvas = { id: "canvas-1", nodes, groups, connections: [], undoStack: [] };
  const effects = [];
  const executor = context.REELAY_CANVAS_COMMAND_EXECUTOR.createCanvasCommandExecutor({
    getCanvas: (id) => id === canvas.id ? canvas : null,
    projectRecord: policy.projectRecord,
    validateTransition: policy.validateTransition,
    onCommit: (result) => effects.push(result),
    ...options,
  });
  let serial = 0;
  const execute = (changes, settings) => executor.execute({ id: `command-${++serial}`, type: "content-edit", canvasId: canvas.id, changes }, settings);
  return { canvas, executor, effects, execute, undo: () => executor.undoLast(canvas.id) };
}

test("node field commits and undo preserve live identities and never capture task or UI state", () => {
  const first = node("a", { generating: true, preview: true, panel: "params", assets: [{ id: "asset-1" }] });
  const second = node("b", { promptOptimizing: true });
  const h = harness([first, second]);
  const originalArray = h.canvas.nodes;
  const originalAssets = first.assets;
  assert.equal(h.execute([patch("nodes", first, { name: "renamed", model: "model-b" })]).ok, true);
  assert.equal(h.canvas.nodes, originalArray);
  assert.equal(h.canvas.nodes[0], first);
  assert.equal(h.canvas.nodes[1], second);
  assert.equal(first.assets, originalAssets);
  const entry = plain(h.canvas.undoStack[0]);
  assert.deepEqual(Object.keys(entry.command.changes[0].before.fields).sort(), ["model", "name"]);
  assert.equal("record" in entry.command.changes[0].before, false);
  first.generating = false;
  first.panel = null;
  first.generatedAsset = { id: "result-1" };
  assert.equal(h.undo().ok, true);
  assert.equal(first.name, "a");
  assert.equal(Object.hasOwn(first, "model"), false);
  assert.equal(first.generating, false);
  assert.equal(first.panel, null);
  assert.equal(first.generatedAsset.id, "result-1");
  assert.equal(second.promptOptimizing, true);
});

test("discarding overwritten name history preserves coupled parameters, other records and runtime identity checks", () => {
  const first = node("a", { model: "old" });
  const second = node("b");
  const h = harness([first, second]);
  h.canvas.undoStack.push({ type: "move", positions: [] });
  assert.equal(h.execute([patch("nodes", first, { name: "renamed" })]).ok, true);
  assert.equal(h.execute([
    patch("nodes", first, { name: "new model name", model: "new" }),
    patch("nodes", second, { name: "second name" }),
  ]).ok, true);
  assert.equal(h.executor.discardFieldHistory("missing", "nodes", first.id, ["name"]), false);
  assert.equal(h.canvas.undoStack.length, 3);
  assert.equal(h.executor.discardFieldHistory(h.canvas.id, "nodes", first.id, ["name"]), true);
  assert.equal(h.canvas.undoStack.length, 2);
  assert.equal(h.canvas.undoStack[0].type, "move");
  assert.deepEqual(Object.keys(h.canvas.undoStack[1].command.changes[0].after.fields), ["model"]);
  assert.deepEqual(Object.keys(h.canvas.undoStack[1].inverse.changes.find((change) => change.id === "a").before.fields), ["model"]);
  first.name = "";
  const replacement = { ...first };
  h.canvas.nodes[0] = replacement;
  assert.equal(h.undo().error.code, "before-conflict");
  assert.equal(second.name, "second name");
  assert.equal(h.executor.adoptRestoredRecord(h.canvas.id, "nodes", replacement), true);
  assert.equal(h.undo().ok, true);
  assert.equal(replacement.name, "");
  assert.equal(replacement.model, "old");
  assert.equal(second.name, "b");
  assert.equal(h.canvas.undoStack.length, 1);
});

test("generation started before a patch still completes on patched and untouched nodes", () => {
  for (const targetId of ["a", "b"]) {
    const h = harness([node("a"), node("b")]);
    let complete;
    const completed = [];
    const runner = context.REELAY_CANVAS_NODE_TASK_RUNNER.createCanvasNodeTaskRunner({
      makeTaskId: () => "task-1",
      setTimer: (callback) => { complete = callback; return 1; },
      clearTimer: () => {},
      resolveTarget: (scope) => h.canvas.nodes.find((item) => item.id === scope.nodeId),
      onStart: (_task, target) => { target.generating = true; },
      onComplete: (_task, target) => { target.generating = false; completed.push(target); },
      onCancel: () => {},
    });
    const target = h.canvas.nodes.find((item) => item.id === targetId);
    runner.start({ kind: "generation", scope: { projectId: "project", canvasId: h.canvas.id, nodeId: targetId }, delayMs: 900 });
    assert.equal(h.execute([patch("nodes", h.canvas.nodes[0], { name: "edited during generation" })]).ok, true);
    complete();
    assert.deepEqual(completed, [target]);
    assert.equal(target.generating, false);
    runner.dispose();
  }
});

test("group creation and undo commit both sides and ignore open menu UI in canonical deletion", () => {
  const first = node("a"), second = node("b");
  const h = harness([first, second]);
  const nextGroup = group("g", ["b", "a"]);
  assert.equal(h.execute([
    recordChange("g", null, nextGroup),
    patch("nodes", first, { groupId: "g" }),
    patch("nodes", second, { groupId: "g" }),
  ]).ok, true);
  h.canvas.groups[0].layoutMenuOpen = true;
  assert.equal(h.canvas.undoStack.length, 1);
  assert.equal(h.effects.length, 1);
  assert.equal(h.undo().ok, true);
  assert.equal(h.canvas.nodes[0], first);
  assert.equal(first.groupId, null);
  assert.equal(second.groupId, null);
  assert.deepEqual(plain(h.canvas.groups), []);
  assert.equal(h.effects.length, 2);
});

test("ungroup and undo restore group content, order and membership without task snapshots", () => {
  const first = node("a", { groupId: "g", generating: true });
  const second = node("b", { groupId: "g" });
  const oldGroup = group("g", ["b", "a"], { layoutMenuOpen: true });
  const otherGroup = group("other");
  const h = harness([first, second], [oldGroup, otherGroup]);
  assert.equal(h.execute([
    patch("nodes", first, { groupId: null }), patch("nodes", second, { groupId: null }),
    recordChange("g", oldGroup, null),
  ]).ok, true);
  first.generating = false;
  assert.equal(h.canvas.groups[0], otherGroup);
  assert.equal(h.undo().ok, true);
  assert.deepEqual(plain(h.canvas.groups.map((item) => item.id)), ["g", "other"]);
  assert.deepEqual(plain(h.canvas.groups[0].nodeIds), ["b", "a"]);
  assert.equal(Object.hasOwn(h.canvas.groups[0], "layoutMenuOpen"), false);
  assert.equal(h.canvas.groups[1], otherGroup);
  assert.equal(h.canvas.nodes[0], first);
  assert.equal(first.groupId, "g");
  assert.equal(first.generating, false);
});

test("moving a member between groups is one atomic field transaction", () => {
  const first = node("a", { groupId: "g1" }), second = node("b", { groupId: "g1" });
  const left = group("g1", ["a", "b"], { layoutMenuOpen: true }), right = group("g2");
  const h = harness([first, second], [left, right]);
  assert.equal(h.execute([
    patch("nodes", first, { groupId: "g2" }),
    patch("groups", left, { nodeIds: ["b"] }),
    patch("groups", right, { nodeIds: ["a"] }),
  ]).ok, true);
  assert.equal(h.canvas.groups[0], left);
  assert.equal(h.canvas.groups[1], right);
  assert.equal(left.layoutMenuOpen, true);
  assert.equal(h.undo().ok, true);
  assert.deepEqual(plain(left.nodeIds), ["a", "b"]);
  assert.deepEqual(plain(right.nodeIds), []);
  assert.equal(first.groupId, "g1");
});

test("undoing ungroup restores identity continuity for an earlier group field command", () => {
  const first = node("a", { groupId: "g" }), originalGroup = group("g", ["a"]);
  const h = harness([first], [originalGroup]);
  assert.equal(h.execute([patch("groups", originalGroup, { name: "renamed" })]).ok, true);
  assert.equal(h.execute(policy.buildGroupChanges(h.canvas, [])).ok, true);
  assert.equal(h.undo().ok, true);
  const restoredGroup = h.canvas.groups[0];
  assert.notEqual(restoredGroup, originalGroup);
  assert.equal(restoredGroup.name, "renamed");
  restoredGroup.layoutMenuOpen = true;
  assert.equal(h.undo().ok, true);
  assert.equal(restoredGroup.name, "g");
  assert.equal(restoredGroup.layoutMenuOpen, true);
  assert.equal(first.groupId, "g");
});

test("inconsistent membership rejects every draft without content, undo, or effects", () => {
  for (const build of [
    (n, g) => [patch("nodes", n, { groupId: "missing" })],
    (n, g) => [patch("nodes", n, { groupId: null })],
    (n, g) => [patch("groups", g, { nodeIds: [] })],
    (n, g) => [patch("groups", g, { nodeIds: ["a", "a"] })],
    (n, g) => [patch("groups", g, { nodeIds: ["a", "missing"] })],
    (n, g) => [recordChange(g.id, g, null)],
  ]) {
    const first = node("a", { groupId: "g" }), originalGroup = group("g", ["a"]);
    const h = harness([first], [originalGroup]);
    const before = plain(h.canvas);
    const result = h.execute(build(first, originalGroup));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "invalid-group-membership");
    assert.deepEqual(plain(h.canvas), before);
    assert.equal(h.canvas.nodes[0], first);
    assert.equal(h.canvas.groups[0], originalGroup);
    assert.equal(h.effects.length, 0);
  }
});

test("content policy rejects whole nodes, task/UI fields, assets, media kind, and group replacement", () => {
  const h = harness([node("a")], [group("g")]);
  const current = h.canvas.nodes[0], currentGroup = h.canvas.groups[0];
  for (const field of ["generating", "promptOptimizing", "panel", "assets", "mediaKind", "mode"]) {
    const value = field === "assets" ? [] : "not-content";
    const result = h.execute([{
      collection: "nodes", id: current.id, kind: "fields",
      before: { fields: { [field]: { present: false } } },
      after: { fields: { [field]: { present: true, value } } },
    }]);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "unsupported-content-command");
  }
  assert.equal(h.execute([{ collection: "nodes", id: current.id, before: { record: current }, after: { record: { ...current, name: "replacement" } } }]).error.code, "unsupported-content-command");
  assert.equal(h.execute([recordChange("g", currentGroup, { ...currentGroup, name: "replacement" })]).error.code, "unsupported-content-command");
  assert.equal(h.execute([{ collection: "groups", id: "new", before: { record: null }, after: { record: group("new", [], { layoutMenuOpen: false }) } }]).error.code, "unsupported-content-command");
  assert.equal(h.effects.length, 0);
});

test("stale field preconditions and failed undo leave the complete history untouched", () => {
  const first = node("a"), second = node("b");
  const h = harness([first, second]);
  const stale = patch("nodes", second, { name: "next" });
  second.name = "changed independently";
  assert.equal(h.execute([patch("nodes", first, { name: "next" }), stale]).error.code, "before-conflict");
  assert.equal(first.name, "a");
  assert.equal(h.canvas.undoStack.length, 0);
  assert.equal(h.execute([patch("nodes", first, { name: "next" })]).ok, true);
  first.name = "another edit";
  const entry = h.canvas.undoStack[0];
  assert.equal(h.undo().error.code, "before-conflict");
  assert.equal(h.canvas.undoStack[0], entry);
  assert.equal(first.name, "another edit");
});

test("normalizers cannot alter fields outside the explicit patch or untouched records", () => {
  for (const changeDraft of [
    (records) => { records[0].generating = false; },
    (records) => { records[1].name = "hidden mutation"; },
    (records) => records.reverse(),
  ]) {
    const first = node("a", { generating: true }), second = node("b");
    const h = harness([first, second], [], { normalize: (_collection, records) => { changeDraft(records); return records; } });
    const before = plain(h.canvas);
    const result = h.execute([patch("nodes", first, { name: "next" })]);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "normalize-scope");
    assert.deepEqual(plain(h.canvas), before);
  }
});

test("a mixed record deletion cannot authorize a normalizer to reorder a patched group", () => {
  const first = group("a"), second = group("b"), third = group("c");
  const h = harness([], [first, second, third], { normalize: (_collection, records) => records.reverse() });
  const result = h.execute([patch("groups", first, { name: "renamed" }), recordChange("b", second, null)]);
  assert.equal(result.error.code, "normalize-scope");
  assert.equal(first.name, "a");
  assert.deepEqual(h.canvas.groups, [first, second, third]);
  assert.equal(h.effects.length, 0);
});

test("unwritable fields fail before any member of an atomic command is applied", () => {
  const first = node("a"), second = Object.freeze(node("b"));
  const h = harness([first, second]);
  const result = h.execute([patch("nodes", first, { name: "next-a" }), patch("nodes", second, { name: "next-b" })]);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "execution-failed");
  assert.equal(first.name, "a");
  assert.equal(second.name, "b");
  assert.equal(h.canvas.undoStack.length, 0);
  assert.equal(h.effects.length, 0);
});

test("field absence differs from an own undefined value, and malformed fields fail", () => {
  const first = node("a", { model: undefined });
  const h = harness([first], [], { validateTransition: () => null });
  const after = { ...first };
  delete after.model;
  assert.equal(h.execute([policy.buildFieldChange("nodes", first, after, ["model"])]).ok, true);
  assert.equal(Object.hasOwn(first, "model"), false);
  assert.equal(h.undo().ok, true);
  assert.equal(Object.hasOwn(first, "model"), true);
  assert.equal(first.model, undefined);
  for (const badFields of [{}, { id: { present: true, value: "other" } }, { name: { present: false, value: "ignored" } }]) {
    assert.equal(h.execute([{ collection: "nodes", id: "a", kind: "fields", before: { fields: badFields }, after: { fields: badFields } }]).error.code, "invalid-change");
  }
});

test("same-id replacement cannot receive old undo without an explicit deletion restoration", () => {
  const h = harness([node("a")]);
  assert.equal(h.execute([patch("nodes", h.canvas.nodes[0], { name: "renamed" })]).ok, true);
  const replacement = node("a", { name: "renamed", generating: true });
  h.canvas.nodes = [replacement];
  assert.equal(h.undo().error.code, "before-conflict");
  assert.equal(replacement.name, "renamed");
  assert.equal(h.executor.adoptRestoredRecord("other-canvas", "nodes", replacement), false);
  assert.equal(h.executor.adoptRestoredRecord(h.canvas.id, "nodes", node("a")), false);
  assert.equal(h.executor.adoptRestoredRecord(h.canvas.id, "nodes", replacement), true);
  assert.equal(h.undo().ok, true);
  assert.equal(replacement.name, "a");
  assert.equal(replacement.generating, true);
});

test("field commands retain the shared 50-entry undo bound and committed effectError semantics", () => {
  const h = harness([node("a")], [], { onCommit: () => { throw new Error("save adapter failed"); } });
  h.canvas.undoStack.push({ type: "legacy" });
  for (let index = 0; index < 51; index += 1) {
    const result = h.execute([patch("nodes", h.canvas.nodes[0], { name: `name-${index}` })]);
    assert.equal(result.ok, true);
    assert.equal(result.effectError.message, "save adapter failed");
  }
  assert.equal(h.canvas.undoStack.length, 50);
  assert.equal(h.canvas.nodes[0].name, "name-50");
  h.canvas.undoStack.push({ type: "legacy" });
  assert.equal(h.undo().error.code, "undo-unsupported");
  h.canvas.undoStack.pop();
  assert.equal(h.undo().ok, true);
  assert.equal(h.canvas.nodes[0].name, "name-49");
});

test("import membership normalization uses node ownership and preserves valid member order", () => {
  const nodes = [node("a", { groupId: "g" }), node("b", { groupId: "g" }), node("c", { groupId: "g" }), node("d", { groupId: "gone" })];
  const groups = [group("g", ["b", "missing", "b", "a"]), group("other", ["a"] )];
  const result = policy.normalizeGroupMembership(nodes, groups);
  assert.equal(result.nodes, nodes);
  assert.equal(result.groups, groups);
  assert.deepEqual(plain(groups[0].nodeIds), ["b", "a", "c"]);
  assert.deepEqual(plain(groups[1].nodeIds), []);
  assert.equal(Object.hasOwn(nodes[3], "groupId"), false);
  const once = plain(result);
  policy.normalizeGroupMembership(nodes, groups);
  assert.deepEqual(plain(result), once);
});

test("group planning is pure and combines membership and final positions in one node patch", () => {
  const first = node("a", { groupId: "old", x: 1, y: 2 });
  const untouched = node("b");
  const oldGroup = group("old", ["a"], { layoutMenuOpen: true });
  const h = harness([first, untouched], [oldGroup]);
  const before = plain(h.canvas);
  const nextGroups = [group("new", ["a"])];
  const changes = policy.buildGroupChanges(h.canvas, nextGroups, { positions: [{ id: "a", x: 10, y: 20 }] });
  assert.deepEqual(plain(h.canvas), before);
  assert.equal(changes.some((change) => change.collection === "nodes" && change.id === "b"), false);
  assert.deepEqual(Object.keys(changes.find((change) => change.collection === "nodes").after.fields).sort(), ["groupId", "x", "y"]);
  assert.equal(h.execute(changes).ok, true);
  assert.equal(first.groupId, "new");
  assert.equal(first.x, 10);
  assert.equal(h.undo().ok, true);
  assert.equal(first.groupId, "old");
  assert.equal(first.x, 1);
  assert.equal(h.canvas.nodes[1], untouched);
  assert.equal(untouched.groupId, null);
});

test("basic content types reject invalid coordinates, dimensions, switches and text", () => {
  for (const [field, value] of [["x", Infinity], ["z", NaN], ["name", {}], ["model", null], ["audioEnabled", "true"], ["count", 1.5]]) {
    const first = node("a"), h = harness([first]);
    const result = h.execute([patch("nodes", first, { [field]: value })]);
    assert.equal(result.error.code, "invalid-content-field");
    assert.equal(h.canvas.undoStack.length, 0);
  }
  const current = group("g"), h = harness([], [current]);
  assert.equal(h.execute([patch("groups", current, { width: 0 })]).error.code, "invalid-content-field");
  assert.equal(h.execute([patch("groups", current, { nodeIds: [42] })]).error.code, "invalid-content-field");
});
