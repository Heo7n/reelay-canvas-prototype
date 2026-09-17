import { describe, expect, it, vi } from "vitest";
import { buildMediaUploadPolicy } from "../../domain/asset/media-upload-policy";
import { HttpMediaAssetRepository } from "./HttpMediaAssetRepository";
import { HttpResponseValidationError } from "./HttpApiClient";

describe("HttpMediaAssetRepository upload policy", () => {
  it("reads actual workspace policy and forwards independent upload purpose and owner", async () => {
    const policy = buildMediaUploadPolicy(64 * 1024 * 1024);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ policy }))
      .mockResolvedValueOnce(Response.json({ uploadIntent: { id: "upload", expiresAt: "2026-09-20T00:00:00Z" },
        upload: { url: "/upload", method: "PUT", headers: {} } }));
    const repository = new HttpMediaAssetRepository({ fetch });
    expect(await repository.getUploadPolicy("workspace/name")).toEqual(policy);
    expect(fetch.mock.calls[0][0]).toBe("/api/workspaces/workspace%2Fname/media-upload-policy");
    await repository.createUploadIntent({ workspaceId: "workspace/name", idempotencyKey: "attempt", mediaKind: "video",
      displayName: "shot.webm", contentType: "video/webm", byteSize: 42, checksumSha256: "a".repeat(64),
      uploadPurpose: "library", storageSpace: "organization" });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ uploadPurpose: "library", storageSpace: "organization" });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty("workspaceId");
  });

  it("rejects missing policy fields rather than inventing limits", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ policy: { library: { maxFileBytes: 50 } } }));
    await expect(new HttpMediaAssetRepository({ fetch }).getUploadPolicy("workspace"))
      .rejects.toBeInstanceOf(HttpResponseValidationError);
  });

  it("retains uploaded and finalized status so retries can recover without uploading bytes", async () => {
    const fetch = vi.fn();
    for (const status of ["uploaded", "finalized"] as const) {
      fetch.mockResolvedValueOnce(Response.json({ uploadIntent: { id: "existing", expiresAt: "2026-09-20T00:00:00Z", status },
        upload: { url: "/unused-upload", method: "PUT", headers: {} } }));
    }
    const repository = new HttpMediaAssetRepository({ fetch });
    const input = { workspaceId: "workspace", idempotencyKey: "same-attempt", mediaKind: "image" as const,
      displayName: "cover.png", contentType: "image/png", byteSize: 42, checksumSha256: "a".repeat(64) };
    expect((await repository.createUploadIntent(input)).uploadIntent.status).toBe("uploaded");
    expect((await repository.createUploadIntent(input)).uploadIntent.status).toBe("finalized");
  });

  it("reads owner-specific storage occupancy with the actual capacity", async () => {
    const storage = { owner: { kind: "organization", id: "workspace" }, limitBytes: 100, usedBytes: 40, reservedBytes: 20, availableBytes: 40 };
    const fetch = vi.fn().mockResolvedValue(Response.json({ storage, cleanup: { pendingCount: 1, heldForRemoteUploadCount: 1 } }));
    const repository = new HttpMediaAssetRepository({ fetch });
    expect(await repository.getStorageUsage("workspace/name", "organization")).toEqual(storage);
    expect(fetch.mock.calls[0][0]).toBe("/api/workspaces/workspace%2Fname/media-storage?space=organization");
  });

  it("accepts both confirmed cancellation and remote cancellation pending without masking unknown errors", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ uploadIntent: { id: "upload", status: "cancelled" } }))
      .mockResolvedValueOnce(Response.json({ uploadIntent: { id: "upload", status: "cancelling", reason: "remote_upload_pending" } }, { status: 202 }))
      .mockRejectedValueOnce(new Error("offline"));
    const repository = new HttpMediaAssetRepository({ fetch });
    expect(await repository.cancelUpload("workspace", "upload")).toMatchObject({ status: "cancelled" });
    expect(await repository.cancelUpload("workspace", "upload")).toMatchObject({ status: "cancelling" });
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
    await expect(repository.cancelUpload("workspace", "upload")).rejects.toThrow();
  });
});


it("renames the explicitly selected organization placement through the existing media endpoint", async () => {
  const asset = { id: "media", workspaceId: "workspace", objectVersion: 1, mediaKind: "image", displayName: "Organization.png", contentType: "image/png", byteSize: 4,
    checksumSha256: "a".repeat(64), createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z" };
  const fetch = vi.fn().mockResolvedValue(Response.json({ asset }));
  const repository = new HttpMediaAssetRepository({ fetch });
  expect((await repository.renamePersonalAsset("workspace", "media", "Organization.png", "organization")).displayName).toBe("Organization.png");
  expect(fetch.mock.calls[0][0]).toBe("/api/workspaces/workspace/media-assets/media");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ displayName: "Organization.png", space: "organization" });
});
