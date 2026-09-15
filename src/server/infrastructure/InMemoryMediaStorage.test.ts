import { describe, expect, it } from "vitest";
import { MediaStorageQuotaExceededError } from "../../domain/asset/media-storage";
import { InMemoryAssetStore } from "./InMemoryAssetStore";
import type { AssetUploadIntent } from "../../domain/asset/workspace-media-asset";

const input = { actorId: "a", workspaceId: "w", idempotencyKey: "one", mediaKind: "video" as const, displayName: "cut.mp4", contentType: "video/mp4", byteSize: 60, checksumSha256: "a".repeat(64) };
const scope = { actorId: "a", workspaceId: "w" };
const read = (intent: AssetUploadIntent) => ({ ...scope, uploadIntentId: intent.id });
const object = (intent: AssetUploadIntent) => ({ objectKey: intent.objectKey, contentType: intent.expectedContentType, byteSize: intent.expectedByteSize, checksumSha256: intent.expectedChecksumSha256 });
function fixture(limit = 100) {
  let time = Date.parse("2026-09-15T00:00:00.000Z");
  const store = new InMemoryAssetStore({
    workspaceMemberships: [{ ...scope }, { actorId: "a", workspaceId: "other" }, { actorId: "b", workspaceId: "w" }],
    projects: [
      { id: "private", workspaceId: "w", accessKind: "private", members: [{ actorId: "a", role: "admin" }] },
      { id: "shared", workspaceId: "w", accessKind: "collaborative", members: [{ actorId: "a", role: "edit" }, { actorId: "b", role: "view" }] },
    ],
  }, () => new Date(time), undefined, 1000, { personal: limit, organization: limit });
  return { store, advance: () => { time += 5000; } };
}

describe("media storage ownership and reservations", () => {
  it("finds an owned completed upload without creating a new reservation", async () => {
    const { store, advance } = fixture();
    const intent = await store.createUploadIntent(input);
    await store.recordUpload({ ...read(intent), ...object(intent) });
    const lookup = { ...scope, idempotencyKey: input.idempotencyKey };
    expect((await store.findUploadIntentByIdempotencyKey(lookup))?.status).toBe("uploaded");
    await store.finalizeUpload(read(intent));
    advance();
    expect((await store.findUploadIntentByIdempotencyKey(lookup))?.status).toBe("finalized");
    expect(await store.getMediaStorage(scope)).toMatchObject({ usedBytes: 60, reservedBytes: 0 });
    expect(await store.findUploadIntentByIdempotencyKey({ ...lookup, actorId: "b" })).toBeNull();
    expect(await store.findUploadIntentByIdempotencyKey({ ...lookup, workspaceId: "other" })).toBeNull();
    await expect(store.findUploadIntentByIdempotencyKey({ ...lookup, actorId: "absent" })).rejects.toThrow(/unavailable/);
  });
  it("reserves atomically under concurrency, including cross-workspace personal uploads", async () => {
    const { store } = fixture();
    const results = await Promise.allSettled([store.createUploadIntent(input), store.createUploadIntent({ ...input, workspaceId: "other" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.any(MediaStorageQuotaExceededError) });
    expect(await store.getMediaStorage(scope)).toMatchObject({ limitBytes: 100, usedBytes: 0, reservedBytes: 60, availableBytes: 40 });
  });

  it("reuses a reservation and final source idempotently without counting references or deleted placements", async () => {
    const { store } = fixture();
    const [first, second] = await Promise.all([store.createUploadIntent(input), store.createUploadIntent(input)]);
    expect(first.id).toBe(second.id);
    await store.recordUpload({ ...read(first), ...object(first) });
    const [asset, repeated] = await Promise.all([store.finalizeUpload(read(first)), store.finalizeUpload(read(first))]);
    expect(asset.id).toBe(repeated.id);
    await store.attachAssetToProject({ actorId: "a", projectId: "private", assetId: asset.id });
    await store.saveLibrary({ ...scope, projectId: "private", space: "organization", folderId: null, tagIds: [], items: [{ assetId: asset.id, displayName: asset.displayName, action: "add" }] });
    await store.deleteLibrary({ ...scope, space: "personal", items: [{ kind: "media", id: asset.id }] });
    expect(await store.getMediaStorage(scope)).toMatchObject({ usedBytes: 60, reservedBytes: 0 });
    expect(await store.getMediaStorage({ ...scope, storageSpace: "organization" })).toMatchObject({ usedBytes: 0, reservedBytes: 0 });
  });

  it("derives owner from current writable project access and prevents routing quota to a different owner", async () => {
    const { store } = fixture();
    const personal = await store.createUploadIntent({ ...input, projectId: "private" });
    const shared = await store.createUploadIntent({ ...input, idempotencyKey: "two", projectId: "shared" });
    expect(personal.storageOwner).toEqual({ kind: "personal", id: "a" });
    expect(shared.storageOwner).toEqual({ kind: "organization", id: "w" });
    await expect(store.createUploadIntent({ ...input, idempotencyKey: "wrong", projectId: "shared", storageSpace: "personal" })).rejects.toMatchObject({ reason: "storage_owner_mismatch" });
    await expect(store.createUploadIntent({ ...input, actorId: "b", projectId: "shared" })).rejects.toThrow(/unavailable/);
    await expect(store.createUploadIntent({ ...input, workspaceId: "other", projectId: "shared" })).rejects.toThrow(/unavailable/);
    await expect(store.beginUploadCancellation({ ...read(shared), actorId: "b" })).rejects.toThrow(/unavailable/);
  });

  it("holds expired bytes until deletion confirmation and never resurrects a cancelled idempotency key", async () => {
    const { store, advance } = fixture();
    const intent = await store.createUploadIntent(input);
    await expect(store.beginUploadCancellation({ ...read(intent), expiredOnly: true })).rejects.toMatchObject({ reason: "not_expired" });
    advance();
    expect(await store.listExpiredUploadIntents(scope)).toHaveLength(1);
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: 60 });
    await store.beginUploadCancellation({ ...read(intent), expiredOnly: true });
    await expect(store.recordUpload({ ...read(intent), ...object(intent) })).rejects.toMatchObject({ reason: "cancelled" });
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: 60 });
    await store.completeUploadCancellation(read(intent));
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: 0 });
    await expect(store.createUploadIntent(input)).rejects.toMatchObject({ reason: "cancelled" });
    expect((await store.createUploadIntent({ ...input, idempotencyKey: "retry" })).objectKey).not.toBe(intent.objectKey);
  });

  it("waits for an in-flight proxy PUT before cancellation can permit physical deletion", async () => {
    const { store } = fixture();
    const intent = await store.createUploadIntent(input);
    let release!: () => void;
    let started!: () => void;
    const writing = new Promise<void>((resolve) => { started = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const put = store.writeUpload(read(intent), async () => { started(); await gate; return object(intent); });
    await writing;
    let cancellationFinished = false;
    const cancelled = store.beginUploadCancellation(read(intent)).then((value) => { cancellationFinished = true; return value; });
    await Promise.resolve();
    expect(cancellationFinished).toBe(false);
    release();
    expect((await put).status).toBe("uploaded");
    expect((await cancelled).status).toBe("cancelling");
    await expect(store.writeUpload(read(intent), async () => object(intent))).rejects.toMatchObject({ reason: "cancelled" });
  });

  it("retains a signed reservation even after token expiry, which is not proof of a completed PUT", async () => {
    const { store, advance } = fixture();
    const intent = await store.createUploadIntent(input);
    await store.registerUploadAuthorization({ ...read(intent), expiresAt: "2026-09-15T00:00:02.000Z" });
    await store.beginUploadCancellation(read(intent));
    advance();
    await expect(store.completeUploadCancellation(read(intent))).rejects.toMatchObject({ reason: "authorization_active" });
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: 60 });
  });

  it("does not impose the library single-file limit on a canvas original", async () => {
    const { store } = fixture(10 * 1024 ** 3);
    const intent = await store.createUploadIntent({ ...input, projectId: "shared", byteSize: 60 * 1024 ** 2 });
    expect(intent.expectedByteSize).toBe(60 * 1024 ** 2);
    expect(intent.storageOwner.kind).toBe("organization");
  });
});
