// @vitest-environment jsdom
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../application/shared/ApplicationError";
import { canonicalizeLegacyCanvasDocumentV1 } from "../contracts/canvas-document-v1";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import type { SessionActor } from "../domain/identity/session";
import type { ProjectSummary } from "../domain/project/project";
import { useCanvasSaveRecovery } from "./useCanvasSaveRecovery";
import type { CanvasMessage, LegacyCanvasContext } from "./bridge-protocol";

afterEach(cleanup);
const context: LegacyCanvasContext = { protocolVersion: 1, workspaceId: "workspace", projectId: "project", canvasId: "main",
  projectName: "项目", theme: "light", writable: true, actor: { account: "original@reelay.test", displayName: "原用户" },
  workspace: { name: "组织", role: "member" } };
const actor: SessionActor = { id: "actor", account: context.actor.account, displayName: "原用户", workspaceIds: ["workspace"] };
const content = canonicalizeLegacyCanvasDocumentV1({ kind: "reelay-legacy-canvas", version: 1, activeCanvasId: "one", canvases: [
  { id: "one", name: "本地画布1", nodes: [{ id: "same", kind: "generator", mediaKind: "image", prompt: "第一画布未保存" }] },
  { id: "two", name: "本地画布2", nodes: [{ id: "same", kind: "generator", mediaKind: "video", prompt: "第二画布未保存" }] },
] })!;
const snapshot: Extract<CanvasMessage, { type: "canvas:recovery-snapshot" }> = {
  source: "reelay-legacy-canvas", type: "canvas:recovery-snapshot", protocolVersion: 1, instanceId: "frame", requestId: "request",
  projectId: "project", canvasId: "main", schemaVersion: 1, expectedRevision: 3, content,
};
function setup(reason: "authentication" | "conflict" = "authentication") {
  const document: CanvasDocument = { id: "main", projectId: "project", schemaVersion: 1, revision: 3, content };
  const services = {
    sessionGateway: { getCurrent: vi.fn(async (): Promise<{ actor: SessionActor | null }> => ({ actor })),
      signInWithPassword: vi.fn(async () => ({ actor })), signOut: vi.fn(async () => {}) },
    projectRepository: { getById: vi.fn(async (): Promise<ProjectSummary | null> => ({ id: "project", workspaceId: "workspace",
      name: "项目", currentUserRole: "edit", accessKind: "collaborative", updatedAt: "2026-09-01T00:00:00Z", coverAssetId: null })),
      listByWorkspace: vi.fn(), create: vi.fn(), update: vi.fn(), moveToTrash: vi.fn() },
  };
  const repository = { getCanvasDocument: vi.fn(async () => document),
    save: vi.fn(async (input: { content: unknown; expectedRevision: number; expectedActorId?: string }) => ({ ...document, revision: input.expectedRevision + 1, content: input.content })) };
  const options = { context, actorId: actor.id, services, repository, post: vi.fn(), onRecovered: vi.fn() };
  const hook = renderHook((props) => useCanvasSaveRecovery(props), { initialProps: options });
  act(() => { hook.result.current.begin(reason, "request", "frame"); hook.result.current.accept(snapshot); });
  return { ...hook, options, services, repository, document };
}

describe("canvas save recovery", () => {
  it("reuses the original account and resumes the same revision without saving the stale failed request", async () => {
    const test = setup();
    await act(() => test.result.current.run("authenticate", "password"));
    expect(test.services.sessionGateway.signInWithPassword).toHaveBeenCalledWith({ account: actor.account, password: "password" });
    expect(test.repository.save).not.toHaveBeenCalled();
    expect(test.options.post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:recovery", action: "resume", document: test.document }));
    expect(test.result.current.state?.busy).toBe(true);
    act(() => test.result.current.accept({ ...snapshot, type: "canvas:recovery-applied", applied: true } as CanvasMessage));
    expect(test.result.current.state).toBeNull();
    expect(test.options.onRecovered).toHaveBeenCalledWith(test.document, true, true);
  });
  it("changes to conflict if the document advanced during reauthentication", async () => {
    const test = setup(); test.repository.getCanvasDocument.mockResolvedValue({ ...test.document, revision: 4 });
    await act(() => test.result.current.run("authenticate", "password"));
    expect(test.result.current.state?.reason).toBe("conflict");
    expect(test.result.current.state?.snapshot?.content).toEqual(content);
    expect(test.options.post).not.toHaveBeenCalled(); expect(test.repository.save).not.toHaveBeenCalled();
  });
  it("asks for the original login when another account is current and never writes its project", async () => {
    const test = setup("conflict"); test.services.sessionGateway.getCurrent.mockResolvedValue({ actor: { ...actor, id: "other" } });
    await act(() => test.result.current.run("copy"));
    expect(test.result.current.state?.reason).toBe("authentication");
    expect(test.repository.save).not.toHaveBeenCalled(); expect(test.services.projectRepository.getById).not.toHaveBeenCalled();
  });
  it("does not proceed on a mismatched sign-in response", async () => {
    const test = setup(); test.services.sessionGateway.signInWithPassword.mockResolvedValue({ actor: { ...actor, id: "other" } });
    await act(() => test.result.current.run("authenticate", "password"));
    expect(test.result.current.state?.reason).toBe("authentication"); expect(test.repository.getCanvasDocument).not.toHaveBeenCalled();
  });
  it("revalidates write permission but allows an explicit latest read in a now-read-only project", async () => {
    const test = setup("conflict");
    const project = (await test.services.projectRepository.getById())!;
    test.services.projectRepository.getById.mockResolvedValue({ ...project, currentUserRole: "view" });
    await act(() => test.result.current.run("copy"));
    expect(test.repository.save).not.toHaveBeenCalled(); expect(test.result.current.state?.error).toContain("无编辑权限");
    await act(() => test.result.current.run("latest"));
    expect(test.options.post).toHaveBeenCalledWith(expect.objectContaining({ action: "replace", writable: false }));
  });
  it("saves all local canvases as new IDs with the newest revision and an actor-bound write", async () => {
    const test = setup("conflict");
    const remote = { ...content, canvases: content.canvases.map((canvas) => ({ ...canvas, name: `线上${canvas.name}` })) };
    test.repository.getCanvasDocument.mockResolvedValue({ ...test.document, revision: 8, content: remote });
    await act(() => test.result.current.run("copy"));
    const input = test.repository.save.mock.calls[0]![0];
    expect(input.expectedRevision).toBe(8); expect(input.expectedActorId).toBe("actor");
    const written = canonicalizeLegacyCanvasDocumentV1(input.content)!;
    expect(written.canvases.slice(0, 2)).toEqual(remote.canvases);
    const copies = written.canvases.slice(2);
    expect(copies).toHaveLength(2); expect(copies.every((canvas) => canvas.name.endsWith(" · 恢复副本"))).toBe(true);
    expect(copies[0]!.id).not.toBe("one"); expect(copies[1]!.id).not.toBe("two");
    expect(copies[0]!.nodes[0]!.id).not.toBe("same"); expect(copies[1]!.nodes[0]!.id).not.toBe(copies[0]!.nodes[0]!.id);
    expect(copies[0]!.nodes[0]!.prompt).toBe("第一画布未保存"); expect(copies[1]!.nodes[0]!.prompt).toBe("第二画布未保存");
  });
  it("retains the recovery snapshot and IDs across another CAS conflict", async () => {
    const test = setup("conflict"); test.repository.save.mockRejectedValueOnce(new ApplicationError("conflict", "conflict"));
    await act(() => test.result.current.run("copy"));
    const first = test.repository.save.mock.calls[0]![0].content;
    expect(test.result.current.state?.busy).toBe(false); expect(test.result.current.state?.snapshot).toEqual(snapshot);
    await act(() => test.result.current.run("copy"));
    expect(test.repository.save.mock.calls[1]![0].content).toEqual(first);
  });
  it("does not duplicate copies when the previous save committed but its response was lost", async () => {
    const test = setup("conflict");
    test.repository.save.mockImplementationOnce(async (input) => {
      test.repository.getCanvasDocument.mockResolvedValue({ ...test.document, revision: 4, content: input.content });
      throw new ApplicationError("request_failed", "lost reply");
    });
    await act(() => test.result.current.run("copy"));
    await act(() => test.result.current.run("copy"));
    expect(test.repository.save).toHaveBeenCalledTimes(1);
    expect(test.options.post).toHaveBeenCalledWith(expect.objectContaining({ action: "replace", document: expect.objectContaining({ revision: 4 }) }));
  });
  it("rechecks actor identity after reading and never issues a write after the cookie switches", async () => {
    const test = setup("conflict"); test.services.sessionGateway.getCurrent.mockResolvedValueOnce({ actor }).mockResolvedValueOnce({ actor: { ...actor, id: "other" } });
    await act(() => test.result.current.run("copy"));
    expect(test.repository.save).not.toHaveBeenCalled(); expect(test.result.current.state?.reason).toBe("authentication");
  });
  it("does not apply a saved copy if identity changed after the actor-bound request", async () => {
    const test = setup("conflict"); test.services.sessionGateway.getCurrent.mockResolvedValueOnce({ actor }).mockResolvedValueOnce({ actor }).mockResolvedValueOnce({ actor: { ...actor, id: "other" } });
    await act(() => test.result.current.run("copy"));
    expect(test.repository.save).toHaveBeenCalledTimes(1); expect(test.options.post).not.toHaveBeenCalled();
    expect(test.result.current.state?.reason).toBe("authentication");
  });
  it("rejects an obsolete snapshot and ignores pending requests after project navigation", async () => {
    const test = setup();
    act(() => test.result.current.accept({ ...snapshot, content: {}, instanceId: "other-frame" }));
    expect(test.result.current.state?.snapshot).toEqual(snapshot);
    let resolve!: (value: { actor: SessionActor }) => void;
    test.services.sessionGateway.getCurrent.mockReturnValueOnce(new Promise((accept) => { resolve = accept; }));
    let request!: Promise<void>;
    act(() => { request = test.result.current.run("authenticate"); });
    test.rerender({ ...test.options, context: { ...context, projectId: "other-project" } });
    await act(async () => { resolve({ actor }); await request; });
    expect(test.options.post).not.toHaveBeenCalled(); expect(test.result.current.state).toBeNull();
  });
});
