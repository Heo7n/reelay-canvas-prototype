import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryAssetStore } from "../infrastructure/InMemoryAssetStore";
import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";
import { registerMediaStorageRoutes } from "./media-storage-routes";
import { MediaStorageResponseSchema } from "../../infrastructure/http/media-storage-contracts";

const scope = { actorId: "a", workspaceId: "w" };
const body = Buffer.from("actual-upload");
const input = { ...scope, idempotencyKey: "one", mediaKind: "image" as const, displayName: "image.png", contentType: "image/png", byteSize: body.byteLength, checksumSha256: createHash("sha256").update(body).digest("hex") };
const headers = { cookie: "reelay_demo_session=a" };
const base = "/api/workspaces/w";
const apps: FastifyInstance[] = [];
async function fixture() {
  let time = Date.parse("2026-09-15T00:00:00.000Z");
  const store = new InMemoryAssetStore({ workspaceMemberships: [{ ...scope }, { workspaceId: "w", actorId: "b" }], projects: [] }, () => new Date(time), undefined, 1000);
  const objects = new InMemoryObjectStore();
  const app = Fastify();
  apps.push(app);
  await app.register(cookie);
  registerMediaStorageRoutes(app, { assetStore: store, objectStore: objects, sessions: { async getSessionActor(sessionId) {
    return sessionId ? { id: sessionId, account: sessionId, displayName: sessionId, workspaceIds: ["w"] } : null;
  } } });
  const intent = await store.createUploadIntent(input);
  const read = { ...scope, uploadIntentId: intent.id };
  return { app, store, objects, intent, read, advance: () => { time += 5000; } };
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("storage lifecycle HTTP routes", () => {
  it("deletes a cancelled unfinished object before releasing its reservation, with idempotent retry", async () => {
    const { app, store, objects, intent, read } = await fixture();
    await store.writeUpload(read, () => objects.putObject({ objectKey: intent.objectKey, contentType: input.contentType, body }));
    const response = await app.inject({ method: "DELETE", url: `${base}/media-upload-intents/${intent.id}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().uploadIntent.status).toBe("cancelled");
    expect(await objects.headObject(intent.objectKey)).toBeNull();
    expect((await app.inject({ method: "GET", url: `${base}/media-storage?space=personal`, headers })).json().storage).toMatchObject({ usedBytes: 0, reservedBytes: 0 });
    expect((await app.inject({ method: "DELETE", url: `${base}/media-upload-intents/${intent.id}`, headers })).statusCode).toBe(200);
  });

  it("keeps reserved bytes when deletion fails, and retries cleanup on an authorized storage read", async () => {
    const { app, store, objects, intent, read, advance } = await fixture();
    await store.writeUpload(read, () => objects.putObject({ objectKey: intent.objectKey, contentType: input.contentType, body }));
    advance();
    const remove = vi.spyOn(objects, "deleteObject").mockRejectedValueOnce(new Error("Offline"));
    const failed = await app.inject({ method: "DELETE", url: `${base}/media-upload-intents/${intent.id}`, headers });
    expect(failed.statusCode).toBe(503);
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: body.byteLength });
    expect(await objects.headObject(intent.objectKey)).not.toBeNull();
    const retried = await app.inject({ method: "GET", url: `${base}/media-storage`, headers });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().storage.reservedBytes).toBe(0);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("does not release after an unconfirmed deletion or leak another actor's reservation", async () => {
    const { app, store, objects, intent, read, advance } = await fixture();
    await store.writeUpload(read, () => objects.putObject({ objectKey: intent.objectKey, contentType: input.contentType, body }));
    advance();
    vi.spyOn(objects, "deleteObject").mockResolvedValue(false);
    const denied = await app.inject({ method: "DELETE", url: `${base}/media-upload-intents/${intent.id}`, headers: { cookie: "reelay_demo_session=b" } });
    expect(denied.statusCode).toBe(404);
    const other = await app.inject({ method: "GET", url: `${base}/media-storage`, headers: { cookie: "reelay_demo_session=b" } });
    expect(other.json().storage.reservedBytes).toBe(0);
    const self = await app.inject({ method: "GET", url: `${base}/media-storage`, headers });
    expect(self.json().storage.reservedBytes).toBe(body.byteLength);
    expect(self.json().cleanup.pendingCount).toBe(1);
  });

  it("holds remote authorization bytes even after expiry and exposes the pending cleanup reason", async () => {
    const { app, store, objects, intent, read, advance } = await fixture();
    await store.registerUploadAuthorization({ ...read, expiresAt: "2026-09-15T00:00:02.000Z", reservedBytes: 50 * 1024 ** 2 });
    advance();
    const remove = vi.spyOn(objects, "deleteObject");
    const cancelled = await app.inject({ method: "DELETE", url: `${base}/media-upload-intents/${intent.id}`, headers });
    expect(cancelled.statusCode).toBe(202);
    expect(cancelled.json().uploadIntent).toMatchObject({ status: "cancelling", reason: "remote_upload_pending" });
    const storage = await app.inject({ method: "GET", url: `${base}/media-storage`, headers });
    expect(storage.json().storage.reservedBytes).toBe(50 * 1024 ** 2);
    expect(storage.json().cleanup).toEqual({ pendingCount: 1, heldForRemoteUploadCount: 1 });
    expect(MediaStorageResponseSchema.parse(storage.json()).storage.reservedBytes).toBe(50 * 1024 ** 2);
    expect(remove).not.toHaveBeenCalled();
  });

  it("requires a session and prevents deleting a finalized original", async () => {
    const { app, store, objects, intent, read, advance } = await fixture();
    expect((await app.inject({ method: "GET", url: `${base}/media-storage` })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: `${base}/media-storage?space=platform`, headers })).statusCode).toBe(400);
    await store.writeUpload(read, () => objects.putObject({ objectKey: intent.objectKey, contentType: input.contentType, body }));
    await store.finalizeUpload(read);
    advance();
    expect((await app.inject({ method: "DELETE", url: `${base}/media-upload-intents/${intent.id}`, headers })).statusCode).toBe(409);
    const result = await app.inject({ method: "GET", url: `${base}/media-storage`, headers });
    expect(result.json().storage).toMatchObject({ usedBytes: body.byteLength, reservedBytes: 0 });
    expect(await objects.headObject(intent.objectKey)).not.toBeNull();
  });
});
