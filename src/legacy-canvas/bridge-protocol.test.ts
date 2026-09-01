import { describe, expect, it } from "vitest";
import {
  hostDocumentMessageSchema,
  hostAssetCommandErrorMessageSchema,
  hostFlushMessageSchema,
  hostMediaUploadGrantMessageSchema,
  hostMediaUploadResultMessageSchema,
  hostMessageSchema,
  hostProjectAssetsMessageSchema,
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
  const projectAsset = {
    referenceId: "reference-1",
    assetId: "asset-1",
    assetVersion: 1,
    mediaKind: "image" as const,
    displayName: "cover.png",
    contentType: "image/png",
    byteSize: 42,
    checksumSha256: "a".repeat(64),
    contentUrl: "/api/assets/asset-1/content",
  };
  const workspaceAsset = {
    assetId: projectAsset.assetId,
    assetVersion: projectAsset.assetVersion,
    mediaKind: projectAsset.mediaKind,
    displayName: projectAsset.displayName,
    contentType: projectAsset.contentType,
    byteSize: projectAsset.byteSize,
    checksumSha256: projectAsset.checksumSha256,
    contentUrl: "/api/workspaces/org-1/media-assets/asset-1/content",
  };
  it("accepts versioned host context and a separate opaque document message", () => {
    const context = {
      protocolVersion: 1 as const,
      capabilities: { accountSections: true, projectSwitcher: true },
      workspaceId: "org-1",
      projectId: "project-1",
      projectName: "品牌故事",
      projects: [
        { id: "project-1", name: "品牌故事", coverUrl: "/assets/brand.webp" },
        { id: "project-2", name: "产品短片", coverUrl: null },
      ],
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
    expect(parsedContext.capabilities).toEqual({ accountSections: true, projectSwitcher: true });
    expect(parsedContext.projects).toHaveLength(2);
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

  it("accepts scoped project switch and creation requests", () => {
    expect(parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:open-project",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      projectId: "project-2",
    })?.type).toBe("canvas:open-project");
    expect(parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:create-project",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
    })?.type).toBe("canvas:create-project");
    expect(parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:open-project",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      projectId: "",
    })).toBeNull();
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

  it("strictly validates scoped asset upload requests and correlated host responses", () => {
    const create = parseCanvasMessage({
      source: "reelay-legacy-canvas",
      type: "canvas:create-media-upload",
      protocolVersion: 1,
      instanceId: "canvas-instance-1",
      requestId: "upload-1",
      idempotencyKey: "attempt-1",
      mediaKind: "image",
      displayName: "cover.png",
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "a".repeat(64),
    });
    expect(create?.type).toBe("canvas:create-media-upload");
    expect(create).toEqual(expect.objectContaining({ target: "project" }));
    expect(parseCanvasMessage({ ...create, workspaceId: "iframe-controlled" })).toBeNull();
    expect(parseCanvasMessage({ ...create, byteSize: 64 * 1024 * 1024 + 1 })).toBeNull();
    expect(parseCanvasMessage({ ...create, checksumSha256: "A".repeat(64) })).toBeNull();

    expect(hostProjectAssetsMessageSchema.parse({
      source: "reelay-shell",
      type: "host:project-assets",
      protocolVersion: 1,
      requestId: "snapshot-1",
      instanceId: "canvas-instance-1",
      projectAssets: [projectAsset],
    }).projectAssets).toEqual([projectAsset]);
    expect(hostMediaUploadGrantMessageSchema.parse({
      source: "reelay-shell",
      type: "host:media-upload-grant",
      protocolVersion: 1,
      requestId: "upload-1",
      instanceId: "canvas-instance-1",
      uploadIntent: { id: "intent-1", expiresAt: "2026-08-31T12:00:00.000Z" },
      upload: { url: "/api/uploads/intent-1", method: "PUT", headers: { "x-upload": "one" } },
    }).upload.method).toBe("PUT");
    const projectResult = hostMediaUploadResultMessageSchema.parse({
      source: "reelay-shell",
      type: "host:media-upload-result",
      protocolVersion: 1,
      requestId: "upload-1",
      instanceId: "canvas-instance-1",
      uploadId: "intent-1",
      target: "project",
      projectAsset,
    });
    expect(projectResult.target === "project" && projectResult.projectAsset.assetId).toBe("asset-1");
    const personalResult = hostMediaUploadResultMessageSchema.parse({
      source: "reelay-shell",
      type: "host:media-upload-result",
      protocolVersion: 1,
      requestId: "upload-2",
      instanceId: "canvas-instance-1",
      uploadId: "intent-2",
      target: "personal",
      workspaceAsset,
    });
    expect(personalResult.target === "personal" && personalResult.workspaceAsset.assetId).toBe("asset-1");
    expect(hostAssetCommandErrorMessageSchema.parse({
      source: "reelay-shell",
      type: "host:asset-command-error",
      protocolVersion: 1,
      requestId: "upload-1",
      instanceId: "canvas-instance-1",
      code: "forbidden",
    }).code).toBe("forbidden");
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
