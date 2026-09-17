import { describe, expect, it } from "vitest";

import {
  EntityCoverMediaInvalidError,
  EntityForbiddenError,
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


describe("organization Entity scope", () => {
  function organizationStore() {
    let id = 0;
    return new InMemoryEntityStore({ ...seed,
      workspaceMemberships: [{workspaceId, actorId: ownerId, role: "owner"}, {workspaceId, actorId: otherId, role: "member"}],
      organizationAssetPlacements: [{workspaceId, assetId: "asset-front"}],
    }, () => new Date("2026-09-17T00:00:00Z"), () => String(++id));
  }
  it("lets members create and read shared subjects while only managers edit", async () => {
    const store = organizationStore();
    const input = {workspaceId, actorId: otherId, space: "organization" as const, idempotencyKey: "organization-create", name: "Shared", mediaAssetIds: ["asset-front"]};
    const created = await store.createPersonalEntity(input);
    expect(created.space).toBe("organization");
    expect(await store.getPersonalEntity({workspaceId, actorId: ownerId, entityId: created.id, space: "organization"})).toEqual(created);
    expect(await store.listPersonalEntities({workspaceId, actorId: otherId})).toEqual([]);
    await expect(store.updatePersonalEntity({...input, entityId: created.id, expectedVersion: 1})).rejects.toBeInstanceOf(EntityForbiddenError);
    const updated = await store.updatePersonalEntity({...input, actorId: ownerId, entityId: created.id, expectedVersion: 1, name: "Revised"});
    expect(updated.version).toBe(2);
    await expect(store.updatePersonalEntity({...input, actorId: ownerId, entityId: created.id, expectedVersion: 1})).rejects.toBeInstanceOf(EntityVersionConflictError);
    store.connectLibraryMembership((_workspace, actor) => actor === ownerId ? "owner" : null);
    await expect(store.listPersonalEntities({workspaceId, actorId: otherId, space: "organization"})).rejects.toBeInstanceOf(EntityWorkspaceUnavailableError);
    expect(await store.getPersonalEntity({workspaceId, actorId: ownerId, entityId: created.id, space: "organization"})).toEqual(updated);
  });
  it("requires shared references and scoped tags, and keeps idempotency and tombstones scope-specific", async () => {
    const store = organizationStore();
    store.connectLibraryTags((_workspace, actor, tag, space) => space === "organization" ? tag === "org-tag" : actor === ownerId && tag === "personal-tag");
    const input = {workspaceId, actorId: ownerId, idempotencyKey: "same-key-two-scopes", name: "Shared", mediaAssetIds: ["asset-front"]};
    const personal = await store.createPersonalEntity({...input, tagIds: ["personal-tag"]});
    const sharedInput = {...input, space: "organization" as const, tagIds: ["org-tag"]};
    const shared = await store.createPersonalEntity(sharedInput);
    expect(shared.id).not.toBe(personal.id);
    await expect(store.createPersonalEntity(sharedInput)).resolves.toEqual(shared);
    await expect(store.createPersonalEntity({...sharedInput, idempotencyKey: "private-reference", mediaAssetIds: ["asset-voice"]})).rejects.toBeInstanceOf(EntityMediaUnavailableError);
    await expect(store.createPersonalEntity({...sharedInput, idempotencyKey: "private-tag", tagIds: ["personal-tag"]})).rejects.toMatchObject({code: "tag_not_found"});
    await expect(store.updatePersonalEntity({...sharedInput, entityId: shared.id, expectedVersion: 1, tagIds: [], expectedTagIds: []})).rejects.toMatchObject({code: "placement_changed"});
    store.removeLibraryPlacements(workspaceId, otherId, [shared.id], "organization");
    await expect(store.createPersonalEntity(sharedInput)).rejects.toMatchObject({reason: "idempotency_key_reused"});
    expect(await store.getPersonalEntity({workspaceId, actorId: ownerId, entityId: personal.id})).toEqual(personal);
  });
});
