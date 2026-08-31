import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ProjectAssetUnavailableError } from "../application/ProjectAssetReferenceStore";
import { InMemoryAssetStore, type InMemoryAssetStoreSeed } from "./InMemoryAssetStore";
import { InMemoryObjectStore } from "./InMemoryObjectStore";

const workspaceId = "workspace-1";
const projectId = "project-1";
const ownerId = "actor-owner";
const editorId = "actor-editor";
const viewerId = "actor-viewer";
const outsiderId = "actor-outsider";

const seed: InMemoryAssetStoreSeed = {
  workspaceMemberships: [ownerId, editorId, viewerId, outsiderId].map((actorId) => ({ workspaceId, actorId })),
  projects: [{
    id: projectId,
    workspaceId,
    members: [
      { actorId: ownerId, role: "admin" },
      { actorId: editorId, role: "edit" },
      { actorId: viewerId, role: "view" },
    ],
  }],
};

function createStore() {
  let nextId = 0;
  return new InMemoryAssetStore(
    seed,
    () => new Date("2026-08-31T00:00:00.000Z"),
    () => String(++nextId),
  );
}

async function uploadAsset(store: InMemoryAssetStore, actorId = ownerId) {
  const objectStore = new InMemoryObjectStore();
  const body = new TextEncoder().encode("persistent media");
  const checksumSha256 = createHash("sha256").update(body).digest("hex");
  const intent = await store.createUploadIntent({
    actorId,
    workspaceId,
    idempotencyKey: `upload-${actorId}`,
    mediaKind: "image",
    displayName: "主视觉.webp",
    contentType: "image/webp",
    byteSize: body.byteLength,
    checksumSha256,
  });
  const metadata = await objectStore.putObject({ objectKey: intent.objectKey, contentType: "image/webp", body });
  await store.recordUpload({ actorId, workspaceId, uploadIntentId: intent.id, ...metadata });
  return { intent, asset: await store.finalizeUpload({ actorId, workspaceId, uploadIntentId: intent.id }) };
}

describe("InMemoryAssetStore", () => {
  it("completes an idempotent upload and keeps personal assets actor-scoped", async () => {
    const store = createStore();
    const { intent, asset } = await uploadAsset(store);

    const repeatedIntent = await store.createUploadIntent({
      actorId: ownerId,
      workspaceId,
      idempotencyKey: "upload-actor-owner",
      mediaKind: "image",
      displayName: "主视觉.webp",
      contentType: "image/webp",
      byteSize: 16,
      checksumSha256: "fdb2a5c7fcee66c31a11b1140f8b38185e217fbdd524145be74091ed173158fa",
    });
    expect(repeatedIntent.id).toBe(intent.id);
    await expect(store.finalizeUpload({ actorId: ownerId, workspaceId, uploadIntentId: intent.id }))
      .resolves.toEqual(asset);
    await expect(store.getUploadIntent({ actorId: ownerId, workspaceId, uploadIntentId: intent.id }))
      .resolves.toEqual(expect.objectContaining({ status: "finalized", assetId: asset.id }));
    await expect(store.listPersonalAssets({ actorId: ownerId, workspaceId })).resolves.toEqual([asset]);
    await expect(store.getPersonalAsset({ actorId: ownerId, workspaceId, assetId: asset.id })).resolves.toEqual(asset);
    await expect(store.listPersonalAssets({ actorId: editorId, workspaceId })).resolves.toEqual([]);
    await expect(store.getPersonalAsset({ actorId: editorId, workspaceId, assetId: asset.id })).resolves.toBeNull();
    await expect(store.getUploadIntent({ actorId: editorId, workspaceId, uploadIntentId: intent.id })).resolves.toBeNull();
  });

  it("rejects idempotency-key reuse and uploaded-object metadata mismatches", async () => {
    const store = createStore();
    const checksumSha256 = "a".repeat(64);
    const intent = await store.createUploadIntent({
      actorId: ownerId,
      workspaceId,
      idempotencyKey: "same-command",
      mediaKind: "image",
      displayName: "A.png",
      contentType: "image/png",
      byteSize: 10,
      checksumSha256,
    });

    await expect(store.createUploadIntent({
      actorId: ownerId,
      workspaceId,
      idempotencyKey: "same-command",
      mediaKind: "image",
      displayName: "B.png",
      contentType: "image/png",
      byteSize: 10,
      checksumSha256,
    })).rejects.toMatchObject({ reason: "idempotency_key_reused" });
    await expect(store.recordUpload({
      actorId: ownerId,
      workspaceId,
      uploadIntentId: intent.id,
      objectKey: intent.objectKey,
      contentType: "image/png",
      byteSize: 11,
      checksumSha256,
      etag: checksumSha256,
    })).rejects.toMatchObject({ reason: "metadata_mismatch" });
    await expect(store.finalizeUpload({ actorId: ownerId, workspaceId, uploadIntentId: intent.id }))
      .rejects.toMatchObject({ reason: "not_uploaded" });
  });

  it("attaches once for editors and lets every project member resolve the reference", async () => {
    const store = createStore();
    const { asset } = await uploadAsset(store);
    const reference = await store.attachAssetToProject({ actorId: ownerId, projectId, assetId: asset.id });

    await expect(store.attachAssetToProject({ actorId: ownerId, projectId, assetId: asset.id }))
      .resolves.toEqual(reference);
    await expect(store.listProjectAssets({ actorId: viewerId, projectId })).resolves.toEqual([
      { reference, asset },
    ]);
    await expect(store.getProjectAsset({ actorId: editorId, projectId, referenceId: reference.id }))
      .resolves.toEqual({ reference, asset });
    await expect(store.listProjectAssets({ actorId: outsiderId, projectId }))
      .rejects.toBeInstanceOf(ProjectAssetUnavailableError);

    const viewerAsset = await uploadAsset(store, viewerId);
    await expect(store.attachAssetToProject({ actorId: viewerId, projectId, assetId: viewerAsset.asset.id }))
      .rejects.toBeInstanceOf(ProjectAssetUnavailableError);
  });

  it("does not let an editor attach another actor's personal asset", async () => {
    const store = createStore();
    const { asset } = await uploadAsset(store);
    await expect(store.attachAssetToProject({ actorId: editorId, projectId, assetId: asset.id }))
      .rejects.toBeInstanceOf(ProjectAssetUnavailableError);
  });
});
