import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportTransientMediaInput } from "../../application/assets/TransientMediaRepository";
import { DEMO_ASSET_FIXTURES, DEMO_ENTITY_FIXTURES } from "../../config/entity-demo-fixtures";
import { DEMO_LIBRARY_DIRECTORY_EXAMPLE } from "../../config/media-library-directory-example";
import {
  ExperienceAssetStore,
  EXPERIENCE_MAX_FILE_BYTES,
  EXPERIENCE_MAX_IMPORT_BYTES,
} from "./ExperienceAssetStore";

const workspaceId = "workspace-experience";
const stores: ExperienceAssetStore[] = [];

function store(projects = new Set(["project-one", "project-two"])) {
  const instance = new ExperienceAssetStore({ workspaceId, hasProject: (id) => projects.has(id) });
  stores.push(instance);
  return instance;
}

function upload(overrides: Partial<ImportTransientMediaInput> = {}): ImportTransientMediaInput {
  return {
    workspaceId,
    projectId: "project-one",
    target: "personal",
    displayName: "local image.png",
    mediaKind: "image",
    contentType: "image/png",
    body: new Uint8Array([1, 2, 3, 4]).buffer,
    ...overrides,
  };
}

afterEach(() => {
  for (const instance of stores.splice(0)) instance.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExperienceAssetStore", () => {
  it("isolates organization subjects and requires shared placements without confusing storage ownership", async () => {
    const instance = store();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:organization-file");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const original = await instance.library.list(workspaceId);
    const personalId = original.entries[0]!.assetId;
    const input = { workspaceId, space: "organization" as const, idempotencyKey: "org-subject", name: "Team subject", description: "", assetIds: [personalId], coverAssetId: personalId };
    await expect(instance.entities.create(input)).rejects.toMatchObject({ code: "not_found" });
    await instance.library.save({ workspaceId, projectId: "project-one", space: "organization", folderId: null, tagIds: [],
      items: [{ assetId: personalId, displayName: "Shared reference", action: "add" }] });
    const personalBeforeRename = (await instance.media.listPersonalAssets(workspaceId)).find((item) => item.id === personalId);
    await instance.media.renamePersonalAsset(workspaceId, personalId, "Organization name.png", "organization");
    expect((await instance.media.listPersonalAssets(workspaceId)).find((item) => item.id === personalId)).toEqual(personalBeforeRename);
    expect((await instance.library.list(workspaceId)).entries.find((entry) => entry.assetId === personalId && entry.space === "organization")?.displayName).toBe("Organization name.png");
    const shared = await instance.entities.create({ ...input, idempotencyKey: "shared-personal-source" });
    expect(shared.space).toBe("organization");
    expect(await instance.entities.get(workspaceId, shared.id, "organization")).toEqual(shared);
    await instance.library.delete({ workspaceId, space: "organization", items: [{ kind: "entity", id: shared.id, expectedVersion: 1 }] });
    const uploaded = await instance.importFile(upload({ storageSpace: "organization", uploadPurpose: "library" }));
    const content = { ...input, assetIds: [uploaded.asset.id], coverAssetId: uploaded.asset.id, tagIds: ["builtin:character"] };
    const created = await instance.entities.create(content);
    expect(created.space).toBe("organization");
    expect(await instance.entities.listPersonal(workspaceId, "organization")).toEqual([created]);
    expect((await instance.entities.listPersonal(workspaceId)).some((entity) => entity.id === created.id)).toBe(false);
    await expect(instance.entities.get(workspaceId, created.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(instance.entities.create(content)).resolves.toEqual(created);
    const updated = await instance.entities.update({ ...content, entityId: created.id, expectedVersion: 1, expectedTagIds: ["builtin:character"], name: "Team subject edited" });
    expect(updated.version).toBe(2);
    await instance.library.delete({ workspaceId, space: "personal", items: [{ kind: "entity", id: created.id, expectedVersion: 2 }] });
    expect(await instance.entities.get(workspaceId, created.id, "organization")).toEqual(updated);
    const catalog = await instance.library.list(workspaceId);
    expect(catalog.entityEntries!.find((entry) => entry.entityId === created.id)).toMatchObject({ space: "organization", tagIds: ["builtin:character"] });
    expect(catalog.entries.some((entry) => entry.assetId === uploaded.asset.id && entry.space === "personal")).toBe(false);
    await instance.library.delete({ workspaceId, space: "organization", items: [{ kind: "entity", id: created.id, expectedVersion: 2 }] });
    expect(await instance.entities.listPersonal(workspaceId, "organization")).toEqual([]);
    expect((await instance.library.list(workspaceId)).entries.some((entry) => entry.assetId === uploaded.asset.id)).toBe(true);
    expect((await instance.entities.listPersonal(workspaceId)).length).toBe(original.entityEntries!.length);
    await expect(instance.entities.create(content)).rejects.toMatchObject({ code: "conflict" });
    instance.reset();
    expect(await instance.entities.listPersonal(workspaceId, "organization")).toEqual([]);
  });

  it("saves subject tags with content, preserves omitted tags, clears explicitly and rejects stale editor snapshots", async () => {
    const instance = store();
    const base = { workspaceId, space: "personal" as const };
    const catalog = await instance.library.list(workspaceId);
    const assetId = catalog.entries[0]!.assetId;
    const custom = await instance.library.createTag({ ...base, name: "Subject tag" });
    const organization = await instance.library.createTag({ ...base, space: "organization", name: "Foreign tag" });
    const input = { workspaceId, idempotencyKey: "experience-subject-tags", name: "Subject", description: "", assetIds: [assetId], coverAssetId: assetId, tagIds: [custom.id] };
    const created = await instance.entities.create(input);
    expect(created.libraryTagIds).toEqual([custom.id]);
    await expect(instance.entities.create(input)).resolves.toEqual(created);
    await expect(instance.entities.create({ ...input, tagIds: [] })).rejects.toMatchObject({ code: "conflict" });
    const update = { workspaceId, entityId: created.id, expectedVersion: 1, name: "Updated", description: "", assetIds: [assetId], coverAssetId: assetId, tagIds: ["builtin:character"], expectedTagIds: [custom.id] };
    await expect(instance.entities.update({ ...update, tagIds: [organization.id] })).rejects.toMatchObject({ serviceCode: "tag_not_found" });
    await instance.library.updateTags({ ...base, operation: "add", tagIds: ["builtin:scene"], items: [{ kind: "entity", id: created.id }] });
    await expect(instance.entities.update(update)).rejects.toMatchObject({ serviceCode: "placement_changed" });
    expect((await instance.entities.get(workspaceId, created.id)).name).toBe("Subject");
    const saved = await instance.entities.update({ ...update, expectedTagIds: [custom.id, "builtin:scene"] });
    expect(saved.libraryTagIds).toEqual(["builtin:character"]);
    const preserved = await instance.entities.update({ ...update, expectedVersion: 2, tagIds: undefined, expectedTagIds: undefined });
    expect(preserved.libraryTagIds).toEqual(["builtin:character"]);
    const cleared = await instance.entities.update({ ...update, expectedVersion: 3, tagIds: [], expectedTagIds: ["builtin:character"] });
    expect(cleared.libraryTagIds).toEqual([]);
    expect((await instance.library.list(workspaceId)).entityEntries!.find((entry) => entry.entityId === created.id)!.tagIds).toEqual([]);
    expect((await instance.library.list(workspaceId)).entries).toEqual(catalog.entries);
  });

  it("detaches legacy subject locations when deleting directories while retaining subjects and their members", async () => {
    const instance = store();
    const context = { workspaceId, space: "personal" as const };
    const before = await instance.library.list(workspaceId);
    const assetId = before.entries[0]!.assetId;
    const folder = await instance.library.createFolder({ ...context, parentId: null, name: "Group folder" });
    const destination = await instance.library.createFolder({ ...context, parentId: null, name: "Destination" });
    const creation = { workspaceId, folderId: folder.id, idempotencyKey: "placed-group", name: "Group", description: "", assetIds: [assetId], coverAssetId: assetId };
    const group = await instance.entities.create(creation);
    await instance.library.updateTags({ ...context, operation: "add", tagIds: ["builtin:object"], items: [{ kind: "entity", id: group.id }] });
    const request = { ...context, folderId: destination.id, items: [{ entityId: group.id, expectedFolderId: folder.id }] };
    const moved = await instance.library.moveEntities(request);
    expect(moved.entries).toEqual(before.entries);
    expect(moved.entityEntries!.find((entry) => entry.entityId === group.id)).toMatchObject({ folderId: destination.id, tagIds: ["builtin:object"] });
    expect(await instance.library.moveEntities(request)).toEqual(moved);
    expect(await instance.entities.create(creation)).toEqual({ ...group, libraryTagIds: ["builtin:object"] });
    await expect(instance.library.moveEntities({ ...request, folderId: null })).rejects.toMatchObject({ serviceCode: "placement_changed" });
    const result = await instance.library.delete({ ...context, items: [{ kind: "folder", id: destination.id }] });
    expect(result.entries).toEqual(before.entries);
    expect(result.entityEntries!.find((entry) => entry.entityId === group.id)).toEqual({ ...moved.entityEntries!.find((entry) => entry.entityId === group.id), folderId: null });
    expect(await instance.entities.get(workspaceId, group.id)).toEqual({ ...group, libraryTagIds: ["builtin:object"] });
    expect(result.folders.some((entry) => entry.id === destination.id)).toBe(false);
    expect(await instance.library.delete({ ...context, items: [{ kind: "folder", id: destination.id }] })).toEqual(result);
    await expect(instance.entities.create({ ...creation, idempotencyKey: "bad-folder", folderId: "missing" })).rejects.toMatchObject({ serviceCode: "folder_not_found" });
    instance.reset();
    expect(await instance.library.list(workspaceId)).toEqual(before);
  });

  it("does not delete a directory whose media is used by a subject historically placed in the same directory", async () => {
    const instance = store();
    const context = { workspaceId, space: "personal" as const };
    const imported = await instance.importFile(upload());
    const folder = await instance.library.createFolder({ ...context, parentId: null, name: "Legacy" });
    await instance.library.save({ ...context, projectId: "project-one", folderId: folder.id, tagIds: [],
      items: [{ assetId: imported.asset.id, displayName: "Member", action: "move", expectedFolderId: null }] });
    const group = await instance.entities.create({ workspaceId, folderId: folder.id, idempotencyKey: "protected-subject", name: "Subject", description: "", assetIds: [imported.asset.id], coverAssetId: imported.asset.id });
    const before = await instance.library.list(workspaceId);
    await expect(instance.library.delete({ ...context, items: [{ kind: "folder", id: folder.id }] })).rejects.toMatchObject({ serviceCode: "library_item_in_use" });
    expect(await instance.library.list(workspaceId)).toEqual(before);
    expect(await instance.entities.get(workspaceId, group.id)).toEqual(group);
    const after = await instance.library.delete({ ...context, items: [{ kind: "entity", id: group.id, expectedVersion: group.version }, { kind: "folder", id: folder.id }] });
    expect(after.entityEntries!.some((entry) => entry.entityId === group.id)).toBe(false);
    expect(after.entries.some((entry) => entry.assetId === imported.asset.id)).toBe(false);
  });

  it("deletes custom tags and every scoped association atomically while retaining media and group content", async () => {
    const instance = store();
    const [group] = await instance.entities.listPersonal(workspaceId);
    const assetId = group!.mediaRefs[0]!.assetId;
    const base = { workspaceId, space: "personal" as const };
    const custom = await instance.library.createTag({ ...base, name: "精选" });
    const other = await instance.library.createTag({ ...base, space: "organization", name: "精选" });
    await instance.library.save({ ...base, projectId: "project-one", space: "organization", folderId: null,
      tagIds: [other.id], items: [{ assetId, displayName: "组织素材", action: "add" }] });
    await instance.library.updateTags({ ...base, operation: "add", tagIds: [custom.id],
      items: [{ kind: "media", id: assetId }, { kind: "entity", id: group!.id }] });
    const before = await instance.library.list(workspaceId);
    const request = { ...base, tagId: custom.id, expectedUsageCount: 2 };
    for (const invalid of [{ ...request, expectedUsageCount: 1 }, { ...request, tagId: "builtin:character" }]) {
      await expect(instance.library.deleteTag(invalid)).rejects.toMatchObject({ serviceCode: invalid.tagId === custom.id ? "tag_usage_changed" : "preset_tag" });
      expect(await instance.library.list(workspaceId)).toEqual(before);
    }
    await expect(instance.library.deleteTag({ ...request, workspaceId: "foreign" })).rejects.toMatchObject({ code: "not_found" });
    const after = await instance.library.deleteTag(request);
    expect(after.tags).toEqual(before.tags.filter((tag) => tag.id !== custom.id));
    expect(after.entries).toEqual(before.entries.map((entry) => entry.space === "personal" ? { ...entry, tagIds: entry.tagIds.filter((id) => id !== custom.id) } : entry));
    expect(after.entityEntries).toEqual(before.entityEntries!.map((entry) => ({ ...entry, tagIds: entry.tagIds.filter((id) => id !== custom.id) })));
    expect(after.folders).toEqual(before.folders);
    expect(await instance.entities.get(workspaceId, group!.id)).toEqual(group);
    expect(await instance.library.deleteTag(request)).toEqual(after);
    expect(await instance.library.deleteTag({ ...request, tagId: other.id })).toEqual(after);
    after.entries[0]!.tagIds.push("caller-mutation");
    expect((await instance.library.list(workspaceId)).entries[0]!.tagIds).not.toContain("caller-mutation");
  });

  it("applies tag deltas to selected placements independently of group contents and other spaces", async () => {
    const instance = store();
    const initial = await instance.library.list(workspaceId);
    const [group] = await instance.entities.listPersonal(workspaceId);
    const assetId = group!.mediaRefs[0]!.assetId;
    const base = { workspaceId, space: "personal" as const };
    const custom = await instance.library.createTag({ ...base, name: "精选" });
    await instance.library.save({ ...base, projectId: "project-one", space: "organization", folderId: null,
      tagIds: ["builtin:object"], items: [{ assetId, displayName: "组织素材", action: "add" }] });
    const before = await instance.library.list(workspaceId);
    const originalAsset = before.entries.find((entry) => entry.assetId === assetId && entry.space === "personal")!;
    const mixed = { ...base, operation: "add" as const, tagIds: [custom.id, "builtin:scene", custom.id],
      items: [{ kind: "media" as const, id: assetId }, { kind: "entity" as const, id: group!.id }] };
    const added = await instance.library.updateTags(mixed);
    expect(await instance.library.updateTags(mixed)).toEqual(added);
    expect(added.entries.find((entry) => entry.assetId === assetId && entry.space === "personal"))
      .toEqual({ ...originalAsset, tagIds: [...new Set([...originalAsset.tagIds, "builtin:scene", custom.id])].sort() });
    expect(added.entries.filter((entry) => entry.assetId !== assetId || entry.space === "organization"))
      .toEqual(before.entries.filter((entry) => entry.assetId !== assetId || entry.space === "organization"));
    expect(added.entityEntries!.find((entry) => entry.entityId === group!.id)!.tagIds)
      .toEqual(["builtin:character", "builtin:scene", custom.id].sort());
    const removed = await instance.library.updateTags({ ...base, operation: "remove", tagIds: ["builtin:scene", "builtin:character"],
      items: [{ kind: "entity", id: group!.id }] });
    expect(removed.entityEntries!.find((entry) => entry.entityId === group!.id)!.tagIds).toEqual([custom.id]);
    expect(removed.entries).toEqual(added.entries);
    expect(await instance.entities.get(workspaceId, group!.id)).toEqual({ ...group, libraryTagIds: [custom.id] });
    removed.entityEntries![0]!.tagIds.push("caller-mutation");
    expect((await instance.library.list(workspaceId)).entityEntries![0]!.tagIds).not.toContain("caller-mutation");
    instance.reset();
    expect(await instance.library.list(workspaceId)).toEqual(initial);
  });

  it("rejects an entire tag batch when any target or tag is outside the current placement scope", async () => {
    const instance = store();
    const initial = await instance.library.list(workspaceId);
    const assetId = initial.entries[0]!.assetId;
    const groupId = initial.entityEntries![0]!.entityId;
    const foreign = await instance.library.createTag({ workspaceId, space: "organization", name: "组织专用" });
    const before = await instance.library.list(workspaceId);
    const base = { workspaceId, space: "personal" as const, operation: "add" as const,
      tagIds: ["builtin:scene"], items: [{ kind: "media" as const, id: assetId }] };
    const attempts = [
      { input: { ...base, items: [...base.items, { kind: "entity" as const, id: "missing" }] }, code: "library_item_not_found" },
      { input: { ...base, space: "organization" as const }, code: "library_item_not_found" },
      { input: { ...base, tagIds: [foreign.id] }, code: "tag_not_found" },
      { input: { ...base, tagIds: ["builtin:sound"] }, code: "tag_not_found" },
      { input: { ...base, items: [...base.items, ...base.items] }, code: "invalid_request" },
      { input: { ...base, tagIds: [] }, code: "invalid_request" },
      { input: { ...base, space: "organization" as const, items: [{ kind: "entity" as const, id: groupId }] }, code: "library_item_not_found" },
    ];
    for (const { input, code } of attempts) {
      await expect(instance.library.updateTags(input)).rejects.toMatchObject({ serviceCode: code });
      expect(await instance.library.list(workspaceId)).toEqual(before);
    }
    await expect(instance.library.updateTags({ ...base, workspaceId: "foreign-workspace" })).rejects.toMatchObject({ code: "not_found" });
    expect(await instance.library.list(workspaceId)).toEqual(before);
    const group = await instance.entities.get(workspaceId, groupId);
    await instance.library.delete({ workspaceId, space: "personal", items: [{ kind: "entity", id: groupId, expectedVersion: group.version }] });
    const deleted = await instance.library.list(workspaceId);
    expect(deleted.entityEntries!.some((entry) => entry.entityId === groupId)).toBe(false);
    await expect(instance.library.updateTags({ ...base, items: [...base.items, { kind: "entity", id: groupId }] }))
      .rejects.toMatchObject({ serviceCode: "library_item_not_found" });
    expect(await instance.library.list(workspaceId)).toEqual(deleted);
  });

  it("keeps new group tags empty even when its name and referenced media suggest a category", async () => {
    const instance = store();
    const catalog = await instance.library.list(workspaceId);
    const assetId = catalog.entries[0]!.assetId;
    await instance.library.updateTags({ workspaceId, space: "personal", operation: "add",
      tagIds: ["builtin:scene"], items: [{ kind: "media", id: assetId }] });
    const group = await instance.entities.create({ workspaceId, idempotencyKey: "untagged-new-group", name: "角色场景", description: "",
      assetIds: [assetId], coverAssetId: assetId });
    expect((await instance.library.list(workspaceId)).entityEntries!.find((entry) => entry.entityId === group.id))
      .toEqual({ entityId: group.id, space: "personal", folderId: null, addedAt: group.createdAt, tagIds: [] });
  });

  it("reports the actual temporary 4 MB policy and supports library SVG and WebM without expanding legacy canvas intake", async () => {
    const instance = store();
    const policy = await instance.media.getUploadPolicy(workspaceId);
    expect(policy.library.maxFileBytes).toBe(EXPERIENCE_MAX_FILE_BYTES);
    expect(policy.canvasMaxFileBytes).toBe(EXPERIENCE_MAX_FILE_BYTES);
    for (const [displayName, contentType, mediaKind] of [["logo.svg", "image/svg+xml", "image"], ["shot.webm", "video/webm", "video"]] as const) {
      const result = await instance.importFile(upload({ displayName, contentType, mediaKind, uploadPurpose: "library" }));
      expect(result.asset.contentType).toBe(contentType);
      expect(result.asset.contentUrl).toMatch(/^blob:/);
    }
    await expect(instance.importFile(upload({ displayName: "animation.gif", contentType: "image/gif", uploadPurpose: "library" })))
      .rejects.toThrow("资产库暂不支持此文件格式");
    await expect(instance.importFile(upload({ displayName: "animation.gif", contentType: "image/gif" }))).resolves.toBeDefined();
    const audio = await instance.importFile(upload({ displayName: "voice.ogg", contentType: "application/ogg", mediaKind: "audio", uploadPurpose: "library" }));
    expect(audio.asset.contentType).toBe("audio/ogg");
    await expect(instance.importFile(upload({ displayName: "video.webm", contentType: "application/ogg", mediaKind: "video", uploadPurpose: "library" })))
      .rejects.toThrow();
    await expect(instance.importFile(upload({ uploadPurpose: "library", body: new Uint8Array(EXPERIENCE_MAX_FILE_BYTES + 1).buffer })))
      .rejects.toThrow();
  });
  it("deletes scoped placements and groups atomically while preserving project media and preventing old group creates from returning", async () => {
    const instance = store();
    const imported = await instance.importFile(upload({ target: "project" }));
    const create = { workspaceId, idempotencyKey: "group-to-delete", name: "Group", description: "", assetIds: [imported.asset.id], coverAssetId: imported.asset.id };
    const group = await instance.entities.create(create);
    const folder = await instance.library.createFolder({ workspaceId, space: "personal", parentId: null, name: "Private" });
    await instance.library.save({ workspaceId, projectId: "project-one", space: "personal", folderId: folder.id, tagIds: [], items: [{ assetId: imported.asset.id, displayName: "Personal", action: "move", expectedFolderId: null }] });
    await instance.library.save({ workspaceId, projectId: "project-one", space: "organization", folderId: null, tagIds: [], items: [{ assetId: imported.asset.id, displayName: "Shared", action: "add" }] });
    const before = await instance.library.list(workspaceId);
    await expect(instance.library.delete({ workspaceId, space: "personal", items: [{ kind: "folder", id: folder.id }] })).rejects.toMatchObject({ serviceCode: "library_item_in_use" });
    expect(await instance.library.list(workspaceId)).toEqual(before);
    const request = { workspaceId, space: "personal" as const, items: [{ kind: "folder" as const, id: folder.id }, { kind: "entity" as const, id: group.id, expectedVersion: group.version }] };
    const after = await instance.library.delete(request);
    expect(after.entries.filter((entry) => entry.assetId === imported.asset.id)).toMatchObject([{ space: "organization", displayName: "Shared" }]);
    expect((await instance.media.listPersonalAssets(workspaceId)).some((asset) => asset.id === imported.asset.id)).toBe(false);
    expect((await instance.entities.listPersonal(workspaceId)).some((entity) => entity.id === group.id)).toBe(false);
    expect(await instance.library.delete(request)).toEqual(after);
    expect((await instance.media.listProjectAssets("project-one"))[0]!.assetId).toBe(imported.asset.id);
    await expect(instance.entities.create(create)).rejects.toMatchObject({ code: "conflict" });
  });

  it("renames folders in place and rejects lost updates and sibling collisions", async () => {
    const instance = store();
    const context = { workspaceId, space: "personal" as const };
    const folder = await instance.library.createFolder({ ...context, parentId: null, name: "Original" });
    const child = await instance.library.createFolder({ ...context, parentId: folder.id, name: "Child" });
    await instance.library.createFolder({ ...context, parentId: null, name: "Sibling" });
    const request = { ...context, folderId: folder.id, name: "Renamed", expectedName: folder.name };
    expect(await instance.library.renameFolder(request)).toEqual({ ...folder, name: "Renamed" });
    expect(await instance.library.renameFolder(request)).toEqual({ ...folder, name: "Renamed" });
    expect((await instance.library.list(workspaceId)).folders.find((candidate) => candidate.id === child.id)).toEqual(child);
    await expect(instance.library.renameFolder({ ...request, name: "Lost update" })).rejects.toMatchObject({ serviceCode: "folder_changed" });
    await expect(instance.library.renameFolder({ ...request, expectedName: "Renamed", name: "Ｓｉｂｌｉｎｇ" })).rejects.toMatchObject({ serviceCode: "folder_name_conflict" });
    await expect(instance.library.renameFolder({ ...request, space: "organization" })).rejects.toMatchObject({ serviceCode: "folder_not_found" });
  });

  it("keeps saved metadata scoped, moves explicit, and retries atomic without changing project names", async () => {
    const instance = store();
    const initialCatalog = await instance.library.list(workspaceId);
    const original = await instance.importFile(upload({ target: "project" }));
    const library = instance.library;
    const folder = await library.createFolder({ workspaceId, space: "personal", parentId: null, name: "参考" });
    const custom = await library.createTag({ workspaceId, space: "personal", name: " 自定义 " });
    expect(await library.createTag({ workspaceId, space: "personal", name: "自定义" })).toEqual(custom);
    const save = { workspaceId, projectId: "project-one", space: "personal" as const, folderId: folder.id,
      tagIds: [custom.id, "builtin:character"], items: [{ assetId: original.asset.id, displayName: "库内名称", action: "save" as const }] };
    await expect(library.save(save)).rejects.toMatchObject({ serviceCode: "explicit_move_required" });
    const move = { ...save, items: [{ ...save.items[0]!, action: "move" as const, expectedFolderId: null }] };
    const moved = await library.save(move);
    expect(await library.save(move)).toEqual(moved);
    expect((await instance.media.listProjectAssets("project-one"))[0]!.displayName).toBe(original.asset.displayName);
    expect((await instance.media.listPersonalAssets(workspaceId)).find((asset) => asset.id === original.asset.id)?.displayName).toBe("库内名称");
    await expect(library.save({ ...save, space: "organization", folderId: null })).rejects.toMatchObject({ serviceCode: "tag_not_found" });
    await library.save({ ...save, space: "organization", folderId: null, tagIds: ["builtin:character"],
      items: [{ ...save.items[0]!, displayName: "组织版本" }] });
    const catalog = await library.list(workspaceId);
    expect(catalog.entries.filter((entry) => entry.assetId === original.asset.id)).toMatchObject([
      { space: "personal", displayName: "库内名称", folderId: folder.id },
      { space: "organization", displayName: "组织版本", folderId: null },
    ]);
    await expect(library.save({ ...move, items: [...move.items, { ...move.items[0]!, assetId: "missing" }] }))
      .rejects.toMatchObject({ code: "conflict" });
    expect(await library.list(workspaceId)).toEqual(catalog);
    catalog.folders.find((item) => item.id === folder.id)!.name = "caller mutation";
    expect((await library.list(workspaceId)).folders.find((item) => item.id === folder.id)!.name).toBe("参考");
    instance.reset();
    expect(await library.list(workspaceId)).toEqual(initialCatalog);
  });

  it("adds only absent scoped entries and leaves existing metadata unchanged across retries", async () => {
    const instance = store();
    const initialCatalog = await instance.library.list(workspaceId);
    const existing = await instance.importFile(upload({ target: "project" }));
    const incoming = await instance.importFile(upload({ displayName: "incoming.png", body: new Uint8Array([5, 6, 7, 8]).buffer }));
    const library = instance.library;
    const context = { workspaceId, projectId: "project-one", space: "organization" as const };
    const folder = await library.createFolder({ ...context, parentId: null, name: "原有目录" });
    const tag = await library.createTag({ ...context, name: "原有标签" });
    const before = await library.save({ ...context, folderId: folder.id, tagIds: [tag.id],
      items: [{ assetId: existing.asset.id, displayName: "保留名称", action: "save" }] });
    const request = { ...context, folderId: null, tagIds: ["builtin:scene"], items: [
      { assetId: existing.asset.id, displayName: "不会覆盖", action: "add" as const },
      { assetId: incoming.asset.id, displayName: "新素材名称", action: "add" as const },
    ] };
    await expect(library.save({ ...request, items: [...request.items, { ...request.items[0]!, assetId: "missing" }] }))
      .rejects.toMatchObject({ code: "not_found" });
    expect(await library.list(workspaceId)).toEqual(before);
    const saved = await library.save(request);
    expect(saved.entries.find((entry) => entry.space === "organization" && entry.assetId === existing.asset.id))
      .toEqual(before.entries.find((entry) => entry.space === "organization" && entry.assetId === existing.asset.id));
    expect(saved.entries.find((entry) => entry.space === "organization" && entry.assetId === incoming.asset.id))
      .toMatchObject({ displayName: "新素材名称", folderId: null, tagIds: ["builtin:scene"] });
    expect(saved.entries.filter((entry) => entry.space === "personal")).toEqual(before.entries.filter((entry) => entry.space === "personal"));
    await expect(library.save({ ...request, folderId: folder.id, tagIds: [], items: request.items.map((item) => ({ ...item, displayName: "重试名称" })) }))
      .resolves.toEqual(saved);
    await expect(library.save({ ...request, space: "personal", folderId: null, tagIds: [] })).resolves.toEqual(saved);
    expect((await instance.media.listProjectAssets("project-one"))[0]!.displayName).toBe(existing.asset.displayName);
    await expect(library.save({ ...request, projectId: "missing" })).rejects.toMatchObject({ code: "not_found" });
    instance.reset();
    expect(await library.list(workspaceId)).toEqual(initialCatalog);
  });

  it("restores exactly one five-level directory sample without changing source names or group references", async () => {
    const instance = store();
    const example = DEMO_LIBRARY_DIRECTORY_EXAMPLE;
    const catalog = await instance.library.list(workspaceId);
    expect(catalog.folders.map((folder) => folder.name)).toEqual(example.path);
    expect(catalog.folders.filter((folder) => folder.parentId === null)).toHaveLength(1);
    const nested = catalog.entries.filter((entry) => entry.folderId !== null);
    expect(nested).toHaveLength(1);
    const selected = nested[0]!;
    const path = [];
    let folderId = selected.folderId;
    while (folderId) {
      const folder = catalog.folders.find((candidate) => candidate.id === folderId)!;
      path.unshift(folder.name);
      folderId = folder.parentId;
    }
    expect(["默认目录", ...path]).toHaveLength(5);
    expect(path).toEqual(example.path);
    expect(selected.displayName).toBe(example.displayName);
    expect(selected.tagIds).toEqual([example.builtinTagId]);
    expect(catalog.tags).toEqual([]);
    expect(catalog.entityEntries).toEqual(DEMO_ENTITY_FIXTURES.map((fixture) => ({
      entityId: `experience-${fixture.staticEntityId}`, space: "personal", folderId: null, addedAt: "2026-09-07T00:00:00.000Z", tagIds: ["builtin:character"],
    })));
    const fixture = DEMO_ASSET_FIXTURES.find((asset) => asset.key === example.assetKey)!;
    const projectAsset = await instance.media.attachToProject("project-one", selected.assetId);
    expect(projectAsset.displayName).toBe(fixture.displayName);
    const entities = await instance.entities.listPersonal(workspaceId);
    expect(entities.some((entity) => entity.mediaRefs.some((reference) => reference.assetId === selected.assetId))).toBe(true);
    await instance.library.save({ workspaceId, projectId: "project-one", space: "personal", folderId: null,
      tagIds: [], items: [{ assetId: selected.assetId, displayName: "临时修改", action: "move", expectedFolderId: selected.folderId }] });
    instance.reset();
    expect(await instance.library.list(workspaceId)).toEqual(catalog);
    expect(await instance.entities.listPersonal(workspaceId)).toEqual(entities);
    expect(await instance.library.list(workspaceId)).toEqual(await store().library.list(workspaceId));
  });

  it("enforces folder boundaries and five directory levels including root", async () => {
    const instance = store();
    let parentId: string | null = null;
    for (let level = 1; level <= 4; level += 1) {
      const folder = await instance.library.createFolder({ workspaceId, space: "personal", parentId, name: `第${level}级` });
      parentId = folder.id;
    }
    await expect(instance.library.createFolder({ workspaceId, space: "personal", parentId, name: "太深" }))
      .rejects.toMatchObject({ serviceCode: "folder_depth_exceeded" });
    await expect(instance.library.createFolder({ workspaceId, space: "organization", parentId, name: "跨空间" }))
      .rejects.toMatchObject({ serviceCode: "folder_not_found" });
    await expect(instance.library.createFolder({ workspaceId, space: "personal", parentId: null, name: " 第1级 " }))
      .rejects.toMatchObject({ serviceCode: "folder_name_conflict" });
  });

  it("isolates uploads, renames, entity edits and returned values across instances", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("Network is forbidden in an experience store"); });
    vi.stubGlobal("fetch", fetchSpy);
    const first = store();
    const second = store();
    const input = upload();
    const imported = await first.importFile(input);
    expect(imported.asset.contentUrl).toMatch(/^blob:/);
    expect(imported.asset.checksumSha256).toBe("9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a");
    expect(imported.projectAsset).toBeNull();
    expect(await first.media.listPersonalAssets(workspaceId)).toHaveLength(17);
    expect(await second.media.listPersonalAssets(workspaceId)).toHaveLength(16);
    const assetId = `experience-${DEMO_ASSET_FIXTURES[0]!.staticMediaId}`;
    await first.media.renamePersonalAsset(workspaceId, assetId, " 新名称 ");
    const original = (await first.entities.listPersonal(workspaceId))[0]!;
    await first.entities.update({
      workspaceId, entityId: original.id, expectedVersion: 1,
      name: "新主体名", description: "new description", assetIds: [imported.asset.id], coverAssetId: imported.asset.id,
    });
    const listed = await first.entities.listPersonal(workspaceId);
    listed[0]!.mediaRefs[0]!.assetId = "caller mutation";
    expect((await first.entities.get(workspaceId, original.id)).mediaRefs[0]!.assetId).toBe(imported.asset.id);
    expect((await second.entities.get(workspaceId, original.id)).name).toBe(DEMO_ENTITY_FIXTURES[0]!.name);
    expect((await second.media.listPersonalAssets(workspaceId))[0]!.displayName).toBe(DEMO_ASSET_FIXTURES[0]!.displayName);
    expect(DEMO_ENTITY_FIXTURES[0]!.assetKeys).toHaveLength(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reset revokes local bytes and rebuilds the same initial catalog as a fresh page", async () => {
    const first = store();
    const initialAssets = await first.media.listPersonalAssets(workspaceId);
    const initialEntities = await first.entities.listPersonal(workspaceId);
    const imported = await first.importFile(upload({ target: "project" }));
    await first.media.renamePersonalAsset(workspaceId, initialAssets[0]!.id, "changed");
    const created = await first.entities.create({
      workspaceId, idempotencyKey: "new-entity-creation", name: "Created", description: "",
      assetIds: [imported.asset.id], coverAssetId: imported.asset.id,
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    first.reset();
    expect(revoke).toHaveBeenCalledExactlyOnceWith(imported.asset.contentUrl);
    expect(await first.media.listPersonalAssets(workspaceId)).toEqual(initialAssets);
    expect(await first.entities.listPersonal(workspaceId)).toEqual(initialEntities);
    expect(await first.media.listProjectAssets("project-one")).toEqual([]);
    await expect(first.entities.get(workspaceId, created.id)).rejects.toMatchObject({ code: "not_found" });
    const fresh = store();
    expect(await fresh.media.listPersonalAssets(workspaceId)).toEqual(initialAssets);
    expect(await fresh.entities.listPersonal(workspaceId)).toEqual(initialEntities);
  });

  it("keeps project references explicit, idempotent and scoped to existing projects", async () => {
    const projects = new Set(["project-one", "project-two"]);
    const instance = store(projects);
    const imported = await instance.importFile(upload({ target: "project" }));
    expect(imported.projectAsset?.assetId).toBe(imported.asset.id);
    expect(await instance.media.attachToProject("project-one", imported.asset.id)).toEqual(imported.projectAsset);
    expect(await instance.media.listProjectAssets("project-one")).toEqual([imported.projectAsset]);
    expect(await instance.media.listProjectAssets("project-two")).toEqual([]);
    await instance.media.renamePersonalAsset(workspaceId, imported.asset.id, "renamed.png");
    expect((await instance.media.listProjectAssets("project-one"))[0]!.displayName).toBe("local image.png");
    await expect(instance.media.listPersonalAssets("workspace-other")).rejects.toMatchObject({ code: "not_found" });
    await expect(instance.media.attachToProject("project-two", "unknown")).rejects.toMatchObject({ code: "not_found" });
    projects.delete("project-one");
    await expect(instance.media.listProjectAssets("project-one")).rejects.toMatchObject({ code: "not_found" });
    await expect(instance.importFile(upload())).rejects.toMatchObject({ code: "not_found" });
  });

  it("preserves entity validation, reference ordering, idempotency and optimistic versions", async () => {
    const instance = store();
    const assets = await instance.media.listPersonalAssets(workspaceId);
    const input = {
      workspaceId, idempotencyKey: "create-ordered-entity", name: " Example ", description: " trimmed ",
      assetIds: [assets[1]!.id, assets[0]!.id, assets[1]!.id], coverAssetId: assets[0]!.id,
    };
    const created = await instance.entities.create(input);
    expect(created).toMatchObject({ name: "Example", description: "trimmed", version: 1 });
    expect(created.mediaRefs).toEqual([{ assetId: assets[1]!.id, order: 0 }, { assetId: assets[0]!.id, order: 1 }]);
    expect(await instance.entities.create(input)).toEqual(created);
    await expect(instance.entities.create({ ...input, name: "different" })).rejects.toMatchObject({ code: "conflict" });
    const update = { ...input, entityId: created.id, expectedVersion: 1, name: "Updated" };
    expect((await instance.entities.update(update)).version).toBe(2);
    await expect(instance.entities.update(update)).rejects.toMatchObject({ code: "conflict" });
    await expect(instance.entities.update({ ...update, expectedVersion: 2, assetIds: ["missing"], coverAssetId: null }))
      .rejects.toMatchObject({ code: "not_found" });
    await expect(instance.entities.update({ ...update, expectedVersion: 2, coverAssetId: assets[2]!.id }))
      .rejects.toMatchObject({ serviceCode: "cover_not_referenced" });
    expect((await instance.entities.get(workspaceId, created.id)).version).toBe(2);
  });

  it("rejects unsupported, empty and oversized media without creating a blob URL", async () => {
    const instance = store();
    const createUrl = vi.spyOn(URL, "createObjectURL");
    await expect(instance.importFile(upload({ body: new ArrayBuffer(0) }))).rejects.toMatchObject({ code: "request_failed" });
    await expect(instance.importFile(upload({ body: new ArrayBuffer(EXPERIENCE_MAX_FILE_BYTES + 1) })))
      .rejects.toMatchObject({ serviceCode: "asset_too_large" });
    await expect(instance.importFile(upload({ contentType: "text/html" }))).rejects.toMatchObject({ code: "request_failed" });
    await expect(instance.importFile(upload({ mediaKind: "video" }))).rejects.toMatchObject({ code: "request_failed" });
    await expect(instance.media.createUploadIntent({
      workspaceId, idempotencyKey: "unsupported-upload", mediaKind: "image", displayName: "image.png",
      contentType: "image/png", byteSize: 4, checksumSha256: "a".repeat(64),
    })).rejects.toMatchObject({ serviceCode: "transient_upload_required" });
    expect(createUrl).not.toHaveBeenCalled();
    expect(await instance.media.listPersonalAssets(workspaceId)).toHaveLength(16);
  });

  it("reserves the shared byte budget before hashing concurrent uploads", async () => {
    const instance = store();
    const pending: Array<(hash: ArrayBuffer) => void> = [];
    vi.spyOn(crypto.subtle, "digest").mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${crypto.randomUUID()}`);
    const body = new ArrayBuffer(EXPERIENCE_MAX_FILE_BYTES);
    const imports = Array.from({ length: EXPERIENCE_MAX_IMPORT_BYTES / EXPERIENCE_MAX_FILE_BYTES }, () => instance.importFile(upload({ body })));
    await expect(instance.importFile(upload({ body }))).rejects.toMatchObject({ serviceCode: "experience_memory_limit" });
    expect(createUrl).not.toHaveBeenCalled();
    pending.forEach((resolve) => resolve(new ArrayBuffer(32)));
    await Promise.all(imports);
    expect(await instance.media.listPersonalAssets(workspaceId)).toHaveLength(48);
    instance.reset();
    const next = instance.importFile(upload({ body }));
    pending[pending.length - 1]!(new ArrayBuffer(32));
    await expect(next).resolves.toHaveProperty("asset");
  });

  it("does not recreate media after reset or after its project disappears during import", async () => {
    const projects = new Set(["project-one"]);
    const instance = store(projects);
    let finish!: (hash: ArrayBuffer) => void;
    vi.spyOn(crypto.subtle, "digest").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const createUrl = vi.spyOn(URL, "createObjectURL");
    const beforeReset = instance.importFile(upload());
    instance.reset();
    finish(new ArrayBuffer(32));
    await expect(beforeReset).rejects.toMatchObject({ serviceCode: "experience_reset" });
    const beforeDelete = instance.importFile(upload({ target: "project" }));
    projects.delete("project-one");
    finish(new ArrayBuffer(32));
    await expect(beforeDelete).rejects.toMatchObject({ code: "not_found" });
    expect(createUrl).not.toHaveBeenCalled();
    expect(await instance.media.listPersonalAssets(workspaceId)).toHaveLength(16);
  });

  it("owns upload bytes and metadata before yielding to an asynchronous digest", async () => {
    const instance = store();
    let finish!: (hash: ArrayBuffer) => void;
    let capturedBody!: ArrayBuffer;
    vi.spyOn(crypto.subtle, "digest").mockImplementation((_algorithm, body) => {
      capturedBody = body as ArrayBuffer;
      return new Promise((resolve) => { finish = resolve; });
    });
    const input = upload();
    const importing = instance.importFile(input);
    new Uint8Array(input.body).fill(9);
    input.mediaKind = "audio";
    input.target = "project";
    input.projectId = "missing";
    input.displayName = "changed after call";
    expect(Array.from(new Uint8Array(capturedBody))).toEqual([1, 2, 3, 4]);
    finish(new ArrayBuffer(32));
    const result = await importing;
    expect(result.asset).toMatchObject({ mediaKind: "image", displayName: "local image.png" });
    expect(result.projectAsset).toBeNull();
  });

  it("releases imported URLs once on disposal and rejects subsequent operations", async () => {
    const instance = store();
    const imported = await instance.importFile(upload());
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    instance.dispose();
    instance.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith(imported.asset.contentUrl);
    await expect(instance.importFile(upload())).rejects.toMatchObject({ serviceCode: "experience_disposed" });
    await expect(instance.media.listPersonalAssets(workspaceId)).rejects.toMatchObject({ serviceCode: "experience_disposed" });
  });
});
