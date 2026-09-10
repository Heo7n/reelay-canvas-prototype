import { afterEach, describe, expect, it, vi } from "vitest";

import type { CanvasDocument } from "../../domain/canvas/canvas-document";
import { createExperienceServices, EXPERIENCE_WORKSPACE_ID, type ExperienceServices } from "./createExperienceServices";

const instances: ExperienceServices[] = [];
const workspaceId = EXPERIENCE_WORKSPACE_ID;

function createServices() {
  const services = createExperienceServices();
  instances.push(services);
  return services;
}

function documentInput(projectId: string, canvasId = "main", expectedRevision = 0, prompt = "体验草稿") {
  return {
    projectId, canvasId, expectedRevision, schemaVersion: 1,
    content: {
      kind: "reelay-legacy-canvas", version: 1, activeCanvasId: "canvas-1",
      canvases: [{ id: "canvas-1", nodes: [{ id: "node-1", kind: "generator", prompt }] }],
    },
  };
}

afterEach(() => {
  instances.splice(0).forEach((services) => services.transientMediaRepository.dispose());
  vi.unstubAllGlobals();
});

describe("experience application services", () => {
  it("starts with a synthetic visitor, four example projects and empty canvases without HTTP", async () => {
    const fetch = vi.fn(() => { throw new Error("Experience must not request an API."); });
    vi.stubGlobal("fetch", fetch);
    const services = createServices();
    const session = await services.sessionGateway.getCurrent();
    expect(session.actor).toMatchObject({ displayName: "体验访客", workspaceIds: [workspaceId] });
    const context = await services.workspaceContextGateway.load(workspaceId);
    expect(context.actor).toEqual(session.actor);
    expect(context.projects).toHaveLength(4);
    expect(new Set(context.projects.map((project) => project.id)).size).toBe(4);
    expect(context.workspaces).toEqual(await services.workspaceRepository.listForActor(session.actor!.id));
    expect(await services.organizationRepository.listMembers(workspaceId)).toEqual([{
      userId: session.actor!.id, displayName: "体验访客", loginIdentifier: session.actor!.account, role: "owner",
    }]);
    for (const project of context.projects) {
      expect(await services.canvasDocumentRepository.getCanvasDocument(project.id, "main")).toBeNull();
    }
    expect(await services.mediaAssetRepository.listPersonalAssets(workspaceId)).toHaveLength(16);
    expect(await services.entityRepository.listPersonal(workspaceId)).toHaveLength(3);
    expect(await services.sessionGateway.signInWithPassword({ account: "real@private.example", password: "never-used" })).toEqual(session);
    expect(JSON.stringify(context)).not.toMatch(/Hoo|creator@reelay\.test|actor-tianmaochao|workspace-organization-reelay/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("isolates two service instances, including projects, document content and contact changes", async () => {
    const first = createServices();
    const second = createServices();
    const baseline = await second.workspaceContextGateway.load(workspaceId);
    const projectId = baseline.projects[0].id;
    const created = await first.projectRepository.create(workspaceId, { name: "仅第一个实例" });
    await first.projectRepository.update(workspaceId, projectId, { name: "已修改" });
    await first.accountRepository.updateContacts({ contactEmail: "visitor@example.org", contactPhone: "+86 123456789" });
    await first.canvasDocumentRepository.save(documentInput(projectId));
    expect(await second.workspaceContextGateway.load(workspaceId)).toEqual(baseline);
    expect(await second.projectRepository.getById(workspaceId, created.id)).toBeNull();
    expect(await second.canvasDocumentRepository.getCanvasDocument(projectId, "main")).toBeNull();
    await expect(second.canvasDocumentRepository.save(documentInput(created.id))).rejects.toMatchObject({ code: "not_found" });
    expect((await first.sessionGateway.getCurrent()).actor?.contactEmail).toBe("visitor@example.org");
  });

  it("returns independent actor, workspace, project, member and canvas copies", async () => {
    const services = createServices();
    const baseline = await services.workspaceContextGateway.load(workspaceId);
    const changed = await services.workspaceContextGateway.load(workspaceId);
    changed.actor.workspaceIds.length = 0;
    changed.actor.displayName = "should not persist";
    changed.workspaces[0].name = "should not persist";
    changed.projects[0].name = "should not persist";
    expect(await services.workspaceContextGateway.load(workspaceId)).toEqual(baseline);
    const members = await services.organizationRepository.listMembers(workspaceId);
    members[0].displayName = "should not persist";
    expect((await services.organizationRepository.listMembers(workspaceId))[0].displayName).toBe("体验访客");
    const input = documentInput(baseline.projects[0].id);
    const saved = await services.canvasDocumentRepository.save(input);
    input.content.canvases[0].nodes[0].prompt = "mutated input";
    (saved.content as typeof input.content).canvases[0].nodes[0].prompt = "mutated response";
    const read = await services.canvasDocumentRepository.getCanvasDocument(input.projectId, input.canvasId);
    expect((read!.content as typeof input.content).canvases[0].nodes[0].prompt).toBe("体验草稿");
    (read!.content as typeof input.content).canvases[0].nodes.length = 0;
    expect(((await services.canvasDocumentRepository.getCanvasDocument(input.projectId, input.canvasId))!.content as typeof input.content).canvases[0].nodes).toHaveLength(1);
  });

  it("supports project creation, rename and trash while rejecting unknown or foreign scopes", async () => {
    const services = createServices();
    const created = await services.projectRepository.create(workspaceId, { name: "  新创作  " });
    expect(created).toMatchObject({ workspaceId, name: "新创作", currentUserRole: "admin", accessKind: "private", coverAssetId: null });
    const updated = await services.projectRepository.update(workspaceId, created.id, { name: "新的名称", coverAssetId: "demo-cover-character" });
    expect(updated).toMatchObject({ name: "新的名称", coverAssetId: "demo-cover-character" });
    expect(await services.projectRepository.update(workspaceId, created.id, { name: undefined, coverAssetId: null }))
      .toMatchObject({ name: "新的名称", coverAssetId: null });
    await services.canvasDocumentRepository.save(documentInput(created.id));
    await expect(services.projectRepository.moveToTrash("foreign-workspace", created.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(services.projectRepository.update(workspaceId, "foreign-project", { name: "非法" })).rejects.toMatchObject({ code: "not_found" });
    await services.projectRepository.moveToTrash(workspaceId, created.id);
    expect(await services.projectRepository.getById(workspaceId, created.id)).toBeNull();
    expect(await services.projectRepository.listByWorkspace(workspaceId)).toHaveLength(4);
    await expect(services.projectRepository.update(workspaceId, created.id, { name: "cannot restore" })).rejects.toMatchObject({ code: "not_found" });
    await expect(services.projectRepository.moveToTrash(workspaceId, created.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(services.canvasDocumentRepository.getCanvasDocument(created.id, "main")).rejects.toMatchObject({ code: "not_found" });
    await expect(services.canvasDocumentRepository.save(documentInput(created.id, "main", 1))).rejects.toMatchObject({ code: "not_found" });
    await expect(services.mediaAssetRepository.listProjectAssets(created.id)).rejects.toMatchObject({ code: "not_found" });
    const [asset] = await services.mediaAssetRepository.listPersonalAssets(workspaceId);
    await expect(services.mediaAssetRepository.attachToProject(created.id, asset.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps revision checks atomic and isolates each project and canvas document", async () => {
    const services = createServices();
    const [first, second] = await services.projectRepository.listByWorkspace(workspaceId);
    const results = await Promise.allSettled([
      services.canvasDocumentRepository.save(documentInput(first.id)),
      services.canvasDocumentRepository.save(documentInput(first.id)),
    ]);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: { revision: 1 } });
    expect(results[1]).toMatchObject({ status: "rejected", reason: { code: "conflict", details: { currentRevision: 1 } } });
    const changed = await services.canvasDocumentRepository.save(documentInput(first.id, "main", 1, "第二版"));
    expect(changed.revision).toBe(2);
    await services.canvasDocumentRepository.save(documentInput(first.id, "other-canvas", 0, "另一画布"));
    await services.canvasDocumentRepository.save(documentInput(second.id, "main", 0, "另一项目"));
    const prompt = (document: CanvasDocument | null) => (document?.content as ReturnType<typeof documentInput>["content"]).canvases[0].nodes[0].prompt;
    expect(prompt(await services.canvasDocumentRepository.getCanvasDocument(first.id, "main"))).toBe("第二版");
    expect(prompt(await services.canvasDocumentRepository.getCanvasDocument(first.id, "other-canvas"))).toBe("另一画布");
    expect(prompt(await services.canvasDocumentRepository.getCanvasDocument(second.id, "main"))).toBe("另一项目");
  });

  it("signout resets this instance's projects, canvases, contacts and assets while retaining guest access", async () => {
    const services = createServices();
    const baseline = await services.workspaceContextGateway.load(workspaceId);
    const originalAssets = await services.mediaAssetRepository.listPersonalAssets(workspaceId);
    const created = await services.projectRepository.create(workspaceId, { name: "临时新建" });
    await services.projectRepository.update(workspaceId, baseline.projects[0].id, { name: "临时改名" });
    await services.projectRepository.moveToTrash(workspaceId, baseline.projects[1].id);
    await services.accountRepository.updateContacts({ contactEmail: "temporary@example.org", contactPhone: "12345678" });
    await services.canvasDocumentRepository.save(documentInput(baseline.projects[0].id));
    await services.mediaAssetRepository.renamePersonalAsset(workspaceId, originalAssets[0].id, "临时素材名");
    const imported = await services.transientMediaRepository.importFile({
      workspaceId, projectId: created.id, target: "personal", displayName: "临时导入",
      mediaKind: "image", contentType: "image/png", body: new ArrayBuffer(8),
    });
    expect(imported.asset.contentUrl).toMatch(/^blob:/);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    await services.sessionGateway.signOut();
    expect(revoke).toHaveBeenCalledWith(imported.asset.contentUrl);
    expect(await services.workspaceContextGateway.load(workspaceId)).toEqual(baseline);
    expect(await services.mediaAssetRepository.listPersonalAssets(workspaceId)).toEqual(originalAssets);
    expect(await services.projectRepository.getById(workspaceId, created.id)).toBeNull();
    expect(await services.canvasDocumentRepository.getCanvasDocument(baseline.projects[0].id, "main")).toBeNull();
    expect((await services.sessionGateway.getCurrent()).actor).toEqual(baseline.actor);
    expect((await services.canvasDocumentRepository.save(documentInput(baseline.projects[0].id))).revision).toBe(1);
  });

  it("rejects invalid mutations without changing any previously stored value", async () => {
    const services = createServices();
    const baseline = await services.workspaceContextGateway.load(workspaceId);
    const projectId = baseline.projects[0].id;
    await expect(services.projectRepository.create(workspaceId, { name: "   " })).rejects.toMatchObject({ code: "request_failed" });
    await expect(services.projectRepository.update(workspaceId, projectId, {})).rejects.toMatchObject({ code: "request_failed" });
    await expect(services.accountRepository.updateContacts({ contactEmail: "not an email", contactPhone: null })).rejects.toMatchObject({ code: "request_failed" });
    await expect(services.canvasDocumentRepository.save({ ...documentInput(projectId), schemaVersion: 2 })).rejects.toMatchObject({ code: "request_failed" });
    await expect(services.canvasDocumentRepository.save({ ...documentInput(projectId), expectedRevision: -1 })).rejects.toMatchObject({ code: "request_failed" });
    await expect(services.canvasDocumentRepository.save({ ...documentInput(projectId), content: { invalid: () => undefined } })).rejects.toMatchObject({ code: "request_failed" });
    expect(await services.workspaceContextGateway.load(workspaceId)).toEqual(baseline);
    expect(await services.canvasDocumentRepository.getCanvasDocument(projectId, "main")).toBeNull();
    expect(await services.workspaceRepository.listForActor("actor-tianmaochao")).toEqual([]);
    expect(await services.workspaceRepository.getById("workspace-organization-reelay")).toBeNull();
    await expect(services.workspaceContextGateway.load("workspace-organization-reelay")).rejects.toMatchObject({ code: "not_found" });
    await expect(services.organizationRepository.listMembers("workspace-organization-reelay")).rejects.toMatchObject({ code: "not_found" });
  });
});
