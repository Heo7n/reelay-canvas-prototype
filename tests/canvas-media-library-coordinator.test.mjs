import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
const context = vm.createContext({});
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-media-library-coordinator.js", import.meta.url), "utf8")).runInContext(context);
const { createMediaLibraryCoordinator } = context.REELAY_CANVAS_MEDIA_LIBRARY_COORDINATOR;

test("library deletion waits for the matching trusted confirmation and accepts the resulting catalog", async () => {
  const source = {}, messages = [];
  let hosted = true;
  const coordinator = createMediaLibraryCoordinator({ instanceId: "canvas", postMessage: (message) => messages.push(message),
    getExpectedSource: () => source, getExpectedOrigin: () => "http://localhost", isHosted: () => hosted,
    makeRequestId: () => "delete-request", setTimer: () => 1, clearTimer: () => {} });
  const items = [{ kind: "entity", id: "group", expectedVersion: 3 }, { kind: "folder", id: "folder" }];
  const pending = coordinator.request("delete", { space: "personal", items });
  assert.equal(messages[0].command, "delete");
  assert.deepEqual(messages[0].items, items);
  const catalog = { folders: [], tags: [], entries: [] };
  const data = { source: "reelay-shell", type: "host:media-library-result", protocolVersion: 1, requestId: "delete-request", instanceId: "canvas", command: "delete", result: catalog };
  assert.equal(coordinator.handleHostMessage({ origin: "http://foreign", source, data }), false);
  assert.equal(coordinator.handleHostMessage({ origin: "http://localhost", source, data: { ...data, command: "save" } }), false);
  assert.equal(coordinator.handleHostMessage({ origin: "http://localhost", source, data }), true);
  assert.equal(await pending, catalog);
  hosted = false;
  await assert.rejects(coordinator.request("delete", { space: "personal", items }), /请从项目画布打开资产库后删除/);
  assert.equal(messages.length, 1);
});

test("folder rename carries the observed name and accepts a folder result instead of a catalog", async () => {
  const source = {}, messages = [];
  const coordinator = createMediaLibraryCoordinator({ instanceId: "canvas", postMessage: (message) => messages.push(message),
    getExpectedSource: () => source, getExpectedOrigin: () => "http://localhost", isHosted: () => true,
    makeRequestId: () => "rename-request", setTimer: () => 1, clearTimer: () => {} });
  const input = { space: "personal", folderId: "folder", name: "New", expectedName: "Old" };
  const pending = coordinator.request("rename-folder", input);
  assert.equal(messages[0].expectedName, "Old");
  const folder = { id: "folder", space: "personal", parentId: null, name: "New" };
  assert.equal(coordinator.handleHostMessage({ origin: "http://localhost", source,
    data: { source: "reelay-shell", type: "host:media-library-result", protocolVersion: 1, requestId: "rename-request", instanceId: "canvas", command: "rename-folder", result: folder } }), true);
  assert.equal(await pending, folder);
});
