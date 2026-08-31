import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-media-asset-coordinator.js", import.meta.url), "utf8");
const context = vm.createContext({ URL });
new vm.Script(source, { filename: "canvas-media-asset-coordinator.js" }).runInContext(context);
const factory = context.REELAY_CANVAS_MEDIA_ASSET_COORDINATOR;
const checksum = "a".repeat(64);
const projectAsset = {
  referenceId: "reference-1", assetId: "asset-1", assetVersion: 1, mediaKind: "image",
  displayName: "cover.png", contentType: "image/png", byteSize: 42,
  checksumSha256: checksum, contentUrl: "/api/assets/asset-1/content",
};
const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const parent = {};
  const posted = [];
  const uploads = [];
  const snapshots = [];
  let id = 0;
  const coordinator = factory.createCanvasMediaAssetCoordinator({
    instanceId: "instance-1",
    makeRequestId: () => `request-${++id}`,
    postMessage: (message) => posted.push(message),
    checksumFile: async () => checksum,
    uploadFile: async (operation) => uploads.push(operation),
    getBaseUrl: () => "https://reelay.test/index.html",
    setTimer: () => 1,
    clearTimer: () => {},
    isHosted: () => true,
    getExpectedOrigin: () => "https://reelay.test",
    getExpectedSource: () => parent,
    onProjectAssets: (assets) => snapshots.push(assets),
  });
  const dispatch = (data, overrides = {}) => coordinator.handleHostMessage({
    data, origin: "https://reelay.test", source: parent, ...overrides,
  });
  return { coordinator, dispatch, posted, snapshots, uploads };
}

test("coordinates checksum, same-origin upload grant, finalize and correlated result", async () => {
  const { coordinator, dispatch, posted, uploads } = harness();
  const result = coordinator.persistFile(
    { name: "cover.png", type: "image/png", size: 42 },
    { mediaKind: "image", displayName: "cover.png", contentType: "image/png" },
  );
  await flushTasks();
  const create = posted[0];
  assert.equal(create.type, "canvas:create-media-upload");
  assert.equal(create.instanceId, "instance-1");
  assert.equal(create.checksumSha256, checksum);
  assert.equal(Object.hasOwn(create, "workspaceId"), false);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-upload-grant", protocolVersion: 1,
    requestId: create.requestId, instanceId: "wrong-instance",
    uploadIntent: { id: "upload-1", expiresAt: "2026-08-31T12:00:00.000Z" },
    upload: { url: "/api/uploads/upload-1", method: "PUT", headers: {} },
  }), false);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-upload-grant", protocolVersion: 1,
    requestId: create.requestId, instanceId: "instance-1",
    uploadIntent: { id: "upload-1", expiresAt: "2026-08-31T12:00:00.000Z" },
    upload: { url: "/api/uploads/upload-1", method: "PUT", headers: { "x-upload": "one" } },
  }), true);
  await flushTasks();
  assert.equal(uploads[0].url, "https://reelay.test/api/uploads/upload-1");
  assert.equal(posted.at(-1).type, "canvas:finalize-media-upload");
  dispatch({
    source: "reelay-shell", type: "host:media-upload-result", protocolVersion: 1,
    requestId: create.requestId, instanceId: "instance-1", uploadId: "upload-1", projectAsset,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await result)), projectAsset);
  assert.equal(coordinator.getPendingCount(), 0);
});

test("rejects cross-origin grants and validates initial snapshot correlation", async () => {
  const { coordinator, dispatch, posted, snapshots, uploads } = harness();
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:project-assets", protocolVersion: 1,
    requestId: "snapshot-1", instanceId: "instance-1", projectAssets: [projectAsset],
  }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots[0])), [projectAsset]);
  const result = coordinator.persistFile(
    { name: "cover.png", type: "image/png", size: 42 },
    { mediaKind: "image", displayName: "cover.png", contentType: "image/png" },
  );
  await flushTasks();
  const create = posted.at(-1);
  dispatch({
    source: "reelay-shell", type: "host:media-upload-grant", protocolVersion: 1,
    requestId: create.requestId, instanceId: "instance-1",
    uploadIntent: { id: "upload-2", expiresAt: "2026-08-31T12:00:00.000Z" },
    upload: { url: "https://evil.test/upload", method: "PUT", headers: {} },
  });
  await assert.rejects(result, (error) => error.code === "invalid");
  assert.equal(uploads.length, 0);
});
