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
    expect(selected.tagIds).toContain(example.builtinTagId);
    expect(catalog.tags.filter((tag) => selected.tagIds.includes(tag.id)).map((tag) => tag.name)).toEqual([example.customTagName]);
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
