import { afterEach, describe, expect, it, vi } from "vitest";

import type { ImportTransientMediaInput } from "../../application/assets/TransientMediaRepository";
import { DEMO_ASSET_FIXTURES, DEMO_ENTITY_FIXTURES } from "../../config/entity-demo-fixtures";
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
    expect(await first.media.listPersonalAssets(workspaceId)).toHaveLength(13);
    expect(await second.media.listPersonalAssets(workspaceId)).toHaveLength(12);
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
    expect((await instance.media.listProjectAssets("project-one"))[0]!.displayName).toBe("renamed.png");
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
    expect(await instance.media.listPersonalAssets(workspaceId)).toHaveLength(12);
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
    expect(await instance.media.listPersonalAssets(workspaceId)).toHaveLength(44);
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
    expect(await instance.media.listPersonalAssets(workspaceId)).toHaveLength(12);
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
