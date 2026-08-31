import { describe, expect, it } from "vitest";
import {
  hostDocumentMessageSchema,
  hostFlushMessageSchema,
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
    const context = {
      protocolVersion: 1 as const,
      capabilities: { accountSections: true },
      workspaceId: "org-1",
      projectId: "project-1",
      projectName: "品牌故事",
      canvasId: "canvas-1",
      theme: "dark" as const,
      writable: true,
      actor: {
        account: "creator@reelay.test",
        displayName: "Hoo",
      },
      workspace: {
        name: "星海视觉工作室",
        role: "owner" as const,
      },
    };
    const parsedContext = hostMessageSchema.parse({
      source: "reelay-shell",
      type: "host:init",
      context,
    }).context;
    expect(parsedContext.workspaceId).toBe("org-1");
    expect(parsedContext.capabilities).toEqual({ accountSections: true });
    expect(hostMessageSchema.parse({
      source: "reelay-shell",
      type: "host:init",
      context: { ...context, capabilities: undefined },
    }).context.capabilities).toBeUndefined();
    expect(hostMessageSchema.safeParse({
      source: "reelay-shell",
      type: "host:init",
      context: { ...context, capabilities: { accountSections: true, unknown: true } },
    }).success).toBe(false);

    expect(hostDocumentMessageSchema.parse({
      source: "reelay-shell",
      type: "host:document",
      protocolVersion: 1,
      document,
      writable: true,
    }).document).toEqual(document);
    expect(hostFlushMessageSchema.parse({
      source: "reelay-shell",
      type: "host:flush",
      protocolVersion: 1,
    }).type).toBe("host:flush");
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
      instanceId: "canvas-instance-1",
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
      code: "missing",
    }).code).toBe("missing");
  });

  it("accepts routed account sections and defaults old account requests to profile", () => {
    expect(parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
    })).toEqual({
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      section: "profile",
    });

    expect(parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      section: "credits",
    })).toEqual({
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      section: "credits",
    });
  });

  it("rejects unknown or structurally invalid account sections", () => {
    expect(parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      section: "billing",
    })).toBeNull();
    expect(parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      section: "profile",
      unexpected: true,
    })).toBeNull();
  });
});
