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
new vm.Script(readFileSync(new URL("../../legacy-canvas/canvas-prompt-document.js", import.meta.url), "utf8"),
  { filename: "canvas-prompt-document.js" }).runInContext(context);
new vm.Script(codecSource, { filename: "canvas-document-codec.js" }).runInContext(context);
const codec = context.REELAY_CANVAS_DOCUMENT_CODEC as LegacyCodec;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("CanvasDocument v1 cross-runtime contract", () => {
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
