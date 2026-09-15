import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { WorkspaceMediaAssetStore } from "../application/WorkspaceMediaAssetStore";
import type { ProjectAssetReferenceStore } from "../application/ProjectAssetReferenceStore";
import type { EntityStore } from "../application/EntityStore";
import type { SaveLibraryInput } from "../../domain/asset/media-library";

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
      expect(await store.listLibrary(context)).toEqual(before);
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
