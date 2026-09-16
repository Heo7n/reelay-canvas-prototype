import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { WorkspaceMediaAssetStore } from "../application/WorkspaceMediaAssetStore";
import type { ProjectAssetReferenceStore } from "../application/ProjectAssetReferenceStore";
import type { EntityStore } from "../application/EntityStore";
import { BUILTIN_LIBRARY_TAGS, type SaveLibraryInput, type UpdateLibraryTagsInput } from "../../domain/asset/media-library";

export interface LibraryTestFixture { store: WorkspaceMediaAssetStore & ProjectAssetReferenceStore; entities: EntityStore; workspaceId: string; projectId: string; otherProjectId: string; owner: string; editor: string; outsider: string; external: string }
let uploadNumber = 0;
async function upload(fixture: LibraryTestFixture, actorId = fixture.owner) {
  const { store,workspaceId } = fixture;
  const uploadKey=`library-test-${++uploadNumber}`;
  const checksumSha256=createHash("sha256").update(uploadKey).digest("hex");
  const intent=await store.createUploadIntent({ actorId,workspaceId,idempotencyKey:uploadKey,mediaKind:"image",displayName:"Source.png",contentType:"image/png",byteSize:12,checksumSha256 });
  await store.recordUpload({ actorId,workspaceId,uploadIntentId:intent.id,objectKey:intent.objectKey,contentType:"image/png",byteSize:12,checksumSha256,etag:checksumSha256 });
  return store.finalizeUpload({ actorId,workspaceId,uploadIntentId:intent.id });
}

export function verifyMediaLibraryTagDeletion(createFixture: () => Promise<LibraryTestFixture>) {
  describe("library tag deletion", () => {
    it("removes a custom label from mixed placements, preserving files, group content, folders and other labels", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, projectId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const first = await upload(fixture), second = await upload(fixture);
      const folder = await store.createLibraryFolder({ ...context, parentId: null, name: "Preserved" });
      const tag = await store.createLibraryTag({ ...context, name: "Delete me" });
      await store.saveLibrary({ ...context, projectId, folderId: folder.id, tagIds: [tag.id, "builtin:object"], items: [{ assetId: first.id, displayName: "Preserved.png", action: "move", expectedFolderId: null }] });
      const group = await entities.createPersonalEntity({ ...context, idempotencyKey: "delete-tag-group", name: "Group", description: "Preserved", mediaAssetIds: [first.id, second.id], coverMediaId: first.id });
      await store.updateLibraryTags({ ...context, operation: "add", tagIds: [tag.id, "builtin:character"], items: [{ kind: "entity", id: group.id }] });
      const before = await store.listLibrary(context);
      const request = { ...context, tagId: tag.id, expectedUsageCount: 2 };
      await expect(store.deleteLibraryTag({ ...request, expectedUsageCount: 1 })).rejects.toMatchObject({ code: "tag_usage_changed" });
      expect(await store.listLibrary(context)).toEqual(before);
      const after = await store.deleteLibraryTag(request);
      expect(after.tags).toEqual([]);
      expect(after.folders).toEqual(before.folders);
      expect(after.entries).toEqual(before.entries.map((entry) => ({ ...entry, tagIds: entry.tagIds.filter((id) => id !== tag.id) })));
      expect(after.entityEntries).toEqual([{ entityId: group.id, space: "personal", folderId: null, addedAt: group.createdAt, tagIds: ["builtin:character"] }]);
      await expect(entities.getPersonalEntity({ ...context, entityId: group.id })).resolves.toEqual({ ...group, libraryTagIds: ["builtin:character"] });
      await expect(store.getPersonalAsset({ ...context, assetId: first.id })).resolves.toMatchObject({ id: first.id, objectKey: first.objectKey, checksumSha256: first.checksumSha256, byteSize: first.byteSize, displayName: "Preserved.png" });
      await expect(store.deleteLibraryTag(request)).resolves.toEqual(after);
      await expect(store.deleteLibraryTag({ ...request, expectedUsageCount: 0 })).resolves.toEqual(after);
      await expect(store.updateLibraryTags({ ...context, operation: "add", tagIds: [tag.id], items: [{ kind: "media", id: first.id }] })).rejects.toMatchObject({ code: "tag_not_found" });
      const recreated = await store.createLibraryTag({ ...context, name: tag.name });
      expect(recreated.id).not.toBe(tag.id);
      expect((await store.listLibrary(context)).entries).toEqual(after.entries);
    });

    it("isolates personal owners and spaces and checks membership/manager permission before idempotency", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, projectId, owner, editor, external } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const own = await store.createLibraryTag({ ...context, name: "Same name" });
      const other = await store.createLibraryTag({ ...context, actorId: editor, name: "Same name" });
      const org = await store.createLibraryTag({ ...context, space: "organization", name: "Same name" });
      const asset = await upload(fixture);
      await store.saveLibrary({ ...context, projectId, space: "organization", folderId: null, tagIds: [org.id], items: [{ assetId: asset.id, displayName: "Shared", action: "add" }] });
      await store.updateLibraryTags({ ...context, operation: "add", tagIds: [own.id], items: [{ kind: "media", id: asset.id }] });
      const before = await store.listLibrary(context);
      await store.deleteLibraryTag({ ...context, tagId: other.id, expectedUsageCount: 0 });
      await store.deleteLibraryTag({ ...context, tagId: org.id, expectedUsageCount: 0 });
      expect(await store.listLibrary(context)).toEqual(before);
      expect((await store.listLibrary({ ...context, actorId: editor })).tags).toContainEqual(other);
      await expect(store.deleteLibraryTag({ ...context, actorId: external, tagId: "missing", expectedUsageCount: 0 })).rejects.toMatchObject({ name: "AssetWorkspaceUnavailableError" });
      for (const tagId of [org.id, "missing"]) await expect(store.deleteLibraryTag({ ...context, actorId: editor, space: "organization", tagId, expectedUsageCount: 1 })).rejects.toMatchObject({ code: "forbidden" });
      const after = await store.deleteLibraryTag({ ...context, space: "organization", tagId: org.id, expectedUsageCount: 1 });
      expect(after.entries.find((entry) => entry.space === "organization")?.tagIds).toEqual([]);
      expect(after.entries.find((entry) => entry.space === "personal")?.tagIds).toEqual([own.id]);
      expect(after.tags).toEqual([own]);
    });

    it("protects builtins, validates counts and deletes unused labels", async () => {
      const { store, workspaceId, owner } = await createFixture();
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const tag = await store.createLibraryTag({ ...context, name: "Unused" });
      for (const tagId of [...BUILTIN_LIBRARY_TAGS.map((value) => value.id), "builtin:sound"]) {
        await expect(store.deleteLibraryTag({ ...context, tagId, expectedUsageCount: 0 })).rejects.toMatchObject({ code: "preset_tag" });
      }
      for (const expectedUsageCount of [-1, 1.5, NaN]) await expect(store.deleteLibraryTag({ ...context, tagId: tag.id, expectedUsageCount })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(store.deleteLibraryTag({ ...context, tagId: tag.id, expectedUsageCount: 1 })).rejects.toMatchObject({ code: "tag_usage_changed" });
      expect((await store.deleteLibraryTag({ ...context, tagId: tag.id, expectedUsageCount: 0 })).tags).toEqual([]);
    });

    it("serializes deletion against new tag assignments without allowing orphan references", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, projectId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const asset = await upload(fixture);
      for (const throughSave of [false, true]) {
        const tag = await store.createLibraryTag({ ...context, name: `Concurrent ${throughSave}` });
        const add = () => throughSave
          ? store.saveLibrary({ ...context, projectId, folderId: null, tagIds: [tag.id], items: [{ assetId: asset.id, displayName: "Source.png", action: "move", expectedFolderId: null }] })
          : store.updateLibraryTags({ ...context, operation: "add", tagIds: [tag.id], items: [{ kind: "media", id: asset.id }] });
        const results = await Promise.allSettled([add(), store.deleteLibraryTag({ ...context, tagId: tag.id, expectedUsageCount: 0 })]);
        const catalog = await store.listLibrary(context);
        const present = catalog.tags.some((value) => value.id === tag.id);
        if (present) {
          expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "tag_usage_changed" } });
          expect(catalog.entries[0].tagIds).toContain(tag.id);
          await store.deleteLibraryTag({ ...context, tagId: tag.id, expectedUsageCount: 1 });
        } else {
          expect(results[0]).toMatchObject({ status: "rejected", reason: { code: "tag_not_found" } });
          expect(catalog.entries[0].tagIds).not.toContain(tag.id);
        }
      }
    });
  });
}

export function verifyMediaLibraryTagUpdates(createFixture: () => Promise<LibraryTestFixture>) {
  describe("library tag updates", () => {
    it("saves subject content and placement tags atomically, preserving members and allowing explicit clearing", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner, editor } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const asset = await upload(fixture);
      const custom = await store.createLibraryTag({ ...context, name: "Subject custom" });
      const foreign = await store.createLibraryTag({ ...context, actorId: editor, name: "Other owner" });
      const creation = { ...context, idempotencyKey: "subject-editor-with-tags", name: "Subject", mediaAssetIds: [asset.id], tagIds: [custom.id, "builtin:character", custom.id] };
      const created = await entities.createPersonalEntity(creation);
      const initialTags = ["builtin:character", custom.id].sort();
      expect(created.libraryTagIds).toEqual(initialTags);
      expect((await store.listLibrary(context)).entityEntries).toEqual([expect.objectContaining({ entityId: created.id, tagIds: initialTags })]);
      await expect(entities.createPersonalEntity(creation)).resolves.toEqual(created);
      await expect(entities.createPersonalEntity({ ...creation, tagIds: [] })).rejects.toMatchObject({ reason: "idempotency_key_reused" });
      const update = { ...context, entityId: created.id, expectedVersion: created.version, name: "Revised subject", mediaAssetIds: [asset.id], expectedTagIds: initialTags, tagIds: ["builtin:scene"] };
      await expect(entities.updatePersonalEntity({ ...update, tagIds: [foreign.id] })).rejects.toMatchObject({ code: "tag_not_found" });
      await expect(entities.updatePersonalEntity({ ...update, tagIds: ["builtin:sound"] })).rejects.toMatchObject({ code: "tag_not_found" });
      await expect(entities.updatePersonalEntity({ ...update, expectedTagIds: undefined })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(entities.getPersonalEntity({ ...context, entityId: created.id })).resolves.toEqual(created);
      const updated = await entities.updatePersonalEntity(update);
      expect(updated).toMatchObject({ name: "Revised subject", version: 2, libraryTagIds: ["builtin:scene"], mediaRefs: created.mediaRefs });
      const preserved = await entities.updatePersonalEntity({ ...update, expectedVersion: 2, tagIds: undefined, expectedTagIds: undefined });
      expect(preserved.libraryTagIds).toEqual(["builtin:scene"]);
      const cleared = await entities.updatePersonalEntity({ ...update, expectedVersion: 3, expectedTagIds: ["builtin:scene"], tagIds: [] });
      expect(cleared.libraryTagIds).toEqual([]);
      const catalog = await store.listLibrary(context);
      expect(catalog.entityEntries![0].tagIds).toEqual([]);
      expect(catalog.entries[0].tagIds).toEqual([]);
    });

    it("rejects a stale editor after independent tag changes without saving any subject content", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const asset = await upload(fixture);
      const creation = { ...context, idempotencyKey: "subject-editor-stale-tags", name: "Subject", mediaAssetIds: [asset.id], tagIds: ["builtin:character"] };
      const created = await entities.createPersonalEntity(creation);
      await store.updateLibraryTags({ ...context, operation: "add", tagIds: ["builtin:scene"], items: [{ kind: "entity", id: created.id }] });
      await expect(entities.updatePersonalEntity({ ...creation, entityId: created.id, expectedVersion: 1, expectedTagIds: ["builtin:character"], tagIds: [], name: "Must not save" })).rejects.toMatchObject({ code: "placement_changed" });
      const after = await entities.getPersonalEntity({ ...context, entityId: created.id });
      expect(after).toEqual({ ...created, libraryTagIds: ["builtin:character", "builtin:scene"] });
    });

    it("serializes subject saves with custom tag deletion so deleted dictionary entries cannot be revived", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const asset = await upload(fixture);
      const tag = await store.createLibraryTag({ ...context, name: "Racing subject tag" });
      const creation = { ...context, idempotencyKey: "subject-editor-tag-race", name: "Subject", mediaAssetIds: [asset.id], tagIds: [] };
      const created = await entities.createPersonalEntity(creation);
      const results = await Promise.allSettled([
        entities.updatePersonalEntity({ ...creation, entityId: created.id, expectedVersion: 1, expectedTagIds: [], tagIds: [tag.id] }),
        store.deleteLibraryTag({ ...context, tagId: tag.id, expectedUsageCount: 0 }),
      ]);
      const catalog = await store.listLibrary(context);
      if (catalog.tags.some((entry) => entry.id === tag.id)) {
        expect(results[0].status).toBe("fulfilled");
        expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "tag_usage_changed" } });
        expect(catalog.entityEntries![0].tagIds).toEqual([tag.id]);
      } else {
        expect(results[0]).toMatchObject({ status: "rejected", reason: { code: "tag_not_found" } });
        expect(catalog.entityEntries![0].tagIds).toEqual([]);
      }
    });

    it("updates mixed placements without changing group content, members, media metadata, folders or other tags", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, projectId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const first = await upload(fixture), second = await upload(fixture);
      const folder = await store.createLibraryFolder({ ...context, parentId: null, name: "Preserved folder" });
      await store.saveLibrary({ ...context, projectId, folderId: folder.id, tagIds: ["builtin:scene"], items: [{ assetId: first.id, displayName: "Preserved name", action: "move", expectedFolderId: null }] });
      const createGroup = { ...context, idempotencyKey: "tag-independent-group", name: "Group name", description: "Group description", mediaAssetIds: [first.id, second.id], coverMediaId: first.id };
      const group = await entities.createPersonalEntity(createGroup);
      const tag = await store.createLibraryTag({ ...context, name: "Custom" });
      const before = await store.listLibrary(context);
      const groupOnly = await store.updateLibraryTags({ ...context, operation: "add", tagIds: ["builtin:character"], items: [{ kind: "entity", id: group.id }] });
      expect(groupOnly.entries).toEqual(before.entries);
      const request: UpdateLibraryTagsInput & { actorId: string } = { ...context, operation: "add", tagIds: [tag.id, tag.id], items: [{ kind: "media", id: first.id }, { kind: "entity", id: group.id }] };
      const updated = await store.updateLibraryTags(request);
      expect(updated.folders).toEqual(before.folders);
      expect(updated.tags).toEqual(before.tags);
      expect(updated.entries.find((entry) => entry.assetId === first.id)).toEqual({ ...before.entries.find((entry) => entry.assetId === first.id), tagIds: ["builtin:scene", tag.id].sort() });
      expect(updated.entries.find((entry) => entry.assetId === second.id)).toEqual(before.entries.find((entry) => entry.assetId === second.id));
      expect(updated.entityEntries).toEqual([{ entityId: group.id, space: "personal", folderId: null, addedAt: group.createdAt, tagIds: ["builtin:character", tag.id].sort() }]);
      await expect(store.updateLibraryTags(request)).resolves.toEqual(updated);
      await expect(entities.getPersonalEntity({ ...context, entityId: group.id })).resolves.toEqual({ ...group, libraryTagIds: ["builtin:character", tag.id].sort() });
      await expect(entities.createPersonalEntity(createGroup)).resolves.toEqual({ ...group, libraryTagIds: ["builtin:character", tag.id].sort() });
      expect((await store.listLibrary(context)).entityEntries).toEqual(updated.entityEntries);
      await expect(store.getPersonalAsset({ ...context, assetId: second.id })).resolves.toEqual(second);
      const removal = { ...request, operation: "remove" as const };
      const removed = await store.updateLibraryTags(removal);
      expect(removed.entries).toEqual(before.entries);
      expect(removed.entityEntries).toEqual(groupOnly.entityEntries);
      await expect(store.updateLibraryTags(removal)).resolves.toEqual(removed);
    });

    it("isolates owners and tag namespaces while only managers may organize shared placements", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, projectId, owner, editor, external } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const own = await upload(fixture), other = await upload(fixture, editor);
      const group = await entities.createPersonalEntity({ ...context, idempotencyKey: "private-tag-group", name: "Private", description: "", mediaAssetIds: [own.id], coverMediaId: own.id });
      const personalTag = await store.createLibraryTag({ ...context, name: "Shared spelling" });
      const orgTag = await store.createLibraryTag({ ...context, space: "organization", name: "Shared spelling" });
      const otherTag = await store.createLibraryTag({ ...context, actorId: editor, name: "Shared spelling" });
      expect(new Set([personalTag.id, orgTag.id, otherTag.id]).size).toBe(3);
      await store.saveLibrary({ ...context, projectId, space: "organization", folderId: null, tagIds: [], items: [{ assetId: own.id, displayName: "Shared name", action: "add" }] });
      const before = await store.listLibrary(context);
      const request: UpdateLibraryTagsInput & { actorId: string } = { ...context, operation: "add", tagIds: [personalTag.id], items: [{ kind: "media", id: own.id }] };
      await expect(store.updateLibraryTags({ ...request, tagIds: [orgTag.id] })).rejects.toMatchObject({ code: "tag_not_found" });
      await expect(store.updateLibraryTags({ ...request, tagIds: [otherTag.id] })).rejects.toMatchObject({ code: "tag_not_found" });
      await expect(store.updateLibraryTags({ ...request, items: [{ kind: "media", id: other.id }] })).rejects.toMatchObject({ code: "library_item_not_found" });
      await expect(store.updateLibraryTags({ ...request, actorId: editor, tagIds: ["builtin:scene"], items: [{ kind: "entity", id: group.id }] })).rejects.toMatchObject({ code: "library_item_not_found" });
      await expect(store.updateLibraryTags({ ...request, actorId: external })).rejects.toMatchObject({ name: "AssetWorkspaceUnavailableError" });
      await expect(store.updateLibraryTags({ ...request, actorId: editor, space: "organization", tagIds: [orgTag.id] })).rejects.toMatchObject({ code: "forbidden" });
      await expect(store.updateLibraryTags({ ...request, space: "organization", tagIds: [orgTag.id], items: [{ kind: "entity", id: group.id }] })).rejects.toMatchObject({ code: "unsupported" });
      expect(await store.listLibrary(context)).toEqual(before);
      const updated = await store.updateLibraryTags({ ...request, space: "organization", tagIds: [orgTag.id] });
      expect(updated.entries.filter((entry) => entry.space === "personal")).toEqual(before.entries.filter((entry) => entry.space === "personal"));
      expect(updated.entries.find((entry) => entry.space === "organization")?.tagIds).toEqual([orgTag.id]);
      expect((await store.listLibrary({ ...context, actorId: editor })).entityEntries).toEqual([]);
    });

    it("rejects missing, deleted, wrong-kind and invalid targets atomically", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const asset = await upload(fixture);
      const group = await entities.createPersonalEntity({ ...context, idempotencyKey: "deleted-tag-group", name: "Deleted", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id });
      await store.deleteLibrary({ ...context, items: [{ kind: "entity", id: group.id, expectedVersion: group.version }] });
      const before = await store.listLibrary(context);
      const request: UpdateLibraryTagsInput & { actorId: string } = { ...context, operation: "add", tagIds: ["builtin:object"], items: [{ kind: "media", id: asset.id }] };
      for (const target of [{ kind: "entity" as const, id: group.id }, { kind: "entity" as const, id: asset.id }, { kind: "media" as const, id: "missing" }]) {
        await expect(store.updateLibraryTags({ ...request, items: [...request.items, target] })).rejects.toMatchObject({ code: "library_item_not_found" });
        expect(await store.listLibrary(context)).toEqual(before);
      }
      await expect(store.updateLibraryTags({ ...request, items: [...request.items, ...request.items] })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(store.updateLibraryTags({ ...request, tagIds: [] })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(store.updateLibraryTags({ ...request, operation: "remove", tagIds: ["unknown"] })).rejects.toMatchObject({ code: "tag_not_found" });
      await store.deleteLibrary({ ...context, items: [{ kind: "media", id: asset.id }] });
      await expect(store.updateLibraryTags(request)).rejects.toMatchObject({ code: "library_item_not_found" });
      expect((await store.listLibrary(context)).entries).toEqual([]);
    });

    it("composes concurrent deltas on media and groups without replacing unselected labels", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      const asset = await upload(fixture);
      const group = await entities.createPersonalEntity({ ...context, idempotencyKey: "concurrent-tag-group", name: "Original", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id });
      const items: UpdateLibraryTagsInput["items"] = [{ kind: "media", id: asset.id }, { kind: "entity", id: group.id }];
      await Promise.all(["builtin:character", "builtin:scene"].map((tag) => store.updateLibraryTags({ ...context, operation: "add", tagIds: [tag], items })));
      let catalog = await store.listLibrary(context);
      expect(catalog.entries[0].tagIds).toEqual(["builtin:character", "builtin:scene"]);
      expect(catalog.entityEntries?.[0].tagIds).toEqual(["builtin:character", "builtin:scene"]);
      await Promise.all([
        store.updateLibraryTags({ ...context, operation: "add", tagIds: ["builtin:object"], items }),
        store.updateLibraryTags({ ...context, operation: "remove", tagIds: ["builtin:character"], items }),
        entities.updatePersonalEntity({ ...context, entityId: group.id, expectedVersion: group.version, name: "Edited group", description: "Still independent", mediaAssetIds: [asset.id], coverMediaId: asset.id }),
      ]);
      catalog = await store.listLibrary(context);
      expect(catalog.entries[0].tagIds).toEqual(["builtin:object", "builtin:scene"]);
      expect(catalog.entityEntries?.[0].tagIds).toEqual(["builtin:object", "builtin:scene"]);
      expect(await entities.getPersonalEntity({ ...context, entityId: group.id })).toMatchObject({ name: "Edited group", version: 2 });
    });

    it("keeps only three defaults and permits ordinary scoped sound and Others labels", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, owner } = fixture;
      const context = { workspaceId, actorId: owner, space: "personal" as const };
      expect(BUILTIN_LIBRARY_TAGS.map((tag) => tag.id)).toEqual(["builtin:character", "builtin:scene", "builtin:object"]);
      const sound = await store.createLibraryTag({ ...context, name: "音效" });
      const others = await store.createLibraryTag({ ...context, name: "Others" });
      expect(sound.id.startsWith("builtin:")).toBe(false);
      const asset = await upload(fixture);
      const request: UpdateLibraryTagsInput & { actorId: string } = { ...context, operation: "add", tagIds: [sound.id, others.id], items: [{ kind: "media", id: asset.id }] };
      const catalog = await store.updateLibraryTags(request);
      expect(catalog.entries[0].tagIds).toEqual([sound.id, others.id].sort());
      await expect(store.updateLibraryTags({ ...request, tagIds: ["builtin:sound"] })).rejects.toMatchObject({ code: "tag_not_found" });
      expect(await store.listLibrary(context)).toEqual(catalog);
    });
  });
}
export function verifyMediaLibraryStore(createFixture: () => Promise<LibraryTestFixture>) {
  describe("media library contract", () => {
    it("keeps five-level directories and custom dictionaries scoped and handles concurrent duplicates", async () => {
      const { store,workspaceId,owner,editor,external }=await createFixture();
      const context={ actorId:owner,workspaceId,space:"personal" as const };
      let parentId: string | null=null;
      for (let depth=1;depth<=4;depth+=1) parentId=(await store.createLibraryFolder({ ...context,parentId,name:`Folder ${depth}` })).id;
      await expect(store.createLibraryFolder({ ...context,parentId,name:"Too deep" })).rejects.toMatchObject({ code:"folder_depth_exceeded" });
      await expect(store.createLibraryFolder({ ...context,parentId:null,name:" folder 1 " })).rejects.toMatchObject({ code:"folder_name_conflict" });
      await expect(store.createLibraryFolder({ ...context,actorId:editor,parentId,name:"Private child" })).rejects.toMatchObject({ code:"folder_not_found" });
      await expect(store.createLibraryFolder({ ...context,actorId:external,parentId:null,name:"No membership" })).rejects.toMatchObject({ name:"AssetWorkspaceUnavailableError" });
      const simultaneous=await Promise.allSettled([1,2].map(() => store.createLibraryFolder({ ...context,parentId:null,name:"Concurrent" })));
      expect(simultaneous.filter((result) => result.status==="fulfilled")).toHaveLength(1);
      const personal=await store.createLibraryTag({ ...context,name:"私人标签" });
      const tags=await Promise.all(["组织标签"," 组织标签 "].map((name) => store.createLibraryTag({ ...context,space:"organization",name })));
      expect(tags[0].id).toBe(tags[1].id);
      expect((await store.createLibraryTag({ ...context,name:"角色" })).id).toBe("builtin:character");
      const other=await store.listLibrary({ actorId:editor,workspaceId });
      expect(other.tags.some((tag) => tag.id===personal.id)).toBe(false);
      expect(other.tags.some((tag) => tag.id===tags[0].id)).toBe(true);
      expect(other.folders).toHaveLength(0);
    });
    it("requires explicit moves, preserves source metadata, and repeats a completed move safely", async () => {
      const fixture=await createFixture();
      const { store,workspaceId,projectId,owner,editor }=fixture;
      const asset=await upload(fixture);
      const reference=await store.attachAssetToProject({ actorId:owner,projectId,assetId:asset.id });
      const folder=await store.createLibraryFolder({ actorId:owner,workspaceId,space:"personal",parentId:null,name:"人物" });
      const request: SaveLibraryInput & { actorId:string }={ actorId:owner,workspaceId,projectId,space:"personal",folderId:folder.id,tagIds:["builtin:character"],items:[{ assetId:asset.id,displayName:"Library name",action:"save" }] };
      await expect(store.saveLibrary(request)).rejects.toMatchObject({ code:"explicit_move_required" });
      const move={ ...request,items:[{ ...request.items[0],action:"move" as const,expectedFolderId:null }] };
      const saved=await store.saveLibrary(move);
      expect(saved.entries.filter((entry) => entry.assetId===asset.id)).toHaveLength(1);
      expect(saved.entries.find((entry) => entry.assetId===asset.id)).toMatchObject({ folderId:folder.id,displayName:"Library name",tagIds:["builtin:character"] });
      await expect(store.saveLibrary(move)).resolves.toEqual(saved);
      await expect(store.saveLibrary({ ...move,folderId:null })).rejects.toMatchObject({ code:"placement_changed" });
      await expect(store.getProjectAsset({ actorId:editor,projectId,referenceId:reference.id })).resolves.toMatchObject({ asset:{ displayName:"Source.png",objectVersion:1 } });
      await expect(store.renamePersonalAsset({ actorId:owner,workspaceId,assetId:asset.id,displayName:"Personal renamed" })).resolves.toMatchObject({ displayName:"Personal renamed" });
      await expect(store.getProjectAsset({ actorId:editor,projectId,referenceId:reference.id })).resolves.toMatchObject({ asset:{ displayName:"Source.png" } });
    });
    it("shares organization placements without leaking personal content or names and supports org references", async () => {
      const fixture=await createFixture();
      const { store,workspaceId,projectId,owner,editor,outsider,external }=fixture;
      const asset=await upload(fixture);
      await expect(store.getLibraryAsset({ actorId:outsider,workspaceId,assetId:asset.id })).resolves.toBeNull();
      const personalTag=await store.createLibraryTag({ actorId:owner,workspaceId,space:"personal",name:"Private" });
      const request: SaveLibraryInput & { actorId:string }={ actorId:owner,workspaceId,projectId,space:"organization",folderId:null,tagIds:[],items:[{ assetId:asset.id,displayName:"Organization title",action:"save" }] };
      await expect(store.saveLibrary({ ...request,tagIds:[personalTag.id] })).rejects.toMatchObject({ code:"tag_not_found" });
      await store.saveLibrary(request);
      const read=await store.listLibrary({ actorId:outsider,workspaceId });
      expect(read.entries.filter((entry) => entry.assetId===asset.id)).toEqual([expect.objectContaining({ space:"organization",displayName:"Organization title" })]);
      await expect(store.getLibraryAsset({ actorId:outsider,workspaceId,assetId:asset.id })).resolves.toMatchObject({ id:asset.id });
      await expect(store.getPersonalAsset({ actorId:outsider,workspaceId,assetId:asset.id })).resolves.toBeNull();
      await expect(store.getPersonalAsset({ actorId:owner,workspaceId,assetId:asset.id })).resolves.toMatchObject({ displayName:"Source.png" });
      await expect(store.attachAssetToProject({ actorId:editor,projectId,assetId:asset.id })).resolves.toMatchObject({ assetId:asset.id });
      await expect(store.attachAssetToProject({ actorId:external,projectId,assetId:asset.id })).rejects.toMatchObject({ name:"ProjectAssetUnavailableError" });
      await store.renamePersonalAsset({ actorId:owner,workspaceId,assetId:asset.id,displayName:"Private title" });
      expect((await store.listLibrary({ actorId:outsider,workspaceId })).entries.find((entry) => entry.assetId===asset.id)?.displayName).toBe("Organization title");
    });
    it("authorizes the exact project reference, checks workspace membership independently, and rolls back failed batches", async () => {
      const fixture=await createFixture();
      const { store,workspaceId,projectId,otherProjectId,owner,editor,external }=fixture;
      const own=await upload(fixture,editor);
      const privateAsset=await upload(fixture);
      const request: SaveLibraryInput & { actorId:string }={ actorId:editor,workspaceId,projectId,space:"organization",folderId:null,tagIds:[],items:[{ assetId:own.id,displayName:"Own",action:"save" },{ assetId:privateAsset.id,displayName:"Private",action:"save" }] };
      await expect(store.saveLibrary(request)).rejects.toMatchObject({ name:"PersonalAssetUnavailableError" });
      expect((await store.listLibrary({ actorId:editor,workspaceId })).entries.some((entry) => entry.space==="organization")).toBe(false);
      await store.attachAssetToProject({ actorId:owner,projectId,assetId:privateAsset.id });
      await expect(store.saveLibrary({ ...request,projectId:otherProjectId })).rejects.toMatchObject({ name:"PersonalAssetUnavailableError" });
      await expect(store.saveLibrary({ ...request,actorId:external })).rejects.toMatchObject({ name:"AssetWorkspaceUnavailableError" });
      const saved=await store.saveLibrary(request);
      expect(saved.entries.filter((entry) => entry.space==="organization")).toHaveLength(2);
      expect((await store.listLibrary({ actorId:owner,workspaceId })).entries.find((entry) => entry.assetId===privateAsset.id && entry.space==="personal")?.displayName).toBe("Source.png");
    });
    it("adds only missing destination entries and preserves existing metadata on changed retries", async () => {
      const fixture=await createFixture();
      const { store,workspaceId,projectId,owner }=fixture;
      const existing=await upload(fixture);
      const incoming=await upload(fixture);
      const context={ actorId:owner,workspaceId,space:"organization" as const };
      const originalFolder=await store.createLibraryFolder({ ...context,parentId:null,name:"Original" });
      const targetFolder=await store.createLibraryFolder({ ...context,parentId:null,name:"Incoming" });
      const originalTag=await store.createLibraryTag({ ...context,name:"Original tag" });
      const request: SaveLibraryInput & { actorId:string }={ ...context,projectId,folderId:originalFolder.id,tagIds:[originalTag.id],
        items:[{ assetId:existing.id,displayName:"Original name",action:"save" }] };
      const before=await store.saveLibrary(request);
      const addition={ ...request,folderId:targetFolder.id,tagIds:["builtin:scene"],items:[
        { assetId:existing.id,displayName:"Ignored name",action:"add" as const },
        { assetId:incoming.id,displayName:"New name",action:"add" as const },
      ] };
      const saved=await store.saveLibrary(addition);
      expect(saved.entries.find((entry) => entry.space==="organization" && entry.assetId===existing.id))
        .toEqual(before.entries.find((entry) => entry.space==="organization" && entry.assetId===existing.id));
      expect(saved.entries.find((entry) => entry.space==="organization" && entry.assetId===incoming.id))
        .toMatchObject({ folderId:targetFolder.id,displayName:"New name",tagIds:["builtin:scene"] });
      expect(saved.entries.filter((entry) => entry.space==="personal")).toEqual(before.entries.filter((entry) => entry.space==="personal"));
      await expect(store.saveLibrary({ ...addition,folderId:null,tagIds:[],items:addition.items.map((item) => ({ ...item,displayName:"Retry name" })) }))
        .resolves.toEqual(saved);
      // A personal placement already created by upload is equally protected by insert-only saves.
      await expect(store.saveLibrary({ ...addition,space:"personal",folderId:null,tagIds:[] })).resolves.toEqual(saved);
    });
    it("still authorizes all add items and rejects failed batches without partial additions", async () => {
      const fixture=await createFixture();
      const { store,workspaceId,projectId,otherProjectId,owner,editor,outsider,external }=fixture;
      const existing=await upload(fixture,editor);
      const incoming=await upload(fixture,editor);
      const privateAsset=await upload(fixture);
      const context={ actorId:editor,workspaceId,projectId,space:"organization" as const,folderId:null,tagIds:[] };
      await store.saveLibrary({ ...context,items:[{ assetId:existing.id,displayName:"Already shared",action:"add" }] });
      const before=await store.listLibrary({ actorId:editor,workspaceId });
      const request: SaveLibraryInput & { actorId:string }={ ...context,items:[
        { assetId:existing.id,displayName:"Ignored",action:"add" },
        { assetId:incoming.id,displayName:"Incoming",action:"add" },
        { assetId:privateAsset.id,displayName:"Private",action:"add" },
      ] };
      await expect(store.saveLibrary(request)).rejects.toMatchObject({ name:"PersonalAssetUnavailableError" });
      expect(await store.listLibrary({ actorId:editor,workspaceId })).toEqual(before);
      const onlyExisting={ ...request,items:[request.items[0]!] };
      await expect(store.saveLibrary({ ...onlyExisting,actorId:outsider })).rejects.toMatchObject({ name:"ProjectAssetUnavailableError" });
      await expect(store.saveLibrary({ ...onlyExisting,actorId:external })).rejects.toMatchObject({ name:"AssetWorkspaceUnavailableError" });
      await store.attachAssetToProject({ actorId:owner,projectId,assetId:privateAsset.id });
      await expect(store.saveLibrary({ ...request,projectId:otherProjectId })).rejects.toMatchObject({ name:"PersonalAssetUnavailableError" });
      expect(await store.listLibrary({ actorId:editor,workspaceId })).toEqual(before);
      expect((await store.saveLibrary(request)).entries.filter((entry) => entry.space==="organization")).toHaveLength(3);
    });
    it("serializes concurrent adds without letting the later request overwrite the first placement", async () => {
      const fixture=await createFixture();
      const { store,workspaceId,projectId,owner }=fixture;
      const asset=await upload(fixture);
      const context={ actorId:owner,workspaceId,projectId,space:"organization" as const };
      const folder=await store.createLibraryFolder({ ...context,parentId:null,name:"Concurrent target" });
      const outcomes=await Promise.all([
        store.saveLibrary({ ...context,folderId:null,tagIds:["builtin:character"],items:[{ assetId:asset.id,displayName:"First contender",action:"add" }] }),
        store.saveLibrary({ ...context,folderId:folder.id,tagIds:["builtin:scene"],items:[{ assetId:asset.id,displayName:"Second contender",action:"add" }] }),
      ]);
      const placements=outcomes.map((catalog) => catalog.entries.filter((entry) => entry.space==="organization" && entry.assetId===asset.id));
      expect(placements[0]).toHaveLength(1);
      expect(placements[1]).toEqual(placements[0]);
      expect((await store.listLibrary(context)).entries.filter((entry) => entry.space==="organization" && entry.assetId===asset.id)).toEqual(placements[0]);
    });
    it("serializes concurrent conflicting moves and catalog saves without duplicate placements", async () => {
      const fixture=await createFixture();
      const { store,workspaceId,projectId,owner }=fixture;
      const asset=await upload(fixture);
      const base={ actorId:owner,workspaceId,space:"personal" as const,parentId:null };
      const left=await store.createLibraryFolder({ ...base,name:"Left" });
      const right=await store.createLibraryFolder({ ...base,name:"Right" });
      const outcomes=await Promise.allSettled([left,right].map((folder) => store.saveLibrary({ actorId:owner,workspaceId,projectId,space:"personal",folderId:folder.id,tagIds:[],items:[{ assetId:asset.id,displayName:"Moved",action:"move",expectedFolderId:null }] })));
      expect(outcomes.filter((outcome) => outcome.status==="fulfilled")).toHaveLength(1);
      const org: SaveLibraryInput & { actorId:string }={ actorId:owner,workspaceId,projectId,space:"organization",folderId:null,tagIds:[],items:[{ assetId:asset.id,displayName:"Shared",action:"save" }] };
      await Promise.all([store.saveLibrary(org),store.saveLibrary(org)]);
      expect((await store.listLibrary({ actorId:owner,workspaceId })).entries.filter((entry) => entry.assetId===asset.id)).toHaveLength(2);
    });
  });
}

export function verifyMediaLibraryDeletion(createFixture: () => Promise<LibraryTestFixture>) {
  describe("library deletion contract", () => {
    it("deletes an entire folder subtree only in the selected space while keeping project references and source bytes", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, projectId, owner } = fixture;
      const context = { actorId: owner, workspaceId };
      const asset = await upload(fixture);
      const reference = await store.attachAssetToProject({ actorId: owner, projectId, assetId: asset.id });
      const parent = await store.createLibraryFolder({ ...context, space: "personal", parentId: null, name: "Parent" });
      const child = await store.createLibraryFolder({ ...context, space: "personal", parentId: parent.id, name: "Child" });
      const sibling = await store.createLibraryFolder({ ...context, space: "personal", parentId: null, name: "Keep" });
      await store.saveLibrary({ ...context, projectId, space: "personal", folderId: child.id, tagIds: [], items: [{ assetId: asset.id, displayName: "Personal", action: "move", expectedFolderId: null }] });
      await store.saveLibrary({ ...context, projectId, space: "organization", folderId: null, tagIds: [], items: [{ assetId: asset.id, displayName: "Shared", action: "add" }] });
      const request = { ...context, space: "personal" as const, items: [{ kind: "folder" as const, id: parent.id }, { kind: "media" as const, id: asset.id }] };
      const result = await store.deleteLibrary(request);
      expect(result.folders.map((folder) => folder.id)).toEqual([sibling.id]);
      expect(result.entries).toEqual([expect.objectContaining({ assetId: asset.id, space: "organization", displayName: "Shared" })]);
      await expect(store.deleteLibrary(request)).resolves.toEqual(result);
      await expect(store.getPersonalAsset({ ...context, assetId: asset.id })).resolves.toBeNull();
      await expect(store.getProjectAsset({ actorId: owner, projectId, referenceId: reference.id })).resolves.toMatchObject({ asset: { id: asset.id, objectKey: asset.objectKey } });
    });

    it("checks current membership and admin rights before any organization deletion", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, projectId, owner, editor, external } = fixture;
      const asset = await upload(fixture);
      const context = { actorId: owner, workspaceId };
      const folder = await store.createLibraryFolder({ ...context, space: "organization", parentId: null, name: "Shared" });
      await store.saveLibrary({ ...context, projectId, space: "organization", folderId: folder.id, tagIds: [], items: [{ assetId: asset.id, displayName: "Shared", action: "add" }] });
      const before = await store.listLibrary(context);
      const request = { workspaceId, space: "organization" as const, items: [{ kind: "folder" as const, id: folder.id }] };
      await expect(store.deleteLibrary({ ...request, actorId: editor })).rejects.toMatchObject({ code: "forbidden" });
      await expect(store.deleteLibrary({ ...request, actorId: external })).rejects.toMatchObject({ name: "AssetWorkspaceUnavailableError" });
      expect(await store.listLibrary(context)).toEqual(before);
      const after = await store.deleteLibrary({ ...request, actorId: owner });
      expect(after.entries).toHaveLength(1);
      expect(after.entries[0].space).toBe("personal");
      await expect(store.deleteLibrary({ ...context, space: "organization", items: [{ kind: "entity", id: "unsupported", expectedVersion: 1 }] })).rejects.toMatchObject({ code: "unsupported" });
    });

    it("does not expose or delete another member's personal placement or folders", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, owner, editor } = fixture;
      const asset = await upload(fixture);
      const folder = await store.createLibraryFolder({ actorId: owner, workspaceId, space: "personal", parentId: null, name: "Private" });
      const before = await store.listLibrary({ actorId: owner, workspaceId });
      await store.deleteLibrary({ actorId: editor, workspaceId, space: "personal", items: [{ kind: "folder", id: folder.id }, { kind: "media", id: asset.id }] });
      expect(await store.listLibrary({ actorId: owner, workspaceId })).toEqual(before);
    });

    it("prevents removing media used by surviving groups and keeps the entire failed batch intact", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, projectId, owner } = fixture;
      const context = { actorId: owner, workspaceId };
      const first = await upload(fixture), second = await upload(fixture);
      const folder = await store.createLibraryFolder({ ...context, space: "personal", parentId: null, name: "Grouped" });
      await store.saveLibrary({ ...context, projectId, space: "personal", folderId: folder.id, tagIds: [], items: [first, second].map((asset) => ({ assetId: asset.id, displayName: asset.displayName, action: "move" as const, expectedFolderId: null })) });
      const group = await entities.createPersonalEntity({ ...context, idempotencyKey: "group-delete", name: "Group", description: "", mediaAssetIds: [first.id], coverMediaId: first.id });
      const before = await store.listLibrary(context);
      await expect(store.deleteLibrary({ ...context, space: "personal", items: [{ kind: "media", id: second.id }, { kind: "folder", id: folder.id }] })).rejects.toMatchObject({ code: "library_item_in_use" });
      await expect(store.deleteLibrary({ ...context, space: "personal", items: [{ kind: "media", id: second.id }, { kind: "entity", id: group.id, expectedVersion: group.version + 1 }] })).rejects.toMatchObject({ code: "entity_changed" });
      expect(await store.listLibrary(context)).toEqual(before);
      await store.deleteLibrary({ ...context, space: "personal", items: [{ kind: "entity", id: group.id, expectedVersion: group.version }] });
      expect(await entities.listPersonalEntities(context)).toEqual([]);
      expect(await store.listLibrary(context)).toEqual({ ...before, entityEntries: [] });
      await expect(entities.createPersonalEntity({ ...context, idempotencyKey: "group-delete", name: "Group", description: "", mediaAssetIds: [first.id], coverMediaId: first.id })).rejects.toMatchObject({ name: "EntityCreateConflictError" });
      await store.deleteLibrary({ ...context, space: "personal", items: [{ kind: "folder", id: folder.id }] });
      expect((await store.listLibrary(context)).entries).toEqual([]);
    });

    it("can atomically delete groups and their selected media and does not let saved source IDs bypass access", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, projectId, owner } = fixture;
      const context = { actorId: owner, workspaceId };
      const asset = await upload(fixture);
      const group = await entities.createPersonalEntity({ ...context, idempotencyKey: "combined-delete", name: "Group", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id });
      const request = { ...context, space: "personal" as const, items: [{ kind: "entity" as const, id: group.id, expectedVersion: group.version }, { kind: "media" as const, id: asset.id }] };
      const after = await store.deleteLibrary(request);
      expect(after.entries).toEqual([]);
      expect(await entities.listPersonalEntities(context)).toEqual([]);
      await expect(store.deleteLibrary(request)).resolves.toEqual(after);
      await expect(store.saveLibrary({ ...context, projectId, space: "personal", folderId: null, tagIds: [], items: [{ assetId: asset.id, displayName: "Hidden", action: "add" }] })).rejects.toMatchObject({ name: "PersonalAssetUnavailableError" });
    });
  });
}

export function verifyMediaLibraryFolderRename(createFixture: () => Promise<LibraryTestFixture>) {
  describe("library folder rename contract", () => {
    it("renames in place with stable descendants and material locations, including idempotent retry", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, projectId, owner } = fixture;
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const parent = await store.createLibraryFolder({ ...context, parentId: null, name: "Original" });
      const child = await store.createLibraryFolder({ ...context, parentId: parent.id, name: "Child" });
      const asset = await upload(fixture);
      await store.saveLibrary({ ...context, projectId, folderId: parent.id, tagIds: ["builtin:object"], items: [{ assetId: asset.id, displayName: "Material", action: "move", expectedFolderId: null }] });
      const before = await store.listLibrary(context);
      const request = { ...context, folderId: parent.id, name: "  Ｎｅｗ  ", expectedName: "Original" };
      const renamed = await store.renameLibraryFolder(request);
      expect(renamed).toEqual({ ...parent, name: "New" });
      expect(await store.renameLibraryFolder(request)).toEqual(renamed);
      const after = await store.listLibrary(context);
      expect(after.entries).toEqual(before.entries);
      expect(after.folders.find((folder) => folder.id === child.id)).toEqual(child);
      expect(after.folders.find((folder) => folder.id === parent.id)).toEqual(renamed);
    });

    it("rejects stale edits, same-level normalized name conflicts, and nonexistent roots without changing the tree", async () => {
      const { store, workspaceId, owner } = await createFixture();
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const original = await store.createLibraryFolder({ ...context, parentId: null, name: "Original" });
      await store.createLibraryFolder({ ...context, parentId: null, name: "Sibling" });
      const request = { ...context, folderId: original.id, name: "New", expectedName: original.name };
      await store.renameLibraryFolder(request);
      const before = await store.listLibrary(context);
      await expect(store.renameLibraryFolder({ ...request, name: "Third" })).rejects.toMatchObject({ code: "folder_changed" });
      await expect(store.renameLibraryFolder({ ...request, name: " ＳＩＢＬＩＮＧ ", expectedName: "New" })).rejects.toMatchObject({ code: "folder_name_conflict" });
      await expect(store.renameLibraryFolder({ ...request, name: "  " })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(store.renameLibraryFolder({ ...request, folderId: "" })).rejects.toMatchObject({ code: "invalid_request" });
      await expect(store.renameLibraryFolder({ ...request, folderId: "default-root" })).rejects.toMatchObject({ code: "folder_not_found" });
      expect(await store.listLibrary(context)).toEqual(before);
    });

    it("keeps personal folders private and limits shared folder renaming to organization managers", async () => {
      const { store, workspaceId, owner, editor, external } = await createFixture();
      const personal = await store.createLibraryFolder({ actorId: owner, workspaceId, space: "personal", parentId: null, name: "Private" });
      const organization = await store.createLibraryFolder({ actorId: owner, workspaceId, space: "organization", parentId: null, name: "Shared" });
      const before = await store.listLibrary({ workspaceId, actorId: owner });
      await expect(store.renameLibraryFolder({ actorId: editor, workspaceId, space: "personal", folderId: personal.id, expectedName: personal.name, name: "Intrusion" })).rejects.toMatchObject({ code: "folder_not_found" });
      await expect(store.renameLibraryFolder({ actorId: owner, workspaceId, space: "personal", folderId: organization.id, expectedName: organization.name, name: "Wrong space" })).rejects.toMatchObject({ code: "folder_not_found" });
      await expect(store.renameLibraryFolder({ actorId: editor, workspaceId, space: "organization", folderId: organization.id, expectedName: organization.name, name: "Member edit" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(store.renameLibraryFolder({ actorId: external, workspaceId, space: "organization", folderId: organization.id, expectedName: organization.name, name: "External edit" })).rejects.toMatchObject({ name: "AssetWorkspaceUnavailableError" });
      expect(await store.listLibrary({ workspaceId, actorId: owner })).toEqual(before);
      expect(await store.renameLibraryFolder({ actorId: owner, workspaceId, space: "organization", folderId: organization.id, expectedName: organization.name, name: "Updated" })).toEqual({ ...organization, name: "Updated" });
    });

    it("allows only one competing rename from the same observed name", async () => {
      const { store, workspaceId, owner } = await createFixture();
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const folder = await store.createLibraryFolder({ ...context, parentId: null, name: "Observed" });
      const results = await Promise.allSettled(["First", "Second"].map((name) => store.renameLibraryFolder({ ...context, folderId: folder.id, expectedName: folder.name, name })));
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "folder_changed" } });
    });
  });
}


export function verifyLibraryGroupDirectories(createFixture: () => Promise<LibraryTestFixture>) {
  describe("group directory placement", () => {
    it("creates directly in a personal folder, moves only the placement and retries without resetting tags, version or ordering", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner } = fixture;
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const asset = await upload(fixture);
      const left = await store.createLibraryFolder({ ...context, parentId: null, name: "Left" });
      const right = await store.createLibraryFolder({ ...context, parentId: null, name: "Right" });
      const creation = { ...context, folderId: left.id, idempotencyKey: "directory-group", name: "Group", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id };
      const group = await entities.createPersonalEntity(creation);
      const before = await store.listLibrary(context);
      expect(before.entityEntries).toEqual([expect.objectContaining({ entityId: group.id, folderId: left.id, addedAt: group.createdAt })]);
      await store.updateLibraryTags({ ...context, operation: "add", tagIds: ["builtin:object"], items: [{ kind: "entity", id: group.id }] });
      const request = { ...context, folderId: right.id, items: [{ entityId: group.id, expectedFolderId: left.id }] };
      const moved = await store.moveLibraryEntities(request);
      expect(moved.entries).toEqual(before.entries);
      expect(moved.entityEntries).toEqual([expect.objectContaining({ entityId: group.id, folderId: right.id, tagIds: ["builtin:object"] })]);
      expect(await entities.getPersonalEntity({ ...context, entityId: group.id })).toEqual({ ...group, libraryTagIds: ["builtin:object"] });
      expect(await store.moveLibraryEntities(request)).toEqual(moved);
      expect(await entities.createPersonalEntity(creation)).toEqual({ ...group, libraryTagIds: ["builtin:object"] });
      expect(await store.listLibrary(context)).toEqual(moved);
      await expect(entities.createPersonalEntity({ ...creation, folderId: right.id })).rejects.toMatchObject({ name: "EntityCreateConflictError" });
      await expect(store.moveLibraryEntities({ ...request, folderId: null })).rejects.toMatchObject({ code: "placement_changed" });
    });

    it("rejects inaccessible destinations and validates the entire batch before changing anything", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner, editor } = fixture;
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const asset = await upload(fixture);
      const privateFolder = await store.createLibraryFolder({ ...context, actorId: editor, parentId: null, name: "Private" });
      const shared = await store.createLibraryFolder({ ...context, space: "organization", parentId: null, name: "Shared" });
      const destination = await store.createLibraryFolder({ ...context, parentId: null, name: "Destination" });
      const creation = { ...context, idempotencyKey: "rejected-directory-group", name: "Group", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id };
      for (const folderId of [privateFolder.id, shared.id, "missing"]) await expect(entities.createPersonalEntity({ ...creation, folderId })).rejects.toMatchObject({ code: "folder_not_found" });
      expect(await entities.listPersonalEntities(context)).toEqual([]);
      const group = await entities.createPersonalEntity(creation);
      const before = await store.listLibrary(context);
      const request = { ...context, folderId: destination.id, items: [{ entityId: group.id, expectedFolderId: null }] };
      await expect(store.moveLibraryEntities({ ...request, items: [...request.items, { entityId: "missing", expectedFolderId: null }] })).rejects.toMatchObject({ code: "library_item_not_found" });
      for (const folderId of [privateFolder.id, shared.id]) await expect(store.moveLibraryEntities({ ...request, folderId })).rejects.toMatchObject({ code: "folder_not_found" });
      expect(await store.listLibrary(context)).toEqual(before);
      const alternate = await store.createLibraryFolder({ ...context, parentId: null, name: "Alternate" });
      const outcomes = await Promise.allSettled([store.moveLibraryEntities(request), store.moveLibraryEntities({ ...request, folderId: alternate.id })]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({ reason: { code: "placement_changed" } });
    });

    it("preserves subjects when their historical directory is removed without changing tags, ordering or members", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, owner } = fixture;
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const member = await upload(fixture);
      const parent = await store.createLibraryFolder({ ...context, parentId: null, name: "Parent" });
      const child = await store.createLibraryFolder({ ...context, parentId: parent.id, name: "Child" });
      const creation = { ...context, folderId: child.id, idempotencyKey: "detached-subject", name: "Subject", description: "Unchanged", mediaAssetIds: [member.id], coverMediaId: member.id };
      const subject = await entities.createPersonalEntity(creation);
      await store.updateLibraryTags({ ...context, operation: "add", tagIds: ["builtin:character"], items: [{ kind: "entity", id: subject.id }] });
      const before = await store.listLibrary(context);
      const request = { ...context, items: [{ kind: "folder" as const, id: parent.id }] };
      const result = await store.deleteLibrary(request);
      expect(result.folders).toEqual([]);
      expect(result.entries).toEqual(before.entries);
      expect(result.entityEntries).toEqual(before.entityEntries!.map((entry) => ({ ...entry, folderId: null })));
      expect(await entities.getPersonalEntity({ ...context, entityId: subject.id })).toEqual({ ...subject, libraryTagIds: ["builtin:character"] });
      expect(await entities.createPersonalEntity(creation)).toEqual({ ...subject, libraryTagIds: ["builtin:character"] });
      expect(await store.deleteLibrary(request)).toEqual(result);
      const deleted = await store.deleteLibrary({ ...context, items: [{ kind: "entity", id: subject.id, expectedVersion: subject.version }] });
      expect(deleted.entityEntries).toEqual([]);
      expect(deleted.entries).toEqual(before.entries);
    });

    it("blocks directory deletion while any surviving subject references its media, including a subject with a legacy location inside it", async () => {
      const fixture = await createFixture();
      const { store, entities, workspaceId, projectId, owner } = fixture;
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const inside = await upload(fixture), outside = await upload(fixture);
      const parent = await store.createLibraryFolder({ ...context, parentId: null, name: "Parent" });
      const child = await store.createLibraryFolder({ ...context, parentId: parent.id, name: "Child" });
      await store.saveLibrary({ ...context, projectId, folderId: child.id, tagIds: [], items: [{ assetId: inside.id, displayName: inside.displayName, action: "move", expectedFolderId: null }] });
      const create = { ...context, name: "Group", description: "", mediaAssetIds: [inside.id, outside.id], coverMediaId: inside.id };
      const contained = await entities.createPersonalEntity({ ...create, idempotencyKey: "contained", folderId: child.id });
      const survivor = await entities.createPersonalEntity({ ...create, idempotencyKey: "surviving" });
      const before = await store.listLibrary(context);
      const deletion = { ...context, items: [{ kind: "folder" as const, id: parent.id }] };
      await expect(store.deleteLibrary(deletion)).rejects.toMatchObject({ code: "library_item_in_use" });
      expect(await store.listLibrary(context)).toEqual(before);
      const partiallySelected = { ...deletion, items: [...deletion.items, { kind: "entity" as const, id: survivor.id, expectedVersion: survivor.version }] };
      await expect(store.deleteLibrary(partiallySelected)).rejects.toMatchObject({ code: "library_item_in_use" });
      expect(await store.listLibrary(context)).toEqual(before);
      const result = await store.deleteLibrary({ ...deletion, items: [...partiallySelected.items, { kind: "entity", id: contained.id, expectedVersion: contained.version }] });
      expect(result.entityEntries).toEqual([]);
      expect(result.entries).toEqual([expect.objectContaining({ assetId: outside.id, folderId: null })]);
      expect(await entities.getPersonalEntity({ ...context, entityId: contained.id })).toBeNull();
      expect(await store.deleteLibrary(deletion)).toEqual(result);
    });

    it("preserves media directory dates on rename/tag changes and same-directory save retries", async () => {
      const fixture = await createFixture();
      const { store, workspaceId, projectId, owner } = fixture;
      const context = { actorId: owner, workspaceId, space: "personal" as const };
      const asset = await upload(fixture);
      const folder = await store.createLibraryFolder({ ...context, parentId: null, name: "Folder" });
      const request = { ...context, projectId, folderId: folder.id, tagIds: [], items: [{ assetId: asset.id, displayName: "Moved", action: "move" as const, expectedFolderId: null }] };
      const moved = await store.saveLibrary(request);
      const entry = moved.entries.find((entry) => entry.assetId === asset.id)!;
      expect(entry.addedAt).toBeTruthy();
      expect((await store.saveLibrary(request)).entries).toEqual(moved.entries);
      const changed = await store.saveLibrary({ ...request, tagIds: ["builtin:scene"], items: [{ ...request.items[0], expectedFolderId: folder.id, displayName: "Renamed" }] });
      expect(changed.entries[0]).toMatchObject({ addedAt: entry.addedAt, createdAt: entry.createdAt, displayName: "Renamed" });
    });
  });
}
