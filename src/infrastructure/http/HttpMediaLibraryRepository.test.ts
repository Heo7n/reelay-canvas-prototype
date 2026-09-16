import { describe, expect, it, vi } from "vitest";
import { HttpMediaLibraryRepository } from "./HttpMediaLibraryRepository";
import { HttpResponseValidationError } from "./HttpApiClient";

describe("HttpMediaLibraryRepository", () => {
  it("moves groups with observed locations and parses directory dates while retaining conflict details", async () => {
    const catalog = { folders: [], tags: [], entries: [], entityEntries: [{ entityId: "group", space: "personal", folderId: "folder", addedAt: "2026-09-16T00:00:00.000Z", tagIds: [] }] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ catalog }))
      .mockResolvedValueOnce(Response.json({ error: { code: "placement_changed", message: "素材组已被移动" } }, { status: 409 }));
    const repository = new HttpMediaLibraryRepository({ fetch });
    const input = { workspaceId: "scope/name", space: "personal" as const, folderId: "folder", items: [{ entityId: "group", expectedFolderId: null }] };
    expect(await repository.moveEntities(input)).toEqual(catalog);
    expect(fetch.mock.calls[0]![0]).toBe("/api/workspaces/scope%2Fname/media-library/move-entities");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ space: "personal", folderId: "folder", items: input.items });
    await expect(repository.moveEntities(input)).rejects.toMatchObject({ code: "conflict", serviceCode: "placement_changed" });
  });

  it("deletes a scoped tag with its observed usage and preserves count conflicts", async () => {
    const catalog = { folders: [], tags: [], entries: [], entityEntries: [] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ catalog }))
      .mockResolvedValueOnce(Response.json({ catalog: { entries: [] } }))
      .mockResolvedValueOnce(Response.json({ error: { code: "tag_usage_changed", message: "标签使用情况已更新" } }, { status: 409 }));
    const repository = new HttpMediaLibraryRepository({ fetch });
    const input = { workspaceId: "scope/name", space: "personal" as const, tagId: "custom", expectedUsageCount: 2 };
    expect(await repository.deleteTag(input)).toEqual(catalog);
    expect(fetch.mock.calls[0]![0]).toBe("/api/workspaces/scope%2Fname/media-library/tags/delete");
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ space: "personal", tagId: "custom", expectedUsageCount: 2 });
    await expect(repository.deleteTag(input)).rejects.toBeInstanceOf(HttpResponseValidationError);
    await expect(repository.deleteTag(input)).rejects.toMatchObject({ code: "conflict", serviceCode: "tag_usage_changed" });
  });

  it("posts tag deltas in the URL-owned scope and validates independent group tags in the result", async () => {
    const catalog = { folders: [], tags: [], entries: [], entityEntries: [{ entityId: "group", space: "personal", tagIds: ["builtin:scene"] }] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ catalog }))
      .mockResolvedValueOnce(Response.json({ catalog: { ...catalog, entityEntries: [{ entityId: "group", tagIds: [] }] } }))
      .mockResolvedValueOnce(Response.json({ error: { code: "tag_not_found", message: "标签不属于当前空间" } }, { status: 400 }));
    const repository = new HttpMediaLibraryRepository({ fetch });
    const input = { workspaceId: "scope/name", space: "personal" as const, operation: "add" as const,
      tagIds: ["builtin:scene"], items: [{ kind: "media" as const, id: "asset" }, { kind: "entity" as const, id: "group" }] };
    expect(await repository.updateTags(input)).toEqual(catalog);
    expect(fetch.mock.calls[0]![0]).toBe("/api/workspaces/scope%2Fname/media-library/tags/update");
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ space: input.space, operation: input.operation, tagIds: input.tagIds, items: input.items });
    await expect(repository.updateTags(input)).rejects.toBeInstanceOf(HttpResponseValidationError);
    await expect(repository.updateTags(input)).rejects.toMatchObject({ serviceCode: "tag_not_found", message: "标签不属于当前空间" });
  });

  it("sends scoped requests and validates catalog and creation envelopes", async () => {
    const catalog = { folders: [], tags: [], entries: [] };
    const folder = { id: "folder", space: "organization", name: "参考", parentId: null };
    const tag = { id: "tag", space: "organization", name: "项目A" };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ catalog }))
      .mockResolvedValueOnce(Response.json({ folder })).mockResolvedValueOnce(Response.json({ tag }))
      .mockResolvedValueOnce(Response.json({ catalog }));
    const repository = new HttpMediaLibraryRepository({ fetch });
    expect(await repository.list("scope/name")).toEqual(catalog);
    expect(await repository.createFolder({ workspaceId: "scope/name", space: "organization", parentId: null, name: "参考" })).toEqual(folder);
    expect(await repository.createTag({ workspaceId: "scope/name", space: "organization", name: "项目A" })).toEqual(tag);
    const input = { workspaceId: "scope/name", projectId: "project", space: "organization" as const,
      folderId: "folder", tagIds: ["tag"], items: [{ assetId: "asset", displayName: "素材", action: "save" as const }] };
    expect(await repository.save(input)).toEqual(catalog);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/workspaces/scope%2Fname/media-library", "/api/workspaces/scope%2Fname/media-library/folders",
      "/api/workspaces/scope%2Fname/media-library/tags", "/api/workspaces/scope%2Fname/media-library/save",
    ]);
    const body = JSON.parse(fetch.mock.calls[3]![1].body);
    expect(body).toMatchObject({ projectId: "project", folderId: "folder", items: input.items });
    expect(body).not.toHaveProperty("workspaceId");
    expect(fetch.mock.calls[3]![1].credentials).toBe("include");
  });

  it("sends deletion as a scoped atomic selection and preserves conflict messages", async () => {
    const catalog = { folders: [], tags: [], entries: [] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ catalog })).mockResolvedValueOnce(Response.json({ error: { code: "library_item_in_use", message: "素材仍被素材组引用" } }, { status: 409 }));
    const repository = new HttpMediaLibraryRepository({ fetch });
    const input = { workspaceId: "workspace/name", space: "personal" as const, items: [{ kind: "entity" as const, id: "group", expectedVersion: 4 }, { kind: "folder" as const, id: "folder" }] };
    expect(await repository.delete(input)).toEqual(catalog);
    expect(fetch.mock.calls[0][0]).toBe("/api/workspaces/workspace%2Fname/media-library/delete");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ space: "personal", items: input.items });
    await expect(repository.delete(input)).rejects.toMatchObject({ code: "conflict", serviceCode: "library_item_in_use" });
  });

  it("renames the scoped folder with the observed name and validates the updated folder", async () => {
    const folder = { id: "folder", space: "personal", parentId: "parent", name: "Renamed" };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ folder })).mockResolvedValueOnce(Response.json({ error: { code: "folder_changed", message: "文件夹名称已更新" } }, { status: 409 }));
    const repository = new HttpMediaLibraryRepository({ fetch });
    const input = { workspaceId: "scope/name", space: "personal" as const, folderId: "folder", name: "Renamed", expectedName: "Original" };
    expect(await repository.renameFolder(input)).toEqual(folder);
    expect(fetch.mock.calls[0][0]).toBe("/api/workspaces/scope%2Fname/media-library/rename-folder");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ space: "personal", folderId: "folder", name: "Renamed", expectedName: "Original" });
    await expect(repository.renameFolder(input)).rejects.toMatchObject({ code: "conflict", serviceCode: "folder_changed" });
  });

  it("rejects malformed successes and preserves actionable server errors", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ catalog: { entries: [] } }))
      .mockResolvedValueOnce(Response.json({ error: { code: "explicit_move_required", message: "请明确移动" } }, { status: 409 }));
    const repository = new HttpMediaLibraryRepository({ fetch });
    await expect(repository.list("scope")).rejects.toBeInstanceOf(HttpResponseValidationError);
    await expect(repository.createFolder({ workspaceId: "scope", space: "personal", parentId: null, name: "参考" }))
      .rejects.toMatchObject({ code: "conflict", serviceCode: "explicit_move_required", message: "请明确移动" });
  });
});
