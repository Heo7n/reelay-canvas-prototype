import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-entity-asset-coordinator.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-entity-asset-coordinator.js" }).runInContext(context);
const factory = context.REELAY_CANVAS_ENTITY_ASSET_COORDINATOR;
const checksum = "a".repeat(64);
const asset = {
  assetId: "asset-1", assetVersion: 1, mediaKind: "image", displayName: "角色.png",
  contentType: "image/png", byteSize: 42, checksumSha256: checksum,
  contentUrl: "/api/workspaces/workspace-1/media-assets/asset-1/content",
};
const entity = {
  id: "entity-1", name: "Lirael", description: "角色主体",
  mediaRefs: [{ assetId: "asset-1", order: 0 }], coverAssetId: "asset-1", version: 1,
};

function harness() {
  const parent = {};
  const posted = [];
  const catalogs = [];
  const entities = [];
  let id = 0;
  const coordinator = factory.createCanvasEntityAssetCoordinator({
    instanceId: "instance-1",
    makeRequestId: () => `request-${++id}`,
    postMessage: (message) => posted.push(message),
    setTimer: () => 1,
    clearTimer: () => {},
    isHosted: () => true,
    getExpectedOrigin: () => "https://reelay.test",
    getExpectedSource: () => parent,
    onCatalog: (catalog) => catalogs.push(catalog),
    onEntity: (value) => entities.push(value),
  });
  const dispatch = (data, overrides = {}) => coordinator.handleHostMessage({
    data, origin: "https://reelay.test", source: parent, ...overrides,
  });
  return { coordinator, posted, catalogs, entities, dispatch };
}

test("accepts one correlated catalog and projects Entity Media references", () => {
  const { dispatch, catalogs } = harness();
  const message = {
    source: "reelay-shell", type: "host:workspace-asset-catalog", protocolVersion: 1,
    requestId: "catalog-1", instanceId: "instance-1", assets: [asset], entities: [entity],
  };
  assert.equal(dispatch(message), true);
  assert.equal(dispatch(message), false);
  assert.deepEqual(JSON.parse(JSON.stringify(catalogs[0].entities[0].mediaRefs)), [{ mediaId: "asset-1", order: 0 }]);
  assert.equal(catalogs[0].entities[0].coverMediaId, "asset-1");
});

test("coordinates create and update commands with correlated results", async () => {
  const { coordinator, dispatch, posted, entities } = harness();
  const created = coordinator.createEntity({
    name: " Lirael ", description: "角色主体",
    mediaRefs: [{ mediaId: "asset-1", order: 0 }], coverMediaId: "asset-1",
  });
  const createMessage = posted[0];
  assert.equal(createMessage.type, "canvas:create-entity");
  assert.deepEqual(JSON.parse(JSON.stringify(createMessage.assetIds)), ["asset-1"]);
  assert.equal(Object.hasOwn(createMessage, "workspaceId"), false);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:entity-command-result", protocolVersion: 1,
    requestId: createMessage.requestId, instanceId: "instance-1", entity,
  }), true);
  assert.equal((await created).id, "entity-1");

  const updated = coordinator.updateEntity({
    entityId: "entity-1", expectedVersion: 1, name: "Lirael II", description: "",
    mediaRefs: [{ mediaId: "asset-1", order: 0 }], coverMediaId: null,
  });
  const updateMessage = posted.at(-1);
  assert.equal(updateMessage.type, "canvas:update-entity");
  assert.equal(updateMessage.expectedVersion, 1);
  dispatch({
    source: "reelay-shell", type: "host:entity-command-result", protocolVersion: 1,
    requestId: updateMessage.requestId, instanceId: "instance-1",
    entity: { ...entity, name: "Lirael II", coverAssetId: null, version: 2 },
  });
  assert.equal((await updated).version, 2);
  assert.equal(entities.length, 2);
});

test("fails closed for invalid drafts, untrusted events and host conflicts", async () => {
  const { coordinator, dispatch, posted } = harness();
  assert.throws(
    () => coordinator.createEntity({ name: "", mediaRefs: [] }),
    (error) => error.code === "invalid",
  );
  const pending = coordinator.updateEntity({
    entityId: "entity-1", expectedVersion: 1, name: "Lirael", description: "",
    mediaRefs: [{ mediaId: "asset-1", order: 0 }], coverMediaId: "asset-1",
  });
  const message = posted.at(-1);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:asset-command-error", protocolVersion: 1,
    requestId: message.requestId, instanceId: "instance-1", code: "conflict",
  }, { origin: "https://evil.test" }), false);
  assert.equal(dispatch({
    source: "reelay-shell", type: "host:asset-command-error", protocolVersion: 1,
    requestId: message.requestId, instanceId: "instance-1", code: "conflict",
  }), true);
  await assert.rejects(pending, (error) => error.code === "conflict");
});
