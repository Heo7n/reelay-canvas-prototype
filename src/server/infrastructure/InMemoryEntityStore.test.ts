import { describe, expect, it } from "vitest";

import {
  EntityCoverMediaInvalidError,
  EntityMediaUnavailableError,
  EntityVersionConflictError,
  EntityWorkspaceUnavailableError,
} from "../application/EntityStore";
import { InMemoryEntityStore, type InMemoryEntityStoreSeed } from "./InMemoryEntityStore";

const workspaceId = "workspace-1";
const ownerId = "actor-owner";
const otherId = "actor-other";

const seed: InMemoryEntityStoreSeed = {
  workspaceMemberships: [ownerId, otherId].map((actorId) => ({ workspaceId, actorId })),
  assets: [
    { id: "asset-front", workspaceId, mediaKind: "image", finalized: true },
    { id: "asset-voice", workspaceId, mediaKind: "audio", finalized: true },
    { id: "asset-motion", workspaceId, mediaKind: "video", finalized: true },
    { id: "asset-other", workspaceId, mediaKind: "image", finalized: true },
    { id: "asset-pending", workspaceId, mediaKind: "video", finalized: false },
  ],
  personalAssetPlacements: [
    { workspaceId, assetId: "asset-front", ownerActorId: ownerId },
    { workspaceId, assetId: "asset-voice", ownerActorId: ownerId },
    { workspaceId, assetId: "asset-motion", ownerActorId: ownerId },
    { workspaceId, assetId: "asset-pending", ownerActorId: ownerId },
    { workspaceId, assetId: "asset-other", ownerActorId: otherId },
  ],
};

function createStore() {
  let nextId = 0;
  return new InMemoryEntityStore(
    seed,
    () => new Date("2026-09-01T00:00:00.000Z"),
    () => String(++nextId),
  );
}

describe("InMemoryEntityStore", () => {
  it("creates an idempotent personal Entity with ordered, deduplicated media references", async () => {
    const store = createStore();
    const input = {
      actorId: ownerId,
      workspaceId,
      idempotencyKey: "create-lirael-1",
      name: " 莉瑞尔 ",
      description: " 角色设定 ",
      mediaAssetIds: ["asset-front", "asset-voice", "asset-front"],
      coverMediaId: "asset-front",
    };
    const created = await store.createPersonalEntity(input);

    expect(created).toEqual(expect.objectContaining({
      id: "entity-1",
      name: "莉瑞尔",
      description: "角色设定",
      version: 1,
      coverMediaId: "asset-front",
      mediaRefs: [
        { mediaAssetId: "asset-front", order: 0 },
        { mediaAssetId: "asset-voice", order: 1 },
      ],
    }));
    await expect(store.createPersonalEntity(input)).resolves.toEqual(created);
    await expect(store.listPersonalEntities({ actorId: ownerId, workspaceId })).resolves.toEqual([created]);
    await expect(store.getPersonalEntity({ actorId: otherId, workspaceId, entityId: created.id }))
      .resolves.toBeNull();

    await expect(store.createPersonalEntity({ ...input, name: "另一个主体" }))
      .rejects.toMatchObject({ reason: "idempotency_key_reused" });
    await expect(store.createPersonalEntity({
      ...input,
      idempotencyKey: "create-video-cover",
      name: "视频封面主体",
      mediaAssetIds: ["asset-motion"],
      coverMediaId: "asset-motion",
    })).rejects.toBeInstanceOf(EntityCoverMediaInvalidError);
    await expect(store.listPersonalEntities({ actorId: ownerId, workspaceId })).resolves.toEqual([created]);
  });

  it("rejects non-finalized, foreign-personal, and inaccessible-workspace media atomically", async () => {
    const store = createStore();
    for (const mediaAssetId of ["asset-pending", "asset-other", "asset-missing"]) {
      await expect(store.createPersonalEntity({
        actorId: ownerId,
        workspaceId,
        idempotencyKey: `create-${mediaAssetId}`,
        name: "不可用主体",
        mediaAssetIds: [mediaAssetId],
      })).rejects.toBeInstanceOf(EntityMediaUnavailableError);
    }
    await expect(store.listPersonalEntities({ actorId: ownerId, workspaceId })).resolves.toEqual([]);
    await expect(store.createPersonalEntity({
      actorId: "actor-missing",
      workspaceId,
      idempotencyKey: "missing-member",
      name: "不可用主体",
      mediaAssetIds: ["asset-front"],
    })).rejects.toBeInstanceOf(EntityWorkspaceUnavailableError);
  });

  it("updates with optimistic versioning and leaves the previous record intact on failure", async () => {
    const store = createStore();
    const created = await store.createPersonalEntity({
      actorId: ownerId,
      workspaceId,
      idempotencyKey: "create-update-1",
      name: "莉瑞尔",
      mediaAssetIds: ["asset-front"],
      coverMediaId: "asset-front",
    });

    const updated = await store.updatePersonalEntity({
      actorId: ownerId,
      workspaceId,
      entityId: created.id,
      expectedVersion: 1,
      name: "莉瑞尔新版",
      description: "补充声音",
      mediaAssetIds: ["asset-voice", "asset-front"],
      coverMediaId: "asset-front",
    });
    expect(updated).toEqual(expect.objectContaining({
      version: 2,
      name: "莉瑞尔新版",
      coverMediaId: "asset-front",
    }));

    await expect(store.updatePersonalEntity({
      actorId: ownerId,
      workspaceId,
      entityId: created.id,
      expectedVersion: 2,
      name: "错误音频封面",
      mediaAssetIds: ["asset-voice", "asset-front"],
      coverMediaId: "asset-voice",
    })).rejects.toBeInstanceOf(EntityCoverMediaInvalidError);

    await expect(store.updatePersonalEntity({
      actorId: ownerId,
      workspaceId,
      entityId: created.id,
      expectedVersion: 2,
      name: "错误视频封面",
      mediaAssetIds: ["asset-motion", "asset-front"],
      coverMediaId: "asset-motion",
    })).rejects.toBeInstanceOf(EntityCoverMediaInvalidError);

    await expect(store.updatePersonalEntity({
      actorId: ownerId,
      workspaceId,
      entityId: created.id,
      expectedVersion: 1,
      name: "陈旧更新",
      mediaAssetIds: ["asset-front"],
    })).rejects.toBeInstanceOf(EntityVersionConflictError);
    await expect(store.updatePersonalEntity({
      actorId: ownerId,
      workspaceId,
      entityId: created.id,
      expectedVersion: 2,
      name: "错误素材更新",
      mediaAssetIds: ["asset-missing"],
    })).rejects.toBeInstanceOf(EntityMediaUnavailableError);
    await expect(store.getPersonalEntity({ actorId: ownerId, workspaceId, entityId: created.id }))
      .resolves.toEqual(updated);
  });
});
