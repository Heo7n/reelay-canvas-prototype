// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalizeLegacyCanvasDocumentEnvelopeV1 } from "../contracts/canvas-document-v1";
import { HttpApiClient, type FetchLike } from "../infrastructure/http/HttpApiClient";
import { HttpCanvasDocumentRepository } from "../infrastructure/http/HttpCanvasDocumentRepository";
import { HttpCanvasVideoGateway } from "../infrastructure/http/HttpCanvasVideoGateway";
import { buildServer } from "../server/app";
import { DEMO_PASSWORD } from "../server/demo-fixtures";
import { InMemoryCanvasVideoGenerationStore } from "../server/infrastructure/InMemoryCanvasVideoGenerationStore";
import { InMemoryCollaborationStore } from "../server/infrastructure/InMemoryCollaborationStore";
import { InMemoryObjectStore } from "../server/infrastructure/InMemoryObjectStore";
import { REELAY_PLATFORM_BASE } from "../server/infrastructure/ReelayPlatformClient";
import { CanvasHost } from "./CanvasHost";
import type { LegacyCanvasContext } from "./bridge-protocol";

const projectId = "project-scifi-trailer";
const actorId = "actor-tianmaochao";
const instanceId = "isolated-http-canvas";
const videoUrl = `${REELAY_PLATFORM_BASE}/generated/isolated-test.mp4`;
const bytes = Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109]);
const eventFrame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const platformJson = (data: unknown) => new Response(JSON.stringify({ code: 200, data }), { headers: { "Content-Type": "application/json" } });
let server: FastifyInstance | null = null;

afterEach(async () => {
  cleanup();
  await server?.close(); server = null;
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe("CanvasHost canonical HTTP video binding", () => {
  it("persists the task reference through both canonical boundaries before activating one fake video", async () => {
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", "");
    let executions = 0;
    const fakePlatform: typeof fetch = async (request, init) => {
      const url = String(request);
      if (url.endsWith("/auth/login")) return platformJson({ token: "isolated-fake-token", user: { id: "fake-platform-owner", nickname: "隔离测试账号" } });
      if (url.includes("/api/v1/projects?")) return platformJson({ items: [{ id: "fake-remote-project", name: "隔离官网项目" }], total: 1 });
      if (url.endsWith("/api/v1/assets") && init?.method === "POST") return platformJson({ id: "fake-placeholder", type: "video", project_id: "fake-remote-project" });
      if (url.endsWith("/api/v1/artifacts") && init?.method === "POST") return platformJson({ id: "fake-artifact", type: "video", project_id: "fake-remote-project", asset_id: "fake-placeholder" });
      if (url.endsWith("/artifacts/generate-stream")) {
        executions += 1;
        return new Response(eventFrame({ type: "artifact_status", content: { artifacts: [{ id: "fake-artifact", type: "video", status: 3, asset_id: "fake-output" }] } })
          + eventFrame({ type: "asset_status", content: { assets: [{ id: "fake-output", type: "video", status: 3, file_url: videoUrl }] } })
          + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
      }
      if (url === videoUrl || url.startsWith(`${REELAY_PLATFORM_BASE}/proxy-image?`)) return new Response(bytes, { headers: { "Content-Type": "video/mp4" } });
      throw new Error(`Unexpected isolated fake request: ${new URL(url).pathname}`);
    };
    const documents = new InMemoryCollaborationStore();
    const tasks = new InMemoryCanvasVideoGenerationStore(documents);
    server = await buildServer({ store: documents, canvasVideoStore: tasks, objectStore: new InMemoryObjectStore(), realGeneration: { enabled: true, fetcher: fakePlatform } });
    const login = await server.inject({ method: "POST", url: "/api/demo/session", payload: { account: "creator@reelay.test", password: DEMO_PASSWORD } });
    expect(login.statusCode).toBe(201);
    const cookieValue = login.headers["set-cookie"];
    const cookie = (Array.isArray(cookieValue) ? cookieValue[0] : cookieValue)!.split(";", 1)[0];
    expect((await server.inject({ method: "POST", url: "/api/real-generation/connection", headers: { cookie },
      payload: { type: "email", target: "isolated@test.invalid", password: "isolated-fake-password" } })).statusCode).toBe(200);
    const calls: { path: string; method: string; status: number }[] = [];
    let releaseSaveAck!: () => void;
    const saveAck = new Promise<void>((resolve) => { releaseSaveAck = resolve; });
    const injectedFetch: FetchLike = async (request, init) => {
      const path = String(request);
      const method = (init?.method || "GET") as "GET" | "PUT" | "POST" | "DELETE";
      const response = await server!.inject({ method, url: path, headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), cookie },
        ...(init?.body !== undefined ? { payload: String(init.body) } : {}) });
      calls.push({ path, method, status: response.statusCode });
      if (method === "PUT" && path.endsWith("/document")) await saveAck;
      return new Response(response.body, { status: response.statusCode, headers: { "Content-Type": String(response.headers["content-type"] || "application/json") } });
    };
    const http = new HttpApiClient({ fetch: injectedFetch });
    const gateway = new HttpCanvasVideoGateway(http);
    await gateway.listProjects(actorId);
    await gateway.bindProject(projectId, "fake-remote-project", actorId);
    const repository = new HttpCanvasDocumentRepository(http);
    const context: LegacyCanvasContext = { protocolVersion: 1, workspaceId: "workspace-studio", projectId, projectName: "科幻预告片", canvasId: "main",
      theme: "light", writable: true, actor: { account: "creator@reelay.test", displayName: "隔离本机账号" }, workspace: { name: "隔离工作区", role: "owner" } };
    render(<MemoryRouter><CanvasHost context={context} actorId={actorId} repository={repository} canvasVideoGateway={gateway} /></MemoryRouter>);
    const iframe = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const post = vi.spyOn(iframe.contentWindow!, "postMessage");
    const send = (payload: unknown) => act(() => window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin, source: iframe.contentWindow, data: payload,
    })));
    send({ source: "reelay-legacy-canvas", type: "canvas:ready", protocolVersion: 1, instanceId });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:init" }), window.location.origin));
    const taskId = randomUUID();
    send({ source: "reelay-legacy-canvas", type: "canvas:video-generation-command", protocolVersion: 1, instanceId, requestId: "real-submit",
      operation: "submit", requestKey: taskId, canvasRecordId: "canvas-1", nodeId: "node-1", conversationId: null, sourceSurface: "canvas", prompt: "一段平稳推进的科幻预告片镜头。",
      parameters: { modelId: "seedance-2-fast", resolution: "480p", aspectRatio: "16:9", duration: 4, generateAudio: true,
        workflow: "omni-reference", generationStage: "standard", count: 1, outputFormat: "mp4", omniReferenceTaskType: "auto" }, references: [] });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:video-generation-bind", task: expect.objectContaining({ id: taskId }) }), window.location.origin));
    expect(executions).toBe(0);
    expect(calls.some((call) => call.path.includes("/activate"))).toBe(false);
    const content = { kind: "reelay-legacy-canvas", version: 1, activeCanvasId: "canvas-1", canvases: [{ id: "canvas-1", name: "主画布",
      nodes: [{ id: "node-1", kind: "generator", mediaKind: "video", mode: "video", x: 0, y: 0, z: 1, model: "seedance-2-fast", aspect: "16:9",
        quality: "480p", duration: "4s", workflow: "omni-reference", prompt: "一段平稳推进的科幻预告片镜头。", realGenerationTaskId: taskId }], groups: [], connections: [], viewport: { x: 0, y: 0, zoom: 1 } }],
      lastPreset: { mode: "video", model: "seedance-2-fast", aspect: "16:9", resolution: "Auto", quality: "480p", duration: "4s", outputFormat: "mp4", count: 1, workflow: "omni-reference", audioEnabled: true } };
    send({ source: "reelay-legacy-canvas", type: "canvas:save", protocolVersion: 1, instanceId, requestId: "bound-save", schemaVersion: 1, expectedRevision: 0, content });
    await waitFor(() => expect(calls.some((call) => call.method === "PUT" && call.path.endsWith("/document") && call.status === 201)).toBe(true));
    const saved = await documents.getCanvasDocument({ actorId, projectId, canvasId: "main" });
    const storedContent = canonicalizeLegacyCanvasDocumentEnvelopeV1(saved!.schemaVersion, saved!.content)!.content;
    expect(storedContent.canvases[0]?.nodes[0]?.realGenerationTaskId).toBe(taskId);
    expect(post.mock.calls.some(([message]) => message.type === "host:save-result")).toBe(false);
    expect(executions).toBe(0);
    expect(calls.some((call) => call.path.includes("/activate"))).toBe(false);
    await act(async () => releaseSaveAck());
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "host:save-result", requestId: "bound-save" }), window.location.origin));
    const acknowledgedDocument = post.mock.calls.find(([message]) => message.type === "host:save-result")?.[0].document;
    expect(acknowledgedDocument.content.canvases[0].nodes[0].realGenerationTaskId).toBe(taskId);
    send({ source: "reelay-legacy-canvas", type: "canvas:video-generation-bound", protocolVersion: 1, instanceId, requestId: "real-submit", taskId, bound: true });
    await waitFor(() => expect(executions).toBe(1));
    const scope = { projectId, canvasDocumentId: "main", expectedActorId: actorId };
    await waitFor(async () => expect((await gateway.get(taskId, scope)).status).toBe("succeeded"));
    expect(calls.filter((call) => call.path.includes("/activate"))).toHaveLength(1);
    expect((await gateway.get(taskId, scope)).result?.url).toBe(`/api/projects/${projectId}/generation-results/${taskId}/video`);
    expect(executions).toBe(1);
  });
});
