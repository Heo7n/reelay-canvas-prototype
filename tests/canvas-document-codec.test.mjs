import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [codecSource, connectionsSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-document-codec.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-connections.js", import.meta.url), "utf8"),
]);
const context = vm.createContext({});
new vm.Script(codecSource, { filename: "canvas-document-codec.js" }).runInContext(context);
new vm.Script(connectionsSource, { filename: "canvas-connections.js" }).runInContext(context);
const codec = context.REELAY_CANVAS_DOCUMENT_CODEC;
const connections = context.REELAY_CANVAS_CONNECTIONS;

const sortedKeys = (value) => Object.keys(value).sort();
const plain = (value) => JSON.parse(JSON.stringify(value));

test("the canvas document codec persists only explicit content fields and restores runtime defaults", () => {
  const state = {
    activeCanvasId: "canvas-1",
    unknownRootField: "must-not-persist",
    lastPreset: {
      mode: "image",
      model: "gpt-image-2",
      aspect: "16:9",
      resolution: "2K",
      quality: "high",
      duration: "4s",
      count: 2,
      workflow: "reference-image",
      omniReferenceTaskType: "auto",
      audioEnabled: false,
      promptOptimization: true,
      credits: 999,
    },
    canvases: [
      {
        id: "canvas-1",
        name: "主画布",
        tx: 120,
        ty: -45,
        scale: 1.25,
        zCounter: 9,
        undoStack: [{ type: "delete" }],
        unknownCanvasField: true,
        nodes: [
          {
            id: "generator-1",
            kind: "generator",
            x: 10,
            y: 20,
            z: 3,
            groupId: "group-1",
            mode: "video",
            model: "seedance-2.0",
            aspect: "16:9",
            resolution: "2K",
            quality: "high",
            duration: "4s",
            count: 2,
            workflow: "reference-image",
            omniReferenceTaskType: "edit",
            audioEnabled: true,
            promptOptimization: true,
            promptOptimizing: true,
            autoLinkEnabled: false,
            assetValidationEnabled: true,
            prompt: "一艘穿越星云的飞船",
            preview: true,
            name: "星云飞船",
            generatedAsset: {
              id: "result-1",
              type: "video",
              name: "result.mp4",
              displayName: "生成结果",
              url: "https://example.test/result.mp4",
              width: 2048,
              height: 1152,
              duration: 0,
              aspectRatio: 16 / 9,
              source: "generated",
              category: "image",
              librarySourceId: "source-result-1",
              enhanced: true,
              unknownAssetField: "must-not-persist",
            },
            assets: [
              {
                id: "reference-1",
                type: "image",
                name: "reference.png",
                displayName: "参考图",
                url: "blob:https://reelay.test/local-only",
                width: 800,
                height: 600,
                duration: 0,
                aspectRatio: 4 / 3,
                source: "local",
                category: "reference",
                librarySourceId: "library-1",
                enhanced: false,
                unknownAssetField: "must-not-persist",
              },
            ],
            activeAssetId: "reference-1",
            credits: 999,
            generating: true,
            generationTaskId: "task-1",
            expanded: false,
            advancedSettingsExpanded: true,
            promptPanelHeight: 291,
            promptLarge: true,
            promptInputHeight: 999,
            mediaMenuOpen: true,
            panel: "model",
            panelAnchor: "model-panel",
            modelFilter: "video",
            unknownNodeField: "must-not-persist",
          },
          {
            id: "asset-node-1",
            kind: "asset",
            x: -5,
            y: 6,
            z: 4,
            mode: "audio",
            assets: [
              {
                id: "audio-1",
                type: "audio",
                name: "score.mp3",
                displayName: "配乐",
                url: "/assets/score.mp3",
                duration: 18,
                aspectRatio: 16 / 9,
                source: "library",
              },
            ],
            activeAssetId: "audio-1",
            expanded: true,
            panel: "unknown",
            mediaMenuOpen: true,
          },
        ],
        connections: [
          {
            id: "connection-1",
            sourceNodeId: "asset-node-1",
            targetNodeId: "generator-1",
            createdAt: "2026-08-11T08:00:00.000Z",
            mediaType: "audio",
            unknownConnectionField: "must-not-persist",
          },
          { id: "missing-target", sourceNodeId: "asset-node-1", targetNodeId: "missing-node" },
          { id: "self-edge", sourceNodeId: "generator-1", targetNodeId: "generator-1" },
          { id: "connection-1", sourceNodeId: "generator-1", targetNodeId: "asset-node-1" },
          { id: "duplicate-edge", sourceNodeId: "asset-node-1", targetNodeId: "generator-1" },
        ],
        groups: [
          {
            id: "group-1",
            name: "场景组",
            nodeIds: ["generator-1", "missing-node"],
            x: 0,
            y: 0,
            width: 900,
            height: 600,
            z: 2,
            layoutMenuOpen: true,
            unknownGroupField: "must-not-persist",
          },
        ],
      },
    ],
  };

  const snapshot = codec.createSnapshot(state);
  const canvas = snapshot.canvases[0];
  const generator = canvas.nodes[0];
  const assetNode = canvas.nodes[1];
  const generatedAsset = generator.generatedAsset;
  const referenceAsset = generator.assets[0];
  const connection = canvas.connections[0];
  const group = canvas.groups[0];

  assert.deepEqual(sortedKeys(snapshot), ["activeCanvasId", "canvases", "kind", "lastPreset", "version"]);
  assert.deepEqual(sortedKeys(canvas), ["connections", "groups", "id", "name", "nodes", "viewport", "zCounter"]);
  assert.deepEqual(sortedKeys(canvas.viewport), ["scale", "tx", "ty"]);
  assert.deepEqual(sortedKeys(generator), [
    "activeAssetId", "aspect", "assetValidationEnabled", "assets", "audioEnabled", "autoLinkEnabled", "count", "duration", "generatedAsset", "groupId", "id", "kind",
    "mediaKind", "model", "name", "omniReferenceTaskType", "preview", "prompt", "quality", "resolution",
    "workflow", "x", "y", "z",
  ]);
  assert.deepEqual(sortedKeys(assetNode), ["activeAssetId", "assets", "id", "kind", "mode", "x", "y", "z"]);
  assert.deepEqual(sortedKeys(generatedAsset), [
    "aspectRatio", "category", "displayName", "duration", "enhanced", "height", "id", "librarySourceId",
    "name", "source", "type", "url", "width",
  ]);
  assert.deepEqual(sortedKeys(referenceAsset), sortedKeys(generatedAsset));
  assert.deepEqual(sortedKeys(connection), ["createdAt", "id", "sourceNodeId", "targetNodeId"]);
  assert.deepEqual(plain(canvas.connections), [{
    id: "connection-1",
    sourceNodeId: "asset-node-1",
    targetNodeId: "generator-1",
    createdAt: "2026-08-11T08:00:00.000Z",
  }]);
  assert.deepEqual(sortedKeys(group), ["height", "id", "name", "nodeIds", "width", "x", "y", "z"]);
  assert.deepEqual(sortedKeys(snapshot.lastPreset), [
    "aspect", "audioEnabled", "count", "duration", "mode", "model", "omniReferenceTaskType", "quality",
    "resolution", "workflow",
  ]);
  assert.equal(referenceAsset.url, "");
  assert.deepEqual(plain(group.nodeIds), ["generator-1"]);

  for (const forbiddenKey of [
    "credits", "generating", "generationTaskId", "promptOptimization", "promptOptimizing", "advancedSettingsExpanded", "promptPanelHeight", "promptLarge", "promptInputHeight", "mediaMenuOpen",
    "panel", "panelAnchor", "modelFilter", "layoutMenuOpen", "unknownRootField", "unknownCanvasField", "unknownNodeField",
    "unknownAssetField", "unknownConnectionField", "unknownGroupField", "undoStack", "mediaType",
  ]) {
    assert.equal(JSON.stringify(snapshot).includes(`\"${forbiddenKey}\"`), false, forbiddenKey);
  }

  const restored = codec.restoreSnapshot(plain(snapshot), {
    minScale: 0.2,
    maxScale: 2,
  });
  const restoredCanvas = restored.canvases[0];
  const restoredGenerator = restoredCanvas.nodes[0];
  const restoredAssetNode = restoredCanvas.nodes[1];

  assert.equal(restored.activeCanvasId, "canvas-1");
  assert.equal(restoredCanvas.tx, 120);
  assert.equal(restoredCanvas.ty, -45);
  assert.equal(restoredCanvas.scale, 1.25);
  assert.deepEqual(plain(restoredCanvas.undoStack), []);
  assert.equal(restoredGenerator.prompt, "一艘穿越星云的飞船");
  assert.equal(restoredGenerator.mode, "video");
  assert.equal(Object.hasOwn(restoredGenerator, "mediaKind"), false);
  assert.equal(Object.hasOwn(restoredGenerator, "lockedMode"), false);
  assert.equal(restoredGenerator.model, "seedance-2.0");
  assert.equal(restoredGenerator.workflow, "reference-image");
  assert.equal(restoredGenerator.omniReferenceTaskType, "edit");
  assert.equal(restoredGenerator.audioEnabled, true);
  assert.equal(restoredGenerator.promptOptimizing, false);
  assert.equal(Object.hasOwn(restoredGenerator, "promptOptimization"), false);
  assert.equal(restoredGenerator.autoLinkEnabled, false);
  assert.equal(restoredGenerator.assetValidationEnabled, true);
  assert.equal(restoredGenerator.generatedAsset.id, "result-1");
  assert.equal(restoredGenerator.generating, false);
  assert.equal(restoredGenerator.credits, 0);
  assert.equal(restoredGenerator.expanded, false);
  assert.equal(restoredGenerator.advancedSettingsExpanded, false);
  assert.equal(Object.hasOwn(restoredGenerator, "promptLarge"), false);
  assert.equal(Object.hasOwn(restoredGenerator, "promptInputHeight"), false);
  assert.equal(restoredGenerator.mediaMenuOpen, false);
  assert.equal(restoredGenerator.panel, null);
  assert.equal(Object.hasOwn(restoredGenerator, "panelAnchor"), false);
  assert.equal(restoredGenerator.modelFilter, "video");
  assert.equal(Object.hasOwn(restoredGenerator, "generationTaskId"), false);
  assert.equal(restoredAssetNode.expanded, false);
  assert.equal(restoredAssetNode.panel, null);
  assert.equal(restoredAssetNode.mediaMenuOpen, false);
  assert.deepEqual(plain(restoredCanvas.connections), [{
    id: "connection-1",
    sourceNodeId: "asset-node-1",
    targetNodeId: "generator-1",
    createdAt: "2026-08-11T08:00:00.000Z",
  }]);
  assert.deepEqual(plain(restoredCanvas.groups[0].nodeIds), ["generator-1"]);
  assert.equal(restored.lastPreset.workflow, "reference-image");
  assert.equal(restored.lastPreset.omniReferenceTaskType, "auto");
  assert.equal(restored.lastPreset.audioEnabled, false);
  assert.equal(Object.hasOwn(restored.lastPreset, "promptOptimization"), false);
});

test("the optional omni reference task type is bounded and ignores non-string values", () => {
  const longTaskType = `<script>alert("task-type")</script>${"x".repeat(100)}`;
  const state = {
    activeCanvasId: "canvas-task-type",
    lastPreset: { mode: "video", omniReferenceTaskType: longTaskType },
    canvases: [{
      id: "canvas-task-type",
      name: "任务类型",
      nodes: [{
        id: "generator-task-type",
        kind: "generator",
        mode: "video",
        omniReferenceTaskType: longTaskType,
      }],
      groups: [],
      viewport: { tx: 0, ty: 0, scale: 1 },
      zCounter: 1,
    }],
  };

  const snapshot = codec.createSnapshot(state);
  const expectedTaskType = longTaskType.slice(0, 80);
  assert.equal(snapshot.canvases[0].nodes[0].omniReferenceTaskType, expectedTaskType);
  assert.equal(snapshot.lastPreset.omniReferenceTaskType, expectedTaskType);

  const restored = codec.restoreSnapshot(plain(snapshot));
  assert.equal(restored.canvases[0].nodes[0].omniReferenceTaskType, expectedTaskType);
  assert.equal(restored.lastPreset.omniReferenceTaskType, expectedTaskType);

  state.canvases[0].nodes[0].omniReferenceTaskType = { hostile: true };
  state.lastPreset.omniReferenceTaskType = ["edit"];
  const sanitized = codec.createSnapshot(state);
  assert.equal(Object.hasOwn(sanitized.canvases[0].nodes[0], "omniReferenceTaskType"), false);
  assert.equal(Object.hasOwn(sanitized.lastPreset, "omniReferenceTaskType"), false);
});

test("the codec rejects unknown versions and normalizes hostile or invalid content", () => {
  assert.equal(codec.restoreSnapshot({ kind: "reelay-legacy-canvas", version: 2, canvases: [] }), null);
  assert.equal(codec.restoreSnapshot({ kind: "other", version: 1, canvases: [] }), null);

  const content = {
    kind: "reelay-legacy-canvas",
    version: 1,
    activeCanvasId: "missing-canvas",
    lastPreset: { mode: "unknown", count: Infinity },
    canvases: [
      {
        id: "canvas-safe",
        name: "安全画布",
        viewport: { tx: Infinity, ty: -Infinity, scale: 99 },
        zCounter: Infinity,
        nodes: [
          {
            id: "asset-safe",
            kind: "asset",
            x: Infinity,
            y: -Infinity,
            z: Infinity,
            mode: "image",
            assets: [
              { id: "javascript", type: "image", url: "javascript:alert(1)" },
              { id: "data", type: "image", url: "data:image/svg+xml,<svg/>" },
              { id: "valid", type: "image", url: "https://example.test/safe.png" },
            ],
            activeAssetId: "javascript",
          },
          { id: "unknown-kind", kind: "widget", x: 1, y: 2 },
        ],
        connections: [
          { id: "missing-source", sourceNodeId: "missing", targetNodeId: "asset-safe" },
          { id: "missing-target", sourceNodeId: "asset-safe", targetNodeId: "unknown-kind" },
          { id: "self-edge", sourceNodeId: "asset-safe", targetNodeId: "asset-safe" },
        ],
        groups: [
          {
            id: "group-safe",
            name: "安全组",
            nodeIds: ["asset-safe", "unknown-kind", "missing"],
            x: Infinity,
            y: -Infinity,
            width: -20,
            height: Infinity,
            z: Infinity,
          },
        ],
      },
    ],
  };

  const restored = codec.restoreSnapshot(content, { minScale: 0.25, maxScale: 1.5 });
  const canvas = restored.canvases[0];
  const node = canvas.nodes[0];

  assert.equal(restored.activeCanvasId, "canvas-safe");
  assert.equal(restored.lastPreset.mode, "image");
  assert.equal(restored.lastPreset.count, 1);
  assert.equal(canvas.tx, 0);
  assert.equal(canvas.ty, 0);
  assert.equal(canvas.scale, 1.5);
  assert.equal(canvas.zCounter, 1);
  assert.equal(canvas.nodes.length, 1);
  assert.deepEqual(plain(canvas.connections), []);
  assert.equal(node.x, 0);
  assert.equal(node.y, 0);
  assert.equal(node.z, 1);
  assert.equal(node.assets[0].url, "");
  assert.equal(node.assets[1].url, "");
  assert.equal(node.assets[2].url, "https://example.test/safe.png");
  assert.deepEqual(plain(canvas.groups[0].nodeIds), ["asset-safe"]);
  assert.equal(canvas.groups[0].x, 0);
  assert.equal(canvas.groups[0].y, 0);
  assert.equal(canvas.groups[0].width, 1);
  assert.equal(canvas.groups[0].height, 1);
  assert.equal(canvas.groups[0].z, 1);
});

test("the codec restores legacy version-one canvases without a connections field", () => {
  const restored = codec.restoreSnapshot({
    kind: "reelay-legacy-canvas",
    version: 1,
    activeCanvasId: "legacy-canvas",
    canvases: [{
      id: "legacy-canvas",
      name: "Legacy canvas",
      nodes: [],
      groups: [],
      viewport: { tx: 0, ty: 0, scale: 1 },
      zCounter: 1,
    }],
  });

  assert.deepEqual(plain(restored.canvases[0].connections), []);
});

test("legacy generator type aliases migrate once to mediaKind without entering runtime state", () => {
  const legacyContent = {
    kind: "reelay-legacy-canvas",
    version: 1,
    activeCanvasId: "legacy-canvas",
    canvases: [{
      id: "legacy-canvas",
      name: "Legacy canvas",
      nodes: [
        {
          id: "legacy-generator",
          kind: "generator",
          x: 0,
          y: 0,
          z: 1,
          mode: "image",
          lockedMode: "video",
          model: "video-a",
          generatedAsset: {
            id: "legacy-result",
            type: "video",
            url: "https://example.test/result.mp4",
          },
        },
        {
          id: "target-generator",
          kind: "generator",
          x: 400,
          y: 0,
          z: 2,
          mode: "image",
          model: "image-a",
        },
      ],
      connections: [{
        id: "legacy-connection",
        sourceNodeId: "legacy-generator",
        targetNodeId: "target-generator",
      }],
      groups: [],
      viewport: { tx: 0, ty: 0, scale: 1 },
      zCounter: 1,
    }],
  };

  const restored = codec.restoreSnapshot(legacyContent);
  const runtimeNode = restored.canvases[0].nodes[0];
  assert.equal(runtimeNode.mode, "video");
  assert.equal(runtimeNode.generatedAsset.type, "video");
  assert.equal(Object.hasOwn(runtimeNode, "lockedMode"), false);
  assert.equal(Object.hasOwn(runtimeNode, "mediaKind"), false);
  const runtimeConnections = connections.normalizeConnections(
    restored.canvases[0].connections,
    restored.canvases[0].nodes,
  );
  assert.equal(runtimeConnections[0].mediaType, "video");

  const migrated = codec.createSnapshot(restored);
  const persistedNode = migrated.canvases[0].nodes[0];
  assert.equal(persistedNode.mediaKind, "video");
  assert.equal(Object.hasOwn(persistedNode, "mode"), false);
  assert.equal(Object.hasOwn(persistedNode, "lockedMode"), false);
});
