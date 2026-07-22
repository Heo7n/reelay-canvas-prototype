import { describe, expect, it } from "vitest";
import {
  hostDocumentMessageSchema,
  hostMessageSchema,
  hostSaveErrorMessageSchema,
  hostSaveResultMessageSchema,
  parseCanvasMessage,
} from "./bridge-protocol";

const document = {
  id: "canvas-1",
  projectId: "project-1",
  schemaVersion: 1,
  revision: 2,
  content: { opaque: ["to", "the", "host"] },
};

describe("legacy canvas bridge", () => {
  it("accepts versioned host context and a separate opaque document message", () => {
    expect(
      hostMessageSchema.parse({
        source: "reelay-shell",
        type: "host:init",
        context: {
          protocolVersion: 1,
          workspaceId: "org-1",
          projectId: "project-1",
          projectName: "品牌故事",
          canvasId: "canvas-1",
          theme: "dark",
          writable: true,
        },
      }).context.workspaceId,
    ).toBe("org-1");

    expect(hostDocumentMessageSchema.parse({
      source: "reelay-shell",
      type: "host:document",
      protocolVersion: 1,
      document,
      writable: true,
    }).document).toEqual(document);
  });

  it("rejects unversioned or foreign messages", () => {
    expect(parseCanvasMessage({ source: "unknown", type: "canvas:ready" })).toBeNull();
    expect(parseCanvasMessage({ source: "reelay-legacy-canvas", type: "canvas:ready", protocolVersion: 2 })).toBeNull();
    expect(parseCanvasMessage({ source: "reelay-legacy-canvas", type: "canvas:dirty", dirty: true })).toBeNull();
  });

  it("validates save content and the saved/conflict response pair", () => {
    const saveRequest = parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:save",
      protocolVersion: 1,
      requestId: "save-1",
      schemaVersion: 1,
      expectedRevision: 2,
      content: document.content,
    });

    expect(saveRequest?.type).toBe("canvas:save");
    expect(hostSaveResultMessageSchema.parse({
      source: "reelay-shell",
      type: "host:save-result",
      protocolVersion: 1,
      requestId: "save-1",
      document: { ...document, revision: 3 },
    }).document.revision).toBe(3);
    expect(hostSaveErrorMessageSchema.parse({
      source: "reelay-shell",
      type: "host:save-error",
      protocolVersion: 1,
      requestId: "save-1",
      code: "conflict",
    }).code).toBe("conflict");
  });
});
