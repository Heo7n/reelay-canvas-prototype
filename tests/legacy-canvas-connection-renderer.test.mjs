import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-connection-renderer.js", import.meta.url),
  "utf8",
);

function createHarness() {
  const dom = new JSDOM(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g id="paths"></g>
      <g id="batch-previews"></g>
      <path id="preview" class="connection-preview hidden"></path>
      <circle id="endpoint" class="connection-preview-endpoint hidden"></circle>
    </svg>
  `);
  const context = vm.createContext({
    document: dom.window.document,
    window: dom.window,
  });
  new vm.Script(source).runInContext(context);
  const preview = dom.window.document.querySelector("#preview");
  const endpoint = dom.window.document.querySelector("#endpoint");
  const renderer = context.REELAY_CANVAS_CONNECTION_RENDERER.createConnectionRenderer({
    paths: dom.window.document.querySelector("#paths"),
    batchPreviewPaths: dom.window.document.querySelector("#batch-previews"),
    preview,
    previewEndpoint: endpoint,
  });
  const getPath = (start, end) => `${start.x},${start.y}->${end.x},${end.y}`;
  return {
    batchPreviews: dom.window.document.querySelector("#batch-previews"),
    endpoint,
    getPath,
    paths: dom.window.document.querySelector("#paths"),
    preview,
    renderer,
  };
}

test("related and active connections render above muted paths", () => {
  const { paths, renderer } = createHarness();
  const connections = [{ id: "active" }, { id: "muted" }, { id: "related" }];
  const render = (activeConnectionId, relatedIds) => renderer.renderConnections({
    connections,
    activeConnectionId,
    relatedConnectionIds: new Set(relatedIds),
    recentConnectionIds: new Set(),
    hasFocusedContext: true,
    controlScale: 1,
    resolvePoints: () => ({ source: { x: 0, y: 0 }, target: { x: 10, y: 10 } }),
    getPath: () => "M 0 0 L 10 10",
  });

  render("active", ["related"]);
  assert.deepEqual(Array.from(paths.children, (group) => group.dataset.connectionId), ["muted", "related", "active"]);
  const groups = new Map(Array.from(paths.children, (group) => [group.dataset.connectionId, group]));

  render("muted", ["active"]);
  assert.deepEqual(Array.from(paths.children, (group) => group.dataset.connectionId), ["related", "active", "muted"]);
  assert.equal(paths.children.length, 3);
  groups.forEach((group, id) => assert.equal(paths.querySelector(`[data-connection-id="${id}"]`), group));
});

test("recent connections add one directional settle sweep without animating the base line", () => {
  const { paths, renderer } = createHarness();
  const connection = { id: "fresh" };
  const render = (recentConnectionIds) => renderer.renderConnections({
    connections: [connection],
    activeConnectionId: null,
    relatedConnectionIds: new Set(),
    recentConnectionIds,
    hasFocusedContext: false,
    controlScale: 1,
    resolvePoints: () => ({ source: { x: 0, y: 0 }, target: { x: 120, y: 40 } }),
    getPath: () => "M 0 0 C 40 0 80 40 120 40",
  });

  render(new Set([connection.id]));
  const group = paths.firstElementChild;
  const trail = group.querySelector(".connection-settle-trail");
  const head = group.querySelector(".connection-settle-head");
  assert.equal(group.classList.contains("is-new"), true);
  assert.equal(trail?.getAttribute("pathLength"), "1");
  assert.equal(head?.getAttribute("pathLength"), "1");
  assert.equal(trail?.getAttribute("d"), "M 0 0 C 40 0 80 40 120 40");
  assert.equal(head?.getAttribute("d"), "M 0 0 C 40 0 80 40 120 40");

  render(new Set([connection.id]));
  assert.equal(group.querySelector(".connection-settle-trail"), trail);
  assert.equal(group.querySelector(".connection-settle-head"), head);

  render(new Set());
  assert.equal(group.classList.contains("is-new"), false);
  assert.equal(group.querySelector(".connection-settle-trail"), null);
  assert.equal(group.querySelector(".connection-settle-head"), null);
});

test("connection preview transitions through free, near, snapped, and cleared feedback", () => {
  const { endpoint, getPath, preview, renderer } = createHarness();
  const action = {
    type: "connect",
    originSide: "output",
    start: { x: 10, y: 20 },
    current: { x: 30, y: 40 },
    nearPortId: null,
    targetPortId: null,
  };

  renderer.renderPreview(action, getPath);
  assert.equal(preview.getAttribute("d"), "10,20->30,40");
  assert.equal(endpoint.getAttribute("cx"), "30");
  assert.equal(endpoint.getAttribute("cy"), "40");
  assert.equal(preview.classList.contains("hidden"), false);
  assert.equal(preview.classList.contains("is-near-target"), false);
  assert.equal(endpoint.classList.contains("is-snapped"), false);

  action.nearPortId = "node-b:left";
  renderer.renderPreview(action, getPath);
  assert.equal(preview.classList.contains("is-near-target"), true);
  assert.equal(endpoint.classList.contains("is-near-target"), true);
  assert.equal(preview.classList.contains("is-snapped"), false);

  action.nearPortId = null;
  action.targetPortId = "node-b:left";
  action.current = { x: 50, y: 60 };
  renderer.renderPreview(action, getPath);
  assert.equal(preview.classList.contains("is-near-target"), false);
  assert.equal(preview.classList.contains("is-snapped"), true);
  assert.equal(endpoint.classList.contains("is-near-target"), false);
  assert.equal(endpoint.classList.contains("is-snapped"), true);
  assert.equal(endpoint.getAttribute("cx"), "50");
  assert.equal(endpoint.getAttribute("cy"), "60");

  action.pendingCreate = true;
  action.targetPortId = null;
  renderer.renderPreview(action, getPath);
  assert.equal(preview.classList.contains("hidden"), false);
  assert.equal(preview.classList.contains("is-pending-create"), true);
  assert.equal(endpoint.classList.contains("hidden"), true);

  renderer.renderPreview(null, getPath);
  assert.equal(preview.classList.contains("hidden"), true);
  assert.equal(endpoint.classList.contains("hidden"), true);
  assert.equal(preview.hasAttribute("d"), false);
  assert.equal(endpoint.hasAttribute("cx"), false);
  assert.equal(endpoint.hasAttribute("cy"), false);
  assert.equal(preview.classList.contains("is-near-target"), false);
  assert.equal(preview.classList.contains("is-snapped"), false);
  assert.equal(endpoint.classList.contains("is-near-target"), false);
  assert.equal(endpoint.classList.contains("is-snapped"), false);
});

test("selection connection preview reconciles one branch per selected source", () => {
  const { batchPreviews, endpoint, getPath, preview, renderer } = createHarness();
  const action = {
    type: "connect",
    mode: "selection-output",
    origins: [
      { nodeId: "a", start: { x: 10, y: 20 } },
      { nodeId: "b", start: { x: 30, y: 40 } },
    ],
    current: { x: 100, y: 80 },
    nearPortId: null,
    targetPortId: null,
  };

  renderer.renderPreview(action, getPath);
  assert.equal(preview.classList.contains("hidden"), true);
  assert.equal(endpoint.classList.contains("hidden"), true);
  assert.deepEqual(
    Array.from(batchPreviews.children, (path) => [path.dataset.sourceNodeId, path.getAttribute("d")]),
    [["a", "10,20->100,80"], ["b", "30,40->100,80"]],
  );

  action.origins = [action.origins[1]];
  action.current = { x: 120, y: 90 };
  action.targetPortId = "target:input";
  renderer.renderPreview(action, getPath);
  assert.equal(batchPreviews.children.length, 1);
  assert.equal(batchPreviews.firstElementChild.dataset.sourceNodeId, "b");
  assert.equal(batchPreviews.firstElementChild.classList.contains("is-snapped"), true);

  action.pendingCreate = true;
  action.targetPortId = null;
  renderer.renderPreview(action, getPath);
  assert.equal(batchPreviews.firstElementChild.classList.contains("is-pending-create"), true);

  renderer.renderPreview(null, getPath);
  assert.equal(batchPreviews.children.length, 0);
});
