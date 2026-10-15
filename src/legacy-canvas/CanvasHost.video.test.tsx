// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasVideoGateway } from "../application/generation/CanvasVideoGateway";
import { ApplicationError } from "../application/shared/ApplicationError";
import { getSeedanceVideoCapability } from "../contracts/seedance-video";
import type { CanvasVideoGenerationContext, CanvasVideoTask } from "../domain/generation/canvas-video-task";
import { CanvasHost } from "./CanvasHost";
import type { LegacyCanvasContext } from "./bridge-protocol";

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
});

const context: LegacyCanvasContext = { protocolVersion: 1, workspaceId: "workspace", projectId: "project-1", projectName: "本机项目", canvasId: "main",
  theme: "light", writable: true, actor: { account: "local@reelay.test", displayName: "创作者" }, workspace: { name: "工作区", role: "owner" } };
const instanceId = "instance-1";
const taskId = "497d08f7-d572-4458-95b7-40fe8b79e214";
const requestKey = "38975aa7-a00d-4ed4-8412-850343a15a27";
const realContext: CanvasVideoGenerationContext = { kind: "real", platformUser: { id: "platform-user", displayName: "真实账号" },
  binding: { projectId: "project-1", platformProjectId: "web-1", platformProjectName: "官网项目" } };
const parameters = { modelId: "seedance-2-fast" as const, model: getSeedanceVideoCapability("seedance-2-fast").model,
  resolution: "480P" as const, aspectRatio: "16:9" as const, duration: 5, generateAudio: true,
  workflow: "omni-reference" as const, generationStage: "standard" as const };
const task: CanvasVideoTask = { id: taskId, requestKey, projectId: "project-1", canvasDocumentId: "main", canvasRecordId: "canvas-1", nodeId: "node-1",
  conversationId: null, sourceSurface: "canvas", prompt: "海边日出", parameters, status: "prepared", result: null,
  createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z", message: "已准备" };
const submit = { source: "reelay-legacy-canvas", type: "canvas:video-generation-command", protocolVersion: 1, instanceId, requestId: "submit-1",
  operation: "submit", requestKey, canvasRecordId: "canvas-1", nodeId: "node-1", conversationId: null, sourceSurface: "canvas", prompt: "海边日出", parameters, references: [] };
const bound = { source: "reelay-legacy-canvas", type: "canvas:video-generation-bound", protocolVersion: 1, instanceId, requestId: "submit-1", taskId, bound: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { resolve, reject, promise };
}

function fixture(generationContext: CanvasVideoGenerationContext = realContext) {
  const gateway = {
    listProjects: vi.fn(async (_expectedActorId: string, page = 1) => ({ items: [{ id: "web-1", name: "官网项目" }], page, hasMore: false })),
    getContext: vi.fn(async () => generationContext),
    bindProject: vi.fn(async () => realContext.kind === "real" ? realContext.binding! : { projectId: "", platformProjectId: "", platformProjectName: "" }),
    prepare: vi.fn(async () => task), activate: vi.fn(async () => ({ ...task, status: "waiting" as const })),
    get: vi.fn(async () => task), list: vi.fn(async () => ({ tasks: [task] })),
    getProjection: vi.fn(async () => ({ ...task, isOwner: false })),
    retrySave: vi.fn(async () => ({ ...task, status: "saving" as const })),
  } satisfies CanvasVideoGateway;
  const repository = { getCanvasDocument: vi.fn(async () => null), save: vi.fn(async () => ({ id: "main", projectId: "project-1", schemaVersion: 1, revision: 1, content: {} })) };
  const view = render(<MemoryRouter><CanvasHost context={context} actorId="actor" repository={repository} canvasVideoGateway={gateway} /></MemoryRouter>);
  const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  const send = (data: unknown, overrides: Partial<MessageEventInit> = {}) => {
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: frame.contentWindow, data, ...overrides })));
  };
  send({ source: "reelay-legacy-canvas", type: "canvas:ready", protocolVersion: 1, instanceId });
  const rerender = (nextContext: LegacyCanvasContext, nextActorId: string | null = "actor") => view.rerender(<MemoryRouter><CanvasHost context={nextContext} actorId={nextActorId ?? undefined} repository={repository}
    canvasVideoGateway={gateway} /></MemoryRouter>);
  return { gateway, repository, frame, post, send, rerender };
}

describe("CanvasHost real video bridge", () => {
  it("destroys the old private iframe realm when the local actor changes within the same project", async () => {
    const { gateway, repository, frame, send, rerender } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    const oldWindow = frame.contentWindow!;
    Reflect.set(oldWindow, "privateGenerationOwner", "actor");
    send(submit);
    await waitFor(() => expect(gateway.prepare).toHaveBeenCalledOnce());
    const nextContext = { ...context, actor: { account: "other@reelay.test", displayName: "另一位创作者" } };
    rerender(nextContext, "other-actor");
    const replacement = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    expect(replacement).not.toBe(frame);
    expect(replacement.src).toBe(frame.src);
    expect(frame.isConnected).toBe(false);
    expect(replacement.contentWindow !== oldWindow).toBe(true);
    expect(Reflect.get(replacement.contentWindow!, "privateGenerationOwner")).toBeUndefined();
    await waitFor(() => expect(repository.getCanvasDocument).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: oldWindow, data: bound })));
    expect(gateway.activate).not.toHaveBeenCalled();
    const post = vi.spyOn(replacement.contentWindow!, "postMessage");
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: replacement.contentWindow,
      data: { source: "reelay-legacy-canvas", type: "canvas:ready", protocolVersion: 1, instanceId: "actor-2-instance" } })));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:init", context: expect.objectContaining({ actor: nextContext.actor }) }), window.location.origin));
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("keeps the current local actor iframe when only their platform connection changes", async () => {
    const { gateway, frame } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    gateway.getContext.mockResolvedValueOnce({ ...realContext, platformUser: { id: "different-platform-user", displayName: "另一个真实账号" } });
    act(() => window.dispatchEvent(new Event("reelay:generation-connection-changed")));
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledTimes(2));
    expect(screen.getByTitle("Reelay 项目画布")).toBe(frame);
  });

  it("disables real capability and private API reads when no trusted local actor is available", async () => {
    const { gateway, rerender } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    rerender(context, null);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => window.dispatchEvent(new MessageEvent("message", { origin: window.location.origin, source: frame.contentWindow,
      data: { source: "reelay-legacy-canvas", type: "canvas:ready", protocolVersion: 1, instanceId: "no-actor-instance" } })));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:init" }), window.location.origin));
    const initialization = post.mock.calls.find(([value]) => value.type === "host:init")?.[0];
    expect(initialization.context.capabilities.realVideoGeneration).not.toBe(true);
    expect(gateway.getContext).toHaveBeenCalledOnce();
    expect(gateway.listProjects).not.toHaveBeenCalled();
  });

  it("uses the frozen host actor for private reads and fails a changed-cookie submit before preparing", async () => {
    const { gateway, post, send } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledExactlyOnceWith("project-1", "actor"));
    send({ source: "reelay-legacy-canvas", type: "canvas:video-generation-command", protocolVersion: 1, instanceId, requestId: "private-list", operation: "list" });
    await waitFor(() => expect(gateway.list).toHaveBeenCalledExactlyOnceWith({ projectId: "project-1", canvasDocumentId: "main", expectedActorId: "actor" }));
    gateway.getContext.mockRejectedValueOnce(new ApplicationError("authentication_required", "当前登录账号已变化。", { serviceCode: "session_actor_changed" }));
    send(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error", requestId: "submit-1",
      code: "session_actor_changed", submissionState: "not-submitted" }), window.location.origin));
    expect(gateway.prepare).not.toHaveBeenCalled(); expect(gateway.activate).not.toHaveBeenCalled();
  });
  it("advertises the available bridge and rechecks connection on every submit", async () => {
    const { gateway, post, send } = fixture({ kind: "simulation", reason: "disconnected" });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:init", context: expect.objectContaining({ capabilities: expect.objectContaining({ realVideoGeneration: true }) }) }), window.location.origin));
    send(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-result", requestId: "submit-1", result: { kind: "simulation", reason: "disconnected" } }), window.location.origin));
    expect(gateway.getContext).toHaveBeenCalledTimes(2);
    expect(gateway.prepare).not.toHaveBeenCalled(); expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("does not activate until the exact prepared task has a durable binding acknowledgement", async () => {
    const { gateway, post, send } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    send(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-bind", task }), window.location.origin));
    expect(gateway.prepare).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: "project-1", canvasDocumentId: "main", requestKey, canvasRecordId: "canvas-1", nodeId: "node-1" }));
    expect(gateway.activate).not.toHaveBeenCalled();
    send({ ...bound, taskId: "55d747b4-9cc8-4a5c-b420-f1c2821e15ea" });
    send({ ...bound, instanceId: "stale-instance" });
    send(bound, { origin: "https://other.example" });
    send(bound, { source: window });
    expect(gateway.activate).not.toHaveBeenCalled();
    send(bound);
    await waitFor(() => expect(gateway.activate).toHaveBeenCalledExactlyOnceWith(taskId, { projectId: "project-1", canvasDocumentId: "main", expectedActorId: "actor" }));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-result", requestId: "submit-1", result: expect.objectContaining({ status: "waiting" }) }), window.location.origin);
  });

  it("keeps the same request replay idempotent before and after response delivery", async () => {
    const { gateway, post, send } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    send(submit); send(submit);
    await waitFor(() => expect(gateway.prepare).toHaveBeenCalledOnce());
    send(bound);
    await waitFor(() => expect(gateway.activate).toHaveBeenCalledOnce());
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-result", requestId: "submit-1" }), window.location.origin));
    send(submit);
    expect(gateway.prepare).toHaveBeenCalledOnce(); expect(gateway.activate).toHaveBeenCalledOnce();
    send({ ...submit, prompt: "different" });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error", code: "request_conflict" }), window.location.origin);
  });

  it("returns storage failure without activating or switching to simulation", async () => {
    const { gateway, post, send } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    send(submit);
    await waitFor(() => expect(gateway.prepare).toHaveBeenCalledOnce());
    send({ ...bound, bound: false });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error", code: "task_not_bound", submissionState: "not-submitted" }), window.location.origin));
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("preserves unknown submission state when activation response is lost after durable binding", async () => {
    const { gateway, post, send } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    gateway.activate.mockRejectedValueOnce(new Error("activation response lost"));
    send(submit);
    await waitFor(() => expect(gateway.prepare).toHaveBeenCalledOnce());
    send(bound);
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error",
      requestId: "submit-1", submissionState: "unknown" }), window.location.origin));
    expect(gateway.activate).toHaveBeenCalledOnce();
  });

  it("uses an error for an unreadable or expired connection and never falls back", async () => {
    const { gateway, post, send } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    gateway.getContext.mockRejectedValueOnce(new Error("unreadable"));
    send(submit);
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error", requestId: "submit-1", code: "request_failed" }), window.location.origin));
    gateway.getContext.mockResolvedValueOnce({ kind: "blocked", reason: "expired" });
    send({ ...submit, requestId: "submit-2" });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error", requestId: "submit-2", code: "authentication_required" }), window.location.origin));
    expect(gateway.prepare).not.toHaveBeenCalled(); expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("rejects unsupported real inputs before opening a project selector or preparing", async () => {
    const { gateway, post, send } = fixture({ ...realContext, binding: null });
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    send({ ...submit, references: [{ url: "/local-reference.png" }] });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error", code: "unsupported" }), window.location.origin));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(gateway.prepare).not.toHaveBeenCalled();
  });

  it("requires explicit project selection and cancellation never prepares a paid task", async () => {
    const { gateway, send } = fixture({ ...realContext, binding: null });
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    send(submit);
    await screen.findByRole("dialog", { name: "选择官网项目" });
    expect(screen.getByRole("combobox")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(gateway.bindProject).not.toHaveBeenCalled(); expect(gateway.prepare).not.toHaveBeenCalled(); expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("saves the selected mapping before preparing and still waits for durable canvas binding", async () => {
    const { gateway, post, send } = fixture({ ...realContext, binding: null });
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    send(submit);
    await screen.findByRole("option", { name: "官网项目" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "web-1" } });
    fireEvent.click(screen.getByRole("button", { name: "关联并继续发送" }));
    await waitFor(() => expect(gateway.prepare).toHaveBeenCalledOnce());
    expect(gateway.bindProject).toHaveBeenCalledExactlyOnceWith("project-1", "web-1", "actor");
    expect(gateway.listProjects).toHaveBeenCalledExactlyOnceWith("actor", 1);
    expect(gateway.bindProject.mock.invocationCallOrder[0]).toBeLessThan(gateway.prepare.mock.invocationCallOrder[0]!);
    expect(gateway.activate).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-bind" }), window.location.origin);
  });

  it.each(["scope", "instance", "permission"] as const)("prevents stale activation after a %s change", async (change) => {
    const { gateway, send, rerender } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    const prepared = deferred<CanvasVideoTask>(); gateway.prepare.mockReturnValueOnce(prepared.promise);
    send(submit);
    await waitFor(() => expect(gateway.prepare).toHaveBeenCalledOnce());
    if (change === "scope") rerender({ ...context, projectId: "project-2" });
    if (change === "permission") rerender({ ...context, writable: false });
    if (change === "instance") send({ source: "reelay-legacy-canvas", type: "canvas:ready", protocolVersion: 1, instanceId: "new-instance" });
    await act(async () => prepared.resolve(task));
    send(bound);
    expect(gateway.activate).not.toHaveBeenCalled();
  });

  it("rejects forged authority and cross-project task reads, including projection", async () => {
    const { gateway, post, send } = fixture();
    await waitFor(() => expect(gateway.getContext).toHaveBeenCalledOnce());
    send({ ...submit, projectId: "forged" });
    send({ ...submit, expectedActorId: "forged" });
    expect(gateway.prepare).not.toHaveBeenCalled();
    gateway.list.mockResolvedValueOnce({ tasks: [{ ...task, projectId: "foreign" }] });
    send({ source: "reelay-legacy-canvas", type: "canvas:video-generation-command", protocolVersion: 1, instanceId, requestId: "read-list", operation: "list" });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-error", requestId: "read-list", code: "forbidden" }), window.location.origin));
    send({ source: "reelay-legacy-canvas", type: "canvas:video-generation-command", protocolVersion: 1, instanceId, requestId: "projection", operation: "projection", taskId });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-result", requestId: "projection", result: expect.objectContaining({ isOwner: false }) }), window.location.origin));
    const response = post.mock.calls.find(([value]) => value.type === "host:video-generation-result" && value.requestId === "projection")?.[0];
    expect(response.result.prompt).toBeUndefined(); expect(response.result.conversationId).toBeUndefined();
  });
});
