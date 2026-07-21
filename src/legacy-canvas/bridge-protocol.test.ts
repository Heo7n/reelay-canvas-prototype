import { describe, expect, it } from "vitest";
import { hostMessageSchema, parseCanvasMessage } from "./bridge-protocol";

describe("legacy canvas bridge", () => {
  it("accepts a versioned host context", () => {
    expect(
      hostMessageSchema.parse({
        source: "reelay-shell",
        type: "host:init",
        context: {
          protocolVersion: 1,
          workspaceId: "org-1",
          projectId: "project-1",
          canvasId: "canvas-1",
          theme: "dark",
        },
      }).context.workspaceId,
    ).toBe("org-1");
  });

  it("rejects unversioned or foreign messages", () => {
    expect(parseCanvasMessage({ source: "unknown", type: "canvas:ready" })).toBeNull();
    expect(parseCanvasMessage({ source: "reelay-legacy-canvas", type: "canvas:ready", protocolVersion: 2 })).toBeNull();
  });
});
