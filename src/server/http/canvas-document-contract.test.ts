import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

import {
  canonicalizeLegacyCanvasDocumentV1,
  sanitizePersistedMediaUrl,
} from "../../contracts/canvas-document-v1";

interface LegacyCodec {
  createSnapshot: (value: unknown) => unknown;
  sanitizeMediaUrl: (value: unknown) => string;
}

const codecSource = readFileSync(
  new URL("../../legacy-canvas/canvas-document-codec.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(readFileSync(new URL("../../../data/model-catalog.js", import.meta.url), "utf8"),
  { filename: "model-catalog.js" }).runInContext(context);
new vm.Script(readFileSync(new URL("../../application/draft-video-policy.js", import.meta.url), "utf8"),
  { filename: "draft-video-policy.js" }).runInContext(context);
new vm.Script(readFileSync(new URL("../../legacy-canvas/canvas-prompt-document.js", import.meta.url), "utf8"),
  { filename: "canvas-prompt-document.js" }).runInContext(context);
new vm.Script(codecSource, { filename: "canvas-document-codec.js" }).runInContext(context);
const codec = context.REELAY_CANVAS_DOCUMENT_CODEC as LegacyCodec;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("CanvasDocument v1 cross-runtime contract", () => {
  it.each(["draft", "final"] as const)("preserves %s provenance identically through browser and HTTP canonicalization", (stage) => {
    const generation = { version: 1, stage, simulated: true, taskId: "task", resultId: "result", createdAt: 1000,
      projectId: "project", canvasId: "canvas", ...(stage === "draft" ? { expiresAt: 604801000 }
        : { sourceDraftTaskId: "source-task", sourceResultId: "source-result" }),
      input: { mediaType: "video", modelId: stage === "draft" ? "seedance-2-5-draft" : "seedance-2-5", prompt: "Original prompt",
        ...(stage === "final" ? { generationStage: "final", sourceDraftTaskId: "source-task", sourceResultId: "source-result" } : {}),
        parameters: { quality: stage === "draft" ? "480p" : "1080p", duration: "10s", outputDuration: 10, seed: 42, audioEnabled: true },
        references: [{ id: "ref", type: "image", url: "/ref.jpg" }], referenceSnapshot: [{ key: "asset:ref", label: "图片1" }] } };
    const asset = { id: "result", type: "video", url: "/clip.mp4", generation };
    const input = { kind: "reelay-legacy-canvas", version: 1, activeCanvasId: "canvas", canvases: [{ id: "canvas", nodes: [
      { id: "generator", kind: "generator", mediaKind: "video", generatedAsset: asset },
      { id: "placed", kind: "asset", assets: [asset] },
    ] }] };
    const browser = plain(codec.createSnapshot(input));
    const server = canonicalizeLegacyCanvasDocumentV1(browser);
    expect(server).toEqual(browser);
    expect(server?.canvases[0].nodes[0].generatedAsset?.generation).toEqual(generation);
    expect(server?.canvases[0].nodes[1].assets[0].generation).toEqual(generation);
    const restored = plain(codec.createSnapshot(canonicalizeLegacyCanvasDocumentV1(server)));
    expect(restored).toEqual(browser);
  });

  it("applies the shared generation whitelist and persisted URL rules at both boundaries", () => {
    const generation = { version: 1, stage: "draft", simulated: true, taskId: "task", resultId: "result", createdAt: 1000,
      projectId: "project", canvasId: "canvas", expiresAt: 604801000, status: "running", charged: 20,
      input: { mediaType: "video", modelId: "seedance-2-5-draft", prompt: "Sample", parameters: { quality: "480p",
        providerParameters: { callbackUrl: "javascript:payload" }, referenceVideos: [{ assetId: "v", url: "blob:https://example.test/video" }] },
        references: [{ id: "ref", type: "image", url: "javascript:payload", posterUrl: "data:text/html,script", generation: { taskId: "nested" } }],
        referenceSnapshot: [{ key: "asset:ref", asset: { id: "ref", type: "image", url: "//example.test/image" } }],
        sourceDraftAsset: { id: "runtime-only" } } };
    const input = { kind: "reelay-legacy-canvas", version: 1, canvases: [{ id: "canvas", nodes: [
      { id: "asset", kind: "asset", assets: [{ id: "result", type: "video", url: "/clip.mp4", generation }] },
    ] }] };
    const server = canonicalizeLegacyCanvasDocumentV1(input);
    expect(server).toEqual(plain(codec.createSnapshot(input)));
    const saved = server?.canvases[0].nodes[0].assets[0].generation;
    expect(saved).not.toHaveProperty("status");
    expect(saved).not.toHaveProperty("charged");
    expect(saved?.input).not.toHaveProperty("sourceDraftAsset");
    expect(saved?.input.references).toEqual([{ id: "ref", type: "image", url: "", posterUrl: "" }]);
    expect(saved?.input.referenceSnapshot).toEqual([{ key: "asset:ref", asset: { id: "ref", type: "image", url: "" } }]);
    expect(saved?.input.parameters.referenceVideos).toEqual([{ assetId: "v", sourceNodeId: "", url: "" }]);
    expect(saved?.input.parameters.providerParameters).toEqual({});
  });

  it("preserves structured prompt identity and reference order in the shared API contract", () => {
    const prompt = { version: 1, content: [
      { type: "text", text: "让" },
      { type: "reference", key: "asset:portrait", mediaType: "image", fallbackLabel: "图片1" },
      { type: "reference", key: "connection:removed", mediaType: "video", fallbackLabel: "视频1" },
    ] };
    const input = { kind: "reelay-legacy-canvas", version: 1, canvases: [{ id: "canvas", nodes: [
      { id: "target", kind: "generator", prompt, assets: [{ id: "portrait", type: "image", url: "/portrait.png" }],
        referenceOrder: ["connection:incoming", "asset:portrait", "asset:portrait", "connection:removed", "asset:foreign"] },
      { id: "source", kind: "asset", assets: [{ id: "foreign", type: "video", url: "/video.mp4" }] },
    ], connections: [{ id: "incoming", sourceNodeId: "source", targetNodeId: "target" }] }] };
    const document = canonicalizeLegacyCanvasDocumentV1(input);
    expect(document?.canvases[0].nodes[0].prompt).toEqual(prompt);
    expect(document?.canvases[0].nodes[0].referenceOrder).toEqual(["connection:incoming", "asset:portrait"]);
    expect(canonicalizeLegacyCanvasDocumentV1(document)).toEqual(document);
    expect(input.canvases[0].nodes[0].prompt).toEqual(prompt);
  });

  it.each([
    { input: "旧提示词\r\n@图片1", expected: "旧提示词\r\n@图片1" },
    { input: "x".repeat(20_001), expected: "x".repeat(20_000) },
    { input: { version: 1, editorHtml: "untrusted", content: [
      { type: "text", text: "一\r\n", marks: ["bold"] }, { type: "text", text: "二" },
      { type: "reference", key: "asset:", mediaType: "image", fallbackLabel: "图片1" },
      { type: "reference", key: "connection:missing", mediaType: "audio", fallbackLabel: " 音频1\n " },
    ] }, expected: { version: 1, content: [
      { type: "text", text: "一\n二" },
      { type: "reference", key: "connection:missing", mediaType: "audio", fallbackLabel: "音频1" },
    ] } },
    { input: { version: 1, content: [{ type: "text", text: "x".repeat(19_999) + "😀" }] },
      expected: { version: 1, content: [{ type: "text", text: "x".repeat(19_999) }] } },
    { input: null, expected: "" },
  ])("normalizes supported prompt content without persisting editor state", ({ input, expected }) => {
    const document = canonicalizeLegacyCanvasDocumentV1({ kind: "reelay-legacy-canvas", version: 1,
      canvases: [{ id: "canvas", nodes: [{ id: "node", kind: "generator", prompt: input }] }] });
    expect(document?.canvases[0].nodes[0].prompt).toEqual(expected);
  });

  it("preserves structured prompt atoms and scoped reference ordering at both persistence boundaries", () => {
    const prompt = { version: 1, content: [
      { type: "text", text: "让" },
      { type: "reference", key: "asset:local", mediaType: "image", fallbackLabel: "图片1" },
      { type: "reference", key: "connection:deleted", mediaType: "video", fallbackLabel: "视频1" },
    ] };
    const input = { kind: "reelay-legacy-canvas", version: 1, activeCanvasId: "canvas", canvases: [{
      id: "canvas", nodes: [
        { id: "generator", kind: "generator", prompt, assets: [{ id: "local", type: "image", url: "/image.png" }],
          referenceOrder: ["asset:local", "connection:incoming", "asset:local", "connection:outgoing", "connection:deleted", "asset:foreign"] },
        { id: "source", kind: "asset", assets: [{ id: "foreign", type: "video", url: "/video.mp4" }] },
        { id: "target", kind: "generator" },
      ], connections: [
        { id: "incoming", sourceNodeId: "source", targetNodeId: "generator" },
        { id: "outgoing", sourceNodeId: "generator", targetNodeId: "target" },
      ],
    }] };
    const document = canonicalizeLegacyCanvasDocumentV1(input);
    expect(document).toEqual(plain(codec.createSnapshot(input)));
    expect(document?.canvases[0].nodes[0].prompt).toEqual(prompt);
    expect(document?.canvases[0].nodes[0].referenceOrder).toEqual(["asset:local", "connection:incoming"]);
    expect(canonicalizeLegacyCanvasDocumentV1(document)).toEqual(document);
  });

  it.each([
    "@图片1\r\nlegacy",
    "a".repeat(20_001),
    { version: 1, extra: true, content: [
      { type: "text", text: "一\r\n", marks: ["bold"] }, { type: "text", text: "二" },
      { type: "reference", key: "connection:missing", mediaType: "audio", fallbackLabel: " 音频1\n " },
      { type: "reference", key: "asset:", mediaType: "video", fallbackLabel: "视频1" },
    ] },
    { version: 1, content: [{ type: "text", text: "a".repeat(19_999) + "😀" }] },
    { version: 1, content: Array.from({ length: 513 }, () => ({ type: "reference", key: "asset:a", mediaType: "image", fallbackLabel: "图片1" })) },
    { version: 2, content: [] }, null, [], false,
  ])("normalizes legacy and bounded structured prompt inputs identically in browser and server", (prompt) => {
    const input = { kind: "reelay-legacy-canvas", version: 1, canvases: [{ id: "canvas", nodes: [{ id: "generator", kind: "generator", prompt }] }] };
    expect(canonicalizeLegacyCanvasDocumentV1(input)).toEqual(plain(codec.createSnapshot(input)));
  });

  it("keeps the TypeScript boundary canonicalizer in parity with the legacy codec", () => {
    const input = {
      kind: "reelay-legacy-canvas",
      version: 1,
      activeCanvasId: "canvas-1",
      unknownRoot: "drop",
      canvases: [{
        id: "canvas-1",
        nodes: [{
          id: "generator-1",
          kind: "generator",
          lockedMode: "video",
          outputFormat: "mov",
          omniReferenceTaskType: "extend",
          generatedAsset: { id: "asset-1", type: "video", url: "https://cdn.example.test/a.mp4" },
          unknownRuntimeState: true,
        }],
      }],
      lastPreset: {
        mode: "video",
        outputFormat: "mp4",
        omniReferenceTaskType: "auto",
      },
    };

    expect(canonicalizeLegacyCanvasDocumentV1(input)).toEqual(plain(codec.createSnapshot(input)));
  });

  it.each(["image", "video"])("preserves %s material validation while ignoring legacy AutoLink", (mediaKind) => {
    for (const enabled of [true, false, undefined]) {
      const input = {
        kind: "reelay-legacy-canvas", version: 1, activeCanvasId: "canvas-1",
        canvases: [{ id: "canvas-1", nodes: [{
          id: "generator", kind: "generator", mediaKind,
          autoLinkEnabled: true, assetValidationEnabled: enabled,
        }] }],
      };
      const document = canonicalizeLegacyCanvasDocumentV1(input);
      expect(document).toEqual(plain(codec.createSnapshot(input)));
      expect(document?.canvases[0]?.nodes[0]?.assetValidationEnabled).toBe(enabled === true);
      expect(document?.canvases[0]?.nodes[0]).not.toHaveProperty("autoLinkEnabled");
    }
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "blob:https://example.test/id",
    "//evil.example/path",
    "https://cdn.example/x\" onerror=\"alert(1)",
    "https://cdn.example/x' onclick='alert(1)",
    "https://cdn.example/x\nmalformed",
    "https://cdn.example/<svg>",
  ])("rejects unsafe persisted media URL %s in both runtimes", (url) => {
    expect(sanitizePersistedMediaUrl(url)).toBe("");
    expect(codec.sanitizeMediaUrl(url)).toBe("");
  });

  it.each(["https://cdn.example.test/a.png", "http://localhost:5173/a.mp4", "/assets/a.png", "./a.png", "../a.png"])(
    "preserves supported persisted media URL %s in both runtimes",
    (url) => {
      expect(sanitizePersistedMediaUrl(url)).toBe(url);
      expect(codec.sanitizeMediaUrl(url)).toBe(url);
    },
  );
});
