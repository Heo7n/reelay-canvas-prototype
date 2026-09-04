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
new vm.Script(codecSource, { filename: "canvas-document-codec.js" }).runInContext(context);
const codec = context.REELAY_CANVAS_DOCUMENT_CODEC as LegacyCodec;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe("CanvasDocument v1 cross-runtime contract", () => {
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
