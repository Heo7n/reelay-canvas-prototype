import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../src/application/generation-record-groups.js", import.meta.url), "utf8"), context);
const { groupTasks, recordForTask, canRemove } = context.REELAY_GENERATION_RECORD_GROUPS;
function sample(id = "sample") {
  return { id, sourceSurface: "conversation", scope: { projectId: "p", conversationId: "c", canvasId: "canvas" },
    status: "succeeded", input: {}, result: { id: "result", generation: { stage: "draft", resultId: "result" } } };
}
function final(source, id = "final") {
  return { id, sourceSurface: "conversation", scope: { ...source.scope }, status: "running",
    input: { generationStage: "final", sourceDraftTaskId: source.id, sourceResultId: "result" } };
}

test("groups exact conversation lineage without moving the original record or mutating tasks", () => {
  const source = sample(); const other = sample("other"); const child = final(source); const retry = final(source, "retry");
  retry.status = "succeeded";
  const tasks = [source, other, child, retry];
  const groups = groupTasks(tasks);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].root, source);
  assert.deepEqual(Array.from(groups[0].finals), [child, retry]);
  assert.equal(groups[1].root, other);
  assert.equal(recordForTask(tasks, child.id).root, source);
  assert.equal(recordForTask(tasks, retry).root, source);
  assert.equal(tasks.length, 4);
  assert.equal(source.status, "succeeded");
});

test("group deletion is blocked by any pending attempt, while all terminal attempts remain removable", () => {
  const source = sample(); const child = final(source);
  assert.equal(canRemove(recordForTask([source, child], source)), false);
  child.status = "canceled";
  assert.equal(canRemove(recordForTask([source, child], source)), true);
  child.status = "failed";
  assert.equal(canRemove(recordForTask([source, child], source)), true);
  assert.equal(canRemove(null), false);
});

test("canvas finals are never conversation members and different projects, conversations or result identities stay separate", () => {
  for (const change of [
    (child) => { child.scope.projectId = "other"; },
    (child) => { child.scope.conversationId = "other"; },
    (child) => { child.input.sourceResultId = "other"; },
    (child) => { child.input.sourceDraftTaskId = "other"; },
  ]) {
    const source = sample(); const child = final(source); change(child);
    assert.equal(groupTasks([source, child]).length, 2);
  }
  const source = sample(); const child = final(source);
  child.sourceSurface = "canvas";
  child.scope.conversationId = null;
  assert.equal(groupTasks([source, child]).length, 1);
  assert.equal(recordForTask([source, child], child), null);
});

test("orphan finals retain a standalone record, and sources on another canvas in the same conversation still group", () => {
  const source = sample(); const child = final(source);
  assert.equal(groupTasks([child])[0].root, child);
  child.scope.canvasId = "second-canvas";
  assert.equal(groupTasks([source, child]).length, 1);
  source.status = "failed";
  assert.equal(groupTasks([source, child]).length, 2);
});
