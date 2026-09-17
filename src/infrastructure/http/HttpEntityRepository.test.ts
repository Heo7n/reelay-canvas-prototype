import { describe, expect, it, vi } from "vitest";
import { HttpEntityRepository } from "./HttpEntityRepository";
import { HttpResponseValidationError } from "./HttpApiClient";

describe("HttpEntityRepository subject tags", () => {
  it("uses the existing scoped API for organization list, get, create and update", async () => {
    const entity = { id: "subject", space: "organization", workspaceId: "scope", name: "Team subject", description: "", mediaRefs: [{ assetId: "asset", order: 0 }], coverAssetId: "asset", version: 1, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ entities: [entity] }))
      .mockResolvedValueOnce(Response.json({ entity })).mockResolvedValueOnce(Response.json({ entity })).mockResolvedValueOnce(Response.json({ entity }));
    const repository = new HttpEntityRepository({ fetch });
    expect((await repository.listPersonal("scope", "organization"))[0]!.space).toBe("organization");
    expect((await repository.get("scope", "subject", "organization")).space).toBe("organization");
    const input = { workspaceId: "scope", space: "organization" as const, name: "Team subject", description: "", assetIds: ["asset"], coverAssetId: "asset" };
    await repository.create({ ...input, idempotencyKey: "create-team-subject" });
    await repository.update({ ...input, entityId: "subject", expectedVersion: 1 });
    expect(fetch.mock.calls[0]![0]).toBe("/api/workspaces/scope/entities?scope=organization");
    expect(fetch.mock.calls[1]![0]).toBe("/api/workspaces/scope/entities/subject?scope=organization");
    expect(JSON.parse(fetch.mock.calls[2]![1].body).space).toBe("organization");
    expect(JSON.parse(fetch.mock.calls[3]![1].body).space).toBe("organization");
  });

  it("sends placement tags and snapshots with entity saves and reads authoritative tag results", async () => {
    const entity = { id: "subject", workspaceId: "scope", name: "Subject", description: "", mediaRefs: [{ assetId: "asset", order: 0 }], coverAssetId: "asset", version: 1, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z", libraryTagIds: ["builtin:character"] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ entity }))
      .mockResolvedValueOnce(Response.json({ entity: { ...entity, version: 2, libraryTagIds: [] } }))
      .mockResolvedValueOnce(Response.json({ error: { code: "placement_changed", message: "标签已更新" } }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ entity: { ...entity, libraryTagIds: [null] } }));
    const repository = new HttpEntityRepository({ fetch });
    const content = { workspaceId: "scope", name: "Subject", description: "", assetIds: ["asset"], coverAssetId: "asset" };
    expect((await repository.create({ ...content, idempotencyKey: "create-subject", tagIds: ["builtin:character"] })).libraryTagIds).toEqual(["builtin:character"]);
    expect(JSON.parse(fetch.mock.calls[0]![1].body).tagIds).toEqual(["builtin:character"]);
    const update = { ...content, entityId: "subject", expectedVersion: 1, tagIds: [], expectedTagIds: ["builtin:character"] };
    expect((await repository.update(update)).libraryTagIds).toEqual([]);
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toMatchObject({ tagIds: [], expectedTagIds: ["builtin:character"] });
    await expect(repository.update(update)).rejects.toMatchObject({ code: "conflict", serviceCode: "placement_changed" });
    await expect(repository.get("scope", "subject")).rejects.toBeInstanceOf(HttpResponseValidationError);
  });
});
