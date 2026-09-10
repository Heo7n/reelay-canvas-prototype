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
const workspaceAsset = {
  assetId: "asset-2", assetVersion: 1, mediaKind: "image",
  displayName: "portrait.png", contentType: "image/png", byteSize: 42,
  checksumSha256: checksum, contentUrl: "/api/workspaces/workspace-1/media-assets/asset-2/content",
};
const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

test("asset availability requires negotiation and a trusted current instance, and duplicate states have no effects", () => {
  let negotiated = false;
  const updates = [];
  const { dispatch } = harness({ usesProgressiveAssetLoading: () => negotiated,
    onAvailability: (state) => updates.push(JSON.parse(JSON.stringify(state))) });
  const message = { source: "reelay-shell", type: "host:asset-availability", protocolVersion: 1,
    instanceId: "instance-1", projectAssets: "ready", workspaceCatalog: "loading" };
  assert.equal(dispatch(message), false, "an older host has not negotiated this extension");
  negotiated = true;
  assert.equal(dispatch({ ...message, instanceId: "old" }), false);
  assert.equal(dispatch(message, { origin: "https://other.test" }), false);
  assert.equal(dispatch(message, { source: {} }), false);
  assert.equal(dispatch({ ...message, workspaceCatalog: true }), false);
  assert.equal(dispatch(message), true);
  assert.equal(dispatch(message), true);
  assert.deepEqual(updates, [{ projectAssets: "ready", workspaceCatalog: "loading" }]);
  assert.equal(dispatch({ ...message, workspaceCatalog: "unavailable" }), true);
  assert.deepEqual(updates.at(-1), { projectAssets: "ready", workspaceCatalog: "unavailable" });
});

function harness(options = {}) {
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
    ...options,
  });
  const dispatch = (data, overrides = {}) => coordinator.handleHostMessage({
    data, origin: "https://reelay.test", source: parent, ...overrides,
  });
  return { coordinator, dispatch, posted, snapshots, uploads };
}

test("transient imports send bounded bytes to the host without HTTP upload or finalize", async () => {
  const { coordinator, dispatch, posted, uploads } = harness({ useTransientUpload: () => true });
  const body = new ArrayBuffer(42);
  const result = coordinator.persistFile({ name: "cover.png", type: "image/png", size: 42, arrayBuffer: async () => body }, { mediaKind: "image" });
  await flushTasks();
  const request = posted[0];
  assert.equal(request.type, "canvas:import-transient-media");
  assert.equal(request.body, body);
  assert.equal(Object.hasOwn(request, "workspaceId"), false);
  const response = { source: "reelay-shell", type: "host:transient-media-result", protocolVersion: 1,
    requestId: request.requestId, instanceId: "instance-1", target: "project", projectAsset };
  assert.equal(dispatch({ ...response, instanceId: "old-instance" }), false);
  assert.equal(dispatch({ ...response, target: "personal", workspaceAsset }), false);
  assert.equal(dispatch(response), true);
  assert.deepEqual(JSON.parse(JSON.stringify(await result)), projectAsset);
  assert.equal(dispatch(response), false);
  assert.equal(uploads.length, 0);
  assert.equal(posted.length, 1);
  await assert.rejects(coordinator.persistFile({ name: "big.png", type: "image/png", size: 4 * 1024 * 1024 + 1 }, { mediaKind: "image" }), /4 MB/);
});

test("coordinates checksum, same-origin upload grant, finalize and correlated result", async () => {
  const { coordinator, dispatch, posted, uploads } = harness();
  const result = coordinator.persistFile(
    { name: "cover.png", type: "image/png", size: 42 },
    { mediaKind: "image", displayName: "cover.png", contentType: "image/png" },
  );
  await flushTasks();
  const create = posted[0];
  assert.equal(create.type, "canvas:create-media-upload");
  assert.equal(create.target, "project");
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
  assert.equal(uploads[0].credentials, "same-origin");
  assert.equal(posted.at(-1).type, "canvas:finalize-media-upload");
  dispatch({
    source: "reelay-shell", type: "host:media-upload-result", protocolVersion: 1,
    requestId: create.requestId, instanceId: "instance-1", uploadId: "upload-1", target: "project", projectAsset,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await result)), projectAsset);
  assert.equal(coordinator.getPendingCount(), 0);
});

test("accepts only trusted signed Storage grants for this upload and never sends account cookies to Storage", async () => {
  const validUrl = "https://project.supabase.co/storage/v1/object/upload/sign/private/workspaces/workspace-1/uploads/upload-1?token=short-lived";
  for (const url of [validUrl, validUrl.replace("https:", "http:"), validUrl.replace("project.supabase.co", "project.supabase.co.evil.test"),
    validUrl.replace("upload-1?", "upload-other?"), validUrl.replace("?token=short-lived", ""), validUrl.replace("/upload/sign/", "/public/")]) {
    const { coordinator, dispatch, posted, uploads } = harness();
    const result = coordinator.persistFile({ name: "clip.mp4", type: "video/mp4", size: 5 * 1024 * 1024 }, { mediaKind: "video" });
    const expectedFailure = url === validUrl ? null : assert.rejects(result, /Cross-origin upload grant/);
    await flushTasks();
    const create = posted[0];
    const grant = { source: "reelay-shell", type: "host:media-upload-grant", protocolVersion: 1,
      requestId: create.requestId, instanceId: "instance-1", uploadIntent: { id: "upload-1", expiresAt: "2026-09-10T12:00:00.000Z" },
      upload: { url, method: "PUT", headers: { "Content-Type": "video/mp4" } } };
    assert.equal(dispatch(grant, { origin: "https://other.test" }), false);
    assert.equal(uploads.length, 0);
    assert.equal(dispatch(grant), true);
    await flushTasks();
    if (expectedFailure) {
      await expectedFailure;
      assert.equal(uploads.length, 0);
    } else {
      assert.equal(uploads[0].credentials, "omit");
      assert.equal(uploads[0].url, validUrl);
      assert.equal(posted.at(-1).type, "canvas:finalize-media-upload");
      dispatch({ source: "reelay-shell", type: "host:media-upload-result", protocolVersion: 1,
        requestId: create.requestId, instanceId: "instance-1", uploadId: "upload-1", target: "project", projectAsset });
      await result;
    }
  }
});

test("keeps personal-only uploads out of the project result path", async () => {
  const { coordinator, dispatch, posted } = harness();
  const result = coordinator.persistFile(
    { name: "portrait.png", type: "image/png", size: 42 },
    { target: "personal", mediaKind: "image", displayName: "portrait.png", contentType: "image/png" },
  );
  await flushTasks();
  const create = posted[0];
  assert.equal(create.target, "personal");
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-upload-grant", protocolVersion: 1,
    requestId: create.requestId, instanceId: "instance-1",
    uploadIntent: { id: "upload-personal", expiresAt: "2026-08-31T12:00:00.000Z" },
    upload: { url: "/api/uploads/upload-personal", method: "PUT", headers: {} },
  }), true);
  await flushTasks();
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-upload-result", protocolVersion: 1,
    requestId: create.requestId, instanceId: "instance-1", uploadId: "upload-personal",
    target: "project", projectAsset,
  }), false);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-upload-result", protocolVersion: 1,
    requestId: create.requestId, instanceId: "instance-1", uploadId: "upload-personal",
    target: "personal", workspaceAsset,
  }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(await result)), workspaceAsset);
});

test("caller-owned upload idempotency keys survive retries while request IDs stay unique", async () => {
  const { coordinator, dispatch, posted } = harness();
  const file = { name: "cover.png", type: "image/png", size: 42 };
  const metadata = { mediaKind: "image", target: "personal", idempotencyKey: " entity-import-stable-key " };
  const first = coordinator.persistFile(file, metadata);
  await flushTasks();
  const firstRequest = posted.at(-1);
  assert.equal(firstRequest.idempotencyKey, "entity-import-stable-key");
  const rejected = assert.rejects(first, /资产命令执行失败/);
  dispatch({ source: "reelay-shell", type: "host:asset-command-error", protocolVersion: 1,
    instanceId: "instance-1", requestId: firstRequest.requestId, code: "network" });
  await rejected;
  const retry = coordinator.persistFile(file, metadata);
  await flushTasks();
  const retryRequest = posted.at(-1);
  assert.equal(retryRequest.idempotencyKey, firstRequest.idempotencyKey);
  assert.notEqual(retryRequest.requestId, firstRequest.requestId);
  const retryRejected = assert.rejects(retry, /资产协调器已停止/);
  coordinator.dispose();
  await retryRejected;
});

test("invalid supplied upload idempotency keys are rejected before posting commands", async () => {
  const { coordinator, posted } = harness();
  for (const idempotencyKey of ["", "  ", "x".repeat(201), 12, {}]) {
    await assert.rejects(coordinator.persistFile({ name: "cover.png", type: "image/png", size: 42 },
      { mediaKind: "image", idempotencyKey }), /幂等标识无效/);
  }
  assert.equal(posted.length, 0);
});

test("correlates personal Media rename results by request, instance, and asset", async () => {
  const { coordinator, dispatch, posted } = harness();
  const result = coordinator.renameMedia(" asset-2 ", " renamed-portrait.png ");
  const rename = posted[0];
  assert.deepEqual(JSON.parse(JSON.stringify(rename)), {
    source: "reelay-legacy-canvas",
    type: "canvas:rename-media",
    protocolVersion: 1,
    instanceId: "instance-1",
    requestId: "request-1",
    assetId: "asset-2",
    displayName: "renamed-portrait.png",
  });
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-rename-result", protocolVersion: 1,
    requestId: rename.requestId, instanceId: "wrong-instance",
    workspaceAsset: { ...workspaceAsset, displayName: "renamed-portrait.png" },
  }), false);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-rename-result", protocolVersion: 1,
    requestId: rename.requestId, instanceId: "instance-1",
    workspaceAsset: { ...workspaceAsset, assetId: "asset-other", displayName: "renamed-portrait.png" },
  }), false);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:media-rename-result", protocolVersion: 1,
    requestId: rename.requestId, instanceId: "instance-1",
    workspaceAsset: { ...workspaceAsset, displayName: "renamed-portrait.png" },
  }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(await result)), {
    ...workspaceAsset,
    displayName: "renamed-portrait.png",
  });
  assert.equal(coordinator.getPendingCount(), 0);
});

test("rejects invalid rename input and maps correlated command errors", async () => {
  const { coordinator, dispatch, posted } = harness();
  await assert.rejects(coordinator.renameMedia("", "name.png"), (error) => error.code === "invalid");
  await assert.rejects(coordinator.renameMedia("asset-2", "   "), (error) => error.code === "invalid");
  const result = coordinator.renameMedia("asset-2", "portrait-v2.png");
  const rename = posted[0];
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:asset-command-error", protocolVersion: 1,
    requestId: rename.requestId, instanceId: "instance-1", code: "conflict",
  }), true);
  await assert.rejects(result, (error) => error.code === "conflict");
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
