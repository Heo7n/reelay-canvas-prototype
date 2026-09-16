import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
const context = vm.createContext({});
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-media-library-coordinator.js", import.meta.url), "utf8")).runInContext(context);
const { createMediaLibraryCoordinator } = context.REELAY_CANVAS_MEDIA_LIBRARY_COORDINATOR;

test("custom tag deletion carries the confirmed usage and waits for its own trusted result", async () => {
  const source = {}, messages = [];
  const coordinator = createMediaLibraryCoordinator({ instanceId: "canvas", postMessage: (message) => messages.push(message),
    getExpectedSource: () => source, getExpectedOrigin: () => "http://localhost", isHosted: () => true,
    makeRequestId: () => "delete-tag-1", setTimer: () => 1, clearTimer: () => {} });
  const pending = coordinator.request("delete-tag", { space: "personal", tagId: "custom", expectedUsageCount: 3 });
  assert.equal(messages[0].command, "delete-tag");
  assert.equal(messages[0].tagId, "custom");
  assert.equal(messages[0].expectedUsageCount, 3);
  const catalog = { folders: [], tags: [], entries: [], entityEntries: [] };
  const data = { source: "reelay-shell", type: "host:media-library-result", protocolVersion: 1, requestId: "delete-tag-1", instanceId: "canvas", command: "delete-tag", result: catalog };
  assert.equal(coordinator.handleHostMessage({ origin: "http://foreign", source, data }), false);
  assert.equal(coordinator.handleHostMessage({ origin: "http://localhost", source, data: { ...data, command: "update-tags" } }), false);
  assert.equal(coordinator.handleHostMessage({ origin: "http://localhost", source, data }), true);
  assert.equal(await pending, catalog);
});

test("tag deletion exposes server conflict identity for a refreshed confirmation", async () => {
  const source = {};
  const coordinator = createMediaLibraryCoordinator({ instanceId: "canvas", postMessage: () => {},
    getExpectedSource: () => source, getExpectedOrigin: () => "http://localhost", isHosted: () => true,
    makeRequestId: () => "conflict", setTimer: () => 1, clearTimer: () => {} });
  const pending = coordinator.request("delete-tag", { space: "personal", tagId: "custom", expectedUsageCount: 1 });
  const rejected = assert.rejects(pending, (error) => error.code === "conflict" && error.serviceCode === "tag_usage_changed" && error.message === "标签使用情况已更新");
  assert.equal(coordinator.handleHostMessage({ origin: "http://localhost", source, data: {
    source: "reelay-shell", type: "host:asset-command-error", protocolVersion: 1, instanceId: "canvas", requestId: "conflict",
    code: "conflict", serviceCode: "tag_usage_changed", message: "标签使用情况已更新",
  } }), true);
  await rejected;
});

test("tag updates resolve only a trusted matching catalog and preserve independent group tags", async () => {
  const source = {}, messages = [];
  let count = 0;
  const coordinator = createMediaLibraryCoordinator({ instanceId: "canvas", postMessage: (message) => messages.push(message),
    getExpectedSource: () => source, getExpectedOrigin: () => "http://localhost", isHosted: () => true,
    makeRequestId: () => `tags-${++count}`, setTimer: () => 1, clearTimer: () => {} });
  const input = { space: "personal", operation: "remove", tagIds: ["builtin:scene"], items: [{ kind: "entity", id: "group" }] };
  const pending = coordinator.request("update-tags", input);
  assert.equal(messages[0].command, "update-tags");
  assert.deepEqual(messages[0].items, input.items);
  assert.deepEqual(messages[0].tagIds, input.tagIds);
  const catalog = { folders: [], tags: [], entries: [], entityEntries: [{ entityId: "group", space: "personal", tagIds: [] }] };
  const data = { source: "reelay-shell", type: "host:media-library-result", protocolVersion: 1, requestId: "tags-1", instanceId: "canvas", command: "update-tags", result: catalog };
  for (const event of [{ origin: "http://foreign", source, data }, { origin: "http://localhost", source: {}, data },
    { origin: "http://localhost", source, data: { ...data, instanceId: "other" } }, { origin: "http://localhost", source, data: { ...data, command: "save" } }]) {
    assert.equal(coordinator.handleHostMessage(event), false);
  }
  assert.equal(coordinator.handleHostMessage({ origin: "http://localhost", source, data }), true);
  assert.equal(await pending, catalog);
  const malformed = coordinator.request("update-tags", input);
  const rejected = assert.rejects(malformed, /无效结果/);
  coordinator.handleHostMessage({ origin: "http://localhost", source, data: { ...data, requestId: "tags-2",
    result: { ...catalog, entityEntries: [{ entityId: "group", space: "personal", tagIds: [null] }] } } });
  await rejected;
});

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
