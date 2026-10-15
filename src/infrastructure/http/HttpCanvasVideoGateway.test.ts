import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../../application/shared/ApplicationError";
import { getSeedanceVideoCapability } from "../../contracts/seedance-video";
import { HttpApiClient, HttpResponseValidationError, type FetchLike } from "./HttpApiClient";
import { HttpCanvasVideoGateway } from "./HttpCanvasVideoGateway";

const scope = { projectId: "project-1", canvasDocumentId: "main", expectedActorId: "actor-1" };
const taskId = "497d08f7-d572-4458-95b7-40fe8b79e214";
const input = {
  ...scope, requestKey: "38975aa7-a00d-4ed4-8412-850343a15a27", canvasRecordId: "canvas-1", nodeId: "node-1",
  sourceSurface: "canvas" as const, prompt: "海边日出", references: [] as [],
  parameters: { modelId: "seedance-2-fast" as const, model: getSeedanceVideoCapability("seedance-2-fast").model,
    resolution: "480P" as const, aspectRatio: "16:9" as const, duration: 5, generateAudio: true,
    workflow: "omni-reference" as const, generationStage: "standard" as const },
};
const task = { ...input, references: undefined, id: taskId, conversationId: null, status: "prepared", result: null,
  createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z", message: "已准备" };
function setup(...payloads: unknown[]) {
  const fetch = vi.fn<FetchLike>(async () => new Response(JSON.stringify(payloads.shift()), { headers: { "Content-Type": "application/json" } }));
  return { fetch, gateway: new HttpCanvasVideoGateway(new HttpApiClient({ fetch })) };
}

describe("HttpCanvasVideoGateway", () => {
  it("separates preparation from activation and uses trusted local scope with cookie auth", async () => {
    const { gateway, fetch } = setup({ kind: "simulation", reason: "disconnected" },
      { projectId: "project-1", platformProjectId: "web-1", platformProjectName: "官网项目" }, task, { ...task, status: "waiting" });
    await gateway.getContext(scope.projectId, scope.expectedActorId);
    await gateway.bindProject(scope.projectId, "web-1", scope.expectedActorId);
    await gateway.prepare(input);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ ...input, conversationId: null });
    await gateway.activate(taskId, scope);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/canvas-video-generation/context?projectId=project-1&expectedActorId=actor-1", "/api/canvas-video-generation/binding",
      "/api/canvas-video-generation/tasks/prepare", `/api/canvas-video-generation/tasks/${taskId}/activate?projectId=project-1&canvasDocumentId=main&expectedActorId=actor-1`,
    ]);
    for (const [, options] of fetch.mock.calls) {
      expect(options?.credentials).toBe("include");
      expect(new Headers(options?.headers).has("Authorization")).toBe(false);
    }
  });

  it("reads and retries storage without resubmitting a paid generation", async () => {
    const { gateway, fetch } = setup(task, { tasks: [task] }, { ...task, status: "saving" });
    await gateway.get(taskId, scope);
    await gateway.list(scope);
    await gateway.retrySave(taskId, scope);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      `/api/canvas-video-generation/tasks/${taskId}?projectId=project-1&canvasDocumentId=main&expectedActorId=actor-1`,
      "/api/canvas-video-generation/tasks?projectId=project-1&canvasDocumentId=main&expectedActorId=actor-1",
      `/api/canvas-video-generation/tasks/${taskId}/retry-save?projectId=project-1&canvasDocumentId=main&expectedActorId=actor-1`,
    ]);
  });

  it("guards project-list and projection reads with the frozen local actor", async () => {
    const { gateway, fetch } = setup({ items: [], page: 2, hasMore: false }, { ...task, isOwner: false });
    await gateway.listProjects(scope.expectedActorId, 2);
    await gateway.getProjection(taskId, scope);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      "/api/canvas-video-generation/projects?expectedActorId=actor-1&page=2",
      `/api/canvas-video-generation/tasks/${taskId}/projection?projectId=project-1&canvasDocumentId=main&expectedActorId=actor-1`,
    ]);
  });

  it("rejects a missing actor precondition locally instead of sending private requests", async () => {
    const { gateway, fetch } = setup();
    await expect(gateway.getContext(scope.projectId)).rejects.toBeInstanceOf(ApplicationError);
    await expect(gateway.bindProject(scope.projectId, "web-1")).rejects.toBeInstanceOf(ApplicationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates a cookie actor mismatch without retrying or activating another actor's task", async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ error: {
      code: "session_actor_changed", message: "当前登录账号已变化，请使用原账号继续。",
    } }), { status: 401, headers: { "Content-Type": "application/json" } }));
    const gateway = new HttpCanvasVideoGateway(new HttpApiClient({ fetch }));
    await expect(gateway.getContext(scope.projectId, scope.expectedActorId)).rejects.toMatchObject({ code: "authentication_required", serviceCode: "session_actor_changed" });
    await expect(gateway.listProjects(scope.expectedActorId)).rejects.toMatchObject({ serviceCode: "session_actor_changed" });
    await expect(gateway.prepare(input)).rejects.toMatchObject({ serviceCode: "session_actor_changed" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.some(([path]) => String(path).includes("activate"))).toBe(false);
  });

  it.each(["get", "list"] as const)("rejects cross-project %s responses", async (operation) => {
    const forged = { ...task, projectId: "other-project" };
    const { gateway } = setup(operation === "get" ? forged : { tasks: [forged] });
    await expect(operation === "get" ? gateway.get(taskId, scope) : gateway.list(scope)).rejects.toBeInstanceOf(ApplicationError);
  });

  it("does not retry preparation automatically when its response is lost", async () => {
    const fetch = vi.fn<FetchLike>(async () => { throw new Error("network"); });
    const gateway = new HttpCanvasVideoGateway(new HttpApiClient({ fetch }));
    await expect(gateway.prepare(input)).rejects.toBeInstanceOf(ApplicationError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/canvas-video-generation/tasks/prepare");
  });

  it("rejects a remote signed result URL before a browser can receive it", async () => {
    const { gateway } = setup({ ...task, status: "succeeded", result: {
      id: "9e77921c-6205-44d4-bdf7-be0ee9f0a492", taskId, projectId: scope.projectId,
      url: "https://platform.example/video?token=private", contentType: "video/mp4", byteSize: 32,
    } });
    await expect(gateway.get(taskId, scope)).rejects.toBeInstanceOf(HttpResponseValidationError);
  });
});
