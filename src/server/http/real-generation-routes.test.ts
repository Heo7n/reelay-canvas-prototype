import { randomUUID } from "node:crypto";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationProbe, StartGenerationProbe } from "../../contracts/real-generation";
import { buildServer } from "../app";
import { DEMO_PASSWORD } from "../demo-fixtures";
import { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";
import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";
import { REELAY_PLATFORM_BASE } from "../infrastructure/ReelayPlatformClient";

const secret = "private-platform-jwt";
const videoUrl = `${REELAY_PLATFORM_BASE}/generated/video.mp4?signature=private-result-signature`;
const videoBytes = Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109]);
const output = (url = videoUrl, id = "asset-output") => ({ type: "asset_status", content: {
  artifacts: [{ id: "artifact-created", type: "video", status: 3, asset_id: id }],
  assets: [{ id, type: "video", status: 3, file_url: url }],
} });
const binding = (id = "asset-output") => ({ type: "artifact_status", content: { artifacts: [{ id: "artifact-created", type: "video", status: 3, asset_id: id }] } });
const assetUpdate = (url = videoUrl, id = "asset-output") => ({ type: "asset_status", content: { assets: output(url, id).content.assets } });
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const json = (data: unknown) => new Response(JSON.stringify({ code: 200, data }), { headers: { "Content-Type": "application/json" } });

function cookie(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected local session.");
  return value.split(";", 1)[0];
}

describe("controlled local real generation API", () => {
  let app: FastifyInstance;
  let objects: InMemoryObjectStore;
  let localCookie: string;
  let calls: { url: string; init?: RequestInit }[];
  let generation: (init?: RequestInit) => Promise<Response>;
  let download: (init?: RequestInit) => Promise<Response>;
  let projects: unknown;
  let agentProjectsResponse: () => Response | Promise<Response>;
  let loginResponse: () => Response;
  let fakeFetch: typeof fetch;

  async function loginLocal(account = "creator@reelay.test"): Promise<string> {
    const response = await app.inject({ method: "POST", url: "/api/demo/session", payload: { account, password: DEMO_PASSWORD } });
    expect(response.statusCode).toBe(201);
    return cookie(response);
  }

  async function connect(selectedCookie = localCookie) {
    return app.inject({ method: "POST", url: "/api/real-generation/connection", headers: { cookie: selectedCookie },
      payload: { type: "phone", target: "13800138000", password: "private-test-password" } });
  }

  async function selectProject(selectedCookie = localCookie) {
    expect((await app.inject({ url: "/api/real-generation/projects?page=1", headers: { cookie: selectedCookie } })).statusCode).toBe(200);
  }

  function input(overrides: Partial<StartGenerationProbe> = {}): StartGenerationProbe {
    return { requestKey: randomUUID(), projectId: "platform-project", prompt: "日出时海浪缓慢拍打礁石，镜头平稳向前移动。", paidConsent: true, ...overrides };
  }

  async function submit(payload = input(), selectedCookie = localCookie) {
    return app.inject({ method: "POST", url: "/api/real-generation/probes", headers: { cookie: selectedCookie }, payload });
  }

  async function terminal(id: string): Promise<GenerationProbe> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await app.inject({ url: `/api/real-generation/probes/${id}`, headers: { cookie: localCookie } });
      expect(response.statusCode).toBe(200);
      const value = response.json<GenerationProbe>();
      if (!["submitting", "waiting", "saving"].includes(value.status)) return value;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error("Probe did not finish.");
  }

  const generates = () => calls.filter((entry) => entry.url.endsWith("/artifacts/generate-stream"));

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("VERCEL", "");
    calls = [];
    objects = new InMemoryObjectStore();
    projects = { items: [{ id: "platform-project", name: "真实项目" }], total: 1 };
    agentProjectsResponse = () => json(projects);
    loginResponse = () => json({ token: secret, user: { id: "platform-user", nickname: "平台账号" } });
    generation = async () => new Response(frame(binding()) + frame(assetUpdate()) + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    download = async () => new Response(videoBytes, { headers: { "Content-Type": "video/mp4" } });
    fakeFetch = async (request, init) => {
      const url = String(request);
      calls.push({ url, init });
      if (url.endsWith("/auth/login")) return loginResponse();
      if (url.includes("/api/v1/projects?")) return new Headers(init?.headers).get("X-Platform") === "agent" ? agentProjectsResponse() : json(projects);
      if (url.endsWith("/api/v1/assets") && init?.method === "POST") return json({ id: "placeholder-video", type: "video", project_id: "platform-project" });
      if (url.endsWith("/api/v1/artifacts") && init?.method === "POST") return json({ id: "artifact-created", type: "video", project_id: "platform-project", asset_id: "placeholder-video" });
      if (url.endsWith("/artifacts/generate-stream")) return generation(init);
      if (url.startsWith(`${REELAY_PLATFORM_BASE}/proxy-image?`)) return download(init);
      if (url === videoUrl) return download(init);
      throw new Error("Unexpected platform request.");
    };
    app = await buildServer({ store: new InMemoryCollaborationStore(), objectStore: objects, realGeneration: { enabled: true, fetcher: fakeFetch } });
    localCookie = await loginLocal();
  });

  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("requires the existing local HttpOnly session and never leaks credentials", async () => {
    expect((await app.inject({ url: "/api/real-generation/connection" })).statusCode).toBe(401);
    const response = await connect();
    expect(response.statusCode).toBe(200);
    expect(response.json().state).toBe("connected");
    expect(response.body).not.toContain(secret);
    expect(response.body).not.toContain("private-test-password");
    const stranger = await loginLocal("linjing@reelay.test");
    const other = await app.inject({ url: "/api/real-generation/connection", headers: { cookie: stranger } });
    expect(other.json().state).toBe("disconnected");
    const outgoing = calls[0];
    expect(outgoing.url).toBe(`${REELAY_PLATFORM_BASE}/api/v1/auth/login`);
    expect(new Headers(outgoing.init?.headers).get("X-Platform")).toBe("web");
    expect(outgoing.init?.redirect).toBe("error");
  });

  it.each([{ NODE_ENV: "production", VERCEL: "" }, { NODE_ENV: "test", VERCEL: "1" }])("is unavailable in hosted/production environments even with opt-in ($NODE_ENV/$VERCEL)", async (environment) => {
    await app.close(); vi.stubEnv("NODE_ENV", environment.NODE_ENV); vi.stubEnv("VERCEL", environment.VERCEL);
    app = await buildServer({ store: new InMemoryCollaborationStore(), objectStore: objects, realGeneration: { enabled: true, fetcher: fakeFetch } });
    localCookie = await loginLocal();
    const response = await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } });
    expect(response.json().available).toBe(false);
    expect((await connect()).statusCode).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("is unavailable without explicit opt-in or a result ObjectStore", async () => {
    await app.close();
    app = await buildServer({ store: new InMemoryCollaborationStore(), realGeneration: { enabled: true, fetcher: fakeFetch } });
    localCookie = await loginLocal();
    expect((await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json().available).toBe(false);
    expect((await connect()).statusCode).toBe(503);
    await app.close();
    app = await buildServer({ store: new InMemoryCollaborationStore(), objectStore: objects });
    localCookie = await loginLocal();
    expect((await connect()).statusCode).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("rejects remote hosts and cross-site mutation origins", async () => {
    expect((await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie, host: "example.com" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/real-generation/connection", headers: { cookie: localCookie, origin: "https://evil.example" }, payload: { type: "phone", target: "13800138000", password: "pw" } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie, "sec-fetch-site": "cross-site" } })).statusCode).toBe(403);
    expect((await app.inject({ url: "/api/real-generation/connection", remoteAddress: "192.168.1.8", headers: { cookie: localCookie, host: "localhost" } })).statusCode).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("compares project visibility with one credential and cannot use Agent projects for Web generation", async () => {
    await connect();
    agentProjectsResponse = () => json({ list: [{ id: "agent-project", name: "外部项目" }], total: 1 });
    const response = await app.inject({ url: "/api/real-generation/project-channel-comparison?page=1", headers: { cookie: localCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agent: { items: [{ id: "agent-project", name: "外部项目" }], page: 1, hasMore: false },
      web: { items: [{ id: "platform-project", name: "真实项目" }], page: 1, hasMore: false },
    });
    expect(response.body).not.toContain(secret);
    const reads = calls.filter((entry) => entry.url.includes("/api/v1/projects?"));
    expect(reads).toHaveLength(2);
    expect(reads[0].url).toBe(reads[1].url);
    expect(reads.map((entry) => new Headers(entry.init?.headers).get("X-Platform"))).toEqual(["agent", "web"]);
    for (const entry of reads) {
      expect(entry.init?.method).toBe("GET");
      expect(entry.init?.redirect).toBe("error");
      expect(new Headers(entry.init?.headers).get("Authorization")).toBe(`Bearer ${secret}`);
    }
    expect((await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json().state).toBe("connected");
    const rejected = await submit(input({ projectId: "agent-project" }));
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.code).toBe("container_unavailable");
    expect(generates()).toHaveLength(0);
  });

  it("keeps the Web connection when the same token is rejected by the Agent channel", async () => {
    await connect();
    agentProjectsResponse = () => new Response(secret, { status: 401 });
    const response = await app.inject({ url: "/api/real-generation/project-channel-comparison", headers: { cookie: localCookie } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("agent_channel_rejected");
    expect(response.body).not.toContain(secret);
    expect((await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json().state).toBe("connected");
    expect((await app.inject({ url: "/api/real-generation/projects", headers: { cookie: localCookie } })).statusCode).toBe(200);
    expect(generates()).toHaveLength(0);
  });

  it("requires an enabled loopback session before any project channel comparison", async () => {
    expect((await app.inject({ url: "/api/real-generation/project-channel-comparison" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/real-generation/project-channel-comparison", headers: { cookie: localCookie, host: "example.com" } })).statusCode).toBe(403);
    await app.close();
    app = await buildServer({ store: new InMemoryCollaborationStore(), objectStore: objects });
    localCookie = await loginLocal();
    expect((await app.inject({ url: "/api/real-generation/project-channel-comparison", headers: { cookie: localCookie } })).statusCode).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("discards a project comparison from a replaced connection", async () => {
    await connect();
    let finish!: (response: Response) => void;
    agentProjectsResponse = () => new Promise<Response>((resolve) => { finish = resolve; });
    const pending = app.inject({ url: "/api/real-generation/project-channel-comparison", headers: { cookie: localCookie } });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await connect();
    finish(json({ list: [{ id: "old-web-project", name: "旧官网项目" }], total: 1 }));
    const response = await pending;
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("disconnected");
    expect(response.body).not.toContain("old-web-project");
    expect((await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json().state).toBe("connected");
    expect(generates()).toHaveLength(0);
  });

  it("returns only safe errors when login fails", async () => {
    loginResponse = () => new Response(JSON.stringify({ msg: "private-test-password private-platform-jwt" }), { status: 401 });
    const response = await connect();
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("credentials_rejected");
    expect(response.body).not.toContain("private-");
  });

  it("requires explicit paid consent and listed Web project membership before any remote creation", async () => {
    expect((await connect()).statusCode).toBe(200);
    expect((await submit()).statusCode).toBe(400);
    await selectProject();
    expect((await submit({ ...input(), paidConsent: false } as unknown as StartGenerationProbe)).statusCode).toBe(400);
    expect((await submit(input({ projectId: "unlisted-project" }))).statusCode).toBe(400);
    expect((await submit({ ...input(), sessionId: "old-agent-session" } as unknown as StartGenerationProbe)).statusCode).toBe(400);
    expect(generates()).toHaveLength(0);
    expect(calls.some((entry) => ["/projects", "/sessions", "/assets", "/artifacts"].some((path) => entry.url.endsWith(path) && entry.init?.method === "POST"))).toBe(false);
  });

  it("removes the Agent session route and rechecks removed Web projects", async () => {
    await connect();
    await app.inject({ url: "/api/real-generation/projects", headers: { cookie: localCookie } });
    expect((await app.inject({ url: "/api/real-generation/sessions?projectId=platform-project", headers: { cookie: localCookie } })).statusCode).toBe(404);
    await selectProject();
    projects = { items: [] };
    expect((await submit()).statusCode).toBe(400);
    expect(generates()).toHaveLength(0);
  });

  it("consumes split SSE frames, heartbeats and multiline JSON; saves private MP4 and serves authenticated byte ranges", async () => {
    const text = ': heartbeat\r\n' + frame(binding()).replaceAll('\n', '\r\n') + 'event: asset_status\r\ndata: {"content":\r\ndata: ' + JSON.stringify(assetUpdate().content) + '}\r\n\r\ndata: [DONE]\r\n\r\n';
    const encoded = new TextEncoder().encode(text);
    generation = async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      for (let offset = 0; offset < encoded.length; offset += 3) controller.enqueue(encoded.slice(offset, offset + 3));
      controller.close();
    } }), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    const payload = input(); const response = await submit(payload);
    expect(response.statusCode).toBe(202);
    expect(response.json().requestKey).toBe(payload.requestKey);
    const completed = await terminal(response.json().id);
    expect(completed.status).toBe("succeeded");
    expect(completed.diagnostics).toMatchObject({ eventCount: 4, eventTypes: ["artifact", "artifact_status", "asset_status", "done"] });
    expect(completed.diagnostics.eventShapes).toHaveLength(3);
    expect(JSON.stringify(completed)).not.toContain("signature");
    const request = generates()[0];
    expect(JSON.parse(String(request.init?.body))).toEqual({ prompt: payload.prompt, model: "jimeng/seedance-2.0-fast", generate_type: "text_to_video", project_id: payload.projectId, artifact_id: "artifact-created",
      video: { aspect_ratio: "16:9", duration: 5, resolution: "480P", generate_audio: true } });
    const url = completed.result!.url;
    expect((await app.inject({ url })).statusCode).toBe(401);
    const video = await app.inject({ url, headers: { cookie: localCookie, range: "bytes=4-7" } });
    expect(video.statusCode).toBe(206); expect(video.body).toBe("ftyp");
    expect(video.headers["content-range"]).toBe("bytes 4-7/20");
    expect(video.headers["cache-control"]).toBe("private, no-store");
    expect((await app.inject({ url, headers: { cookie: localCookie, range: "bytes=99-" } })).statusCode).toBe(416);
    const otherCookie = await loginLocal("linjing@reelay.test");
    expect((await app.inject({ url, headers: { cookie: otherCookie } })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/real-generation/probes/${completed.id}`, headers: { cookie: otherCookie } })).statusCode).toBe(404);
  });

  it("accepts an explicit JSON terminal video result", async () => {
    generation = async () => json(output());
    await connect(); await selectProject();
    expect((await terminal((await submit()).json().id)).status).toBe("succeeded");
  });

  it("finishes on a complete output plus DONE even if the SSE transport stays open", async () => {
    let canceled = false;
    generation = async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(frame(output()) + "data: [DONE]\n\n"));
    }, cancel() { canceled = true; } }), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    expect((await terminal((await submit()).json().id)).status).toBe("succeeded");
    expect(canceled).toBe(true);
  });

  it("preserves an already-confirmed terminal video when the stream fails afterwards", async () => {
    let first = true;
    generation = async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) {
      if (first) { first = false; controller.enqueue(new TextEncoder().encode(frame(output()))); }
      else controller.error(new Error("tail disconnect"));
    } }), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    expect((await terminal((await submit()).json().id)).status).toBe("succeeded");
    expect(generates()).toHaveLength(1);
  });

  it.each(["\r", "\r\n"])("decodes UTF8 byte-by-byte and honors final SSE %j boundaries", async (separator) => {
    const text = frame({ ...output(), note: "生成完成：海边🌅" }).replaceAll("\n", separator);
    const encoded = new TextEncoder().encode(text);
    generation = async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of encoded) controller.enqueue(Uint8Array.from([byte]));
      controller.close();
    } }), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    expect((await terminal((await submit()).json().id)).status).toBe("succeeded");
  });

  it.each([
    frame({ url: videoUrl }) + "data: [DONE]\n\n",
    frame({ type: "asset_status", assets: [{ id: "ref", type: "video", role: "reference_video", status: "completed", url: videoUrl }] }),
    frame({ type: "asset_status", assets: [{ type: "video", status: "completed", url: videoUrl }] }),
    frame(output()) + frame(output(videoUrl, "second-output")),
    frame(output()).trimEnd(),
    "data: [DONE]\n\n",
    "data: {broken-json}\n\n",
  ])("marks ambiguous/truncated stream unconfirmed without downloading or repeating generation", async (text) => {
    generation = async () => new Response(text, { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    const payload = input(); const response = await submit(payload);
    const result = await terminal(response.json().id);
    expect(result.status).toBe("unconfirmed"); expect(result.result).toBeNull();
    await submit(payload);
    expect(generates()).toHaveLength(1);
    expect(calls.filter((entry) => entry.url === videoUrl)).toHaveLength(0);
    expect((await app.inject({ method: "POST", url: `/api/real-generation/probes/${result.id}/retry-save`, headers: { cookie: localCookie } })).statusCode).toBe(409);
  });

  it("distinguishes explicit platform failure and does not claim a refund", async () => {
    generation = async () => new Response(frame({ ok: false, error: "private-platform-details" }), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("failed");
    expect(result.message).toContain("真实平台核对"); expect(JSON.stringify(result)).not.toContain("private-platform-details");
    expect(calls.some((entry) => /cancel|refund/.test(entry.url))).toBe(false);
  });

  it.each([{ type: "error", error: "private contradiction" }, { type: "status", status: "failed" }])("fences conflicting completion/error evidence without saving or another paid call (%j)", async (contradiction) => {
    generation = async () => new Response(frame(binding()) + frame(assetUpdate()) + frame(contradiction), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("unconfirmed");
    expect(result.result).toBeNull();
    expect((await submit()).statusCode).toBe(409);
    expect(generates()).toHaveLength(1);
    expect(calls.some((entry) => entry.url === videoUrl)).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private contradiction");
  });

  it.each([201, 202])("keeps an accepted JSON response fenced when final video is unknown (code=%i)", async (code) => {
    generation = async () => new Response(JSON.stringify({ code, data: { status: "queued", artifact_id: "artifact-created" } }), { status: code, headers: { "Content-Type": "application/json" } });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("unconfirmed");
    expect(result.result).toBeNull();
    expect((await submit()).statusCode).toBe(409);
    expect(generates()).toHaveLength(1);
    expect(calls.some((entry) => entry.url === videoUrl)).toBe(false);
  });

  it("preserves the Web connection when its unauthenticated media proxy returns 401", async () => {
    generation = async () => new Response(frame(binding()) + frame(assetUpdate("https://video.example.com/real.mp4")), { headers: { "Content-Type": "text/event-stream" } });
    download = async (init) => {
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      return new Response("private proxy rejection", { status: 401 });
    };
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("save_failed");
    expect((await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json().state).toBe("connected");
    expect(generates()).toHaveLength(1);
    expect(calls.some((entry) => entry.url === "https://video.example.com/real.mp4")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private proxy rejection");
  });

  it("lets an explicit nonempty error override an otherwise completed asset", async () => {
    generation = async () => new Response(frame({ ...output(), error: { message: "private failure detail" } }), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    expect((await terminal((await submit()).json().id)).status).toBe("failed");
    expect(calls.some((entry) => entry.url === videoUrl)).toBe(false);
  });

  it("retains only a bounded structural sketch of unfamiliar nested events, never private values or unknown field names", async () => {
    const sensitive = "private-password-jwt-prompt-and-signature";
    const event = { type: "artifact_status", content: { artifacts: [{ id: sensitive, asset_id: sensitive, type: "video", status: "completed", role: "output",
      url: `https://private.example/video?token=${sensitive}`, mime_type: "video/mp4", [sensitive]: sensitive, prompt: sensitive, password: sensitive }] }, [sensitive]: sensitive, error: null };
    generation = async () => new Response(frame(event) + frame(event) + "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("unconfirmed");
    expect(result.diagnostics.eventCount).toBe(4);
    expect(result.diagnostics.eventShapes).toHaveLength(2);
    const sketches = result.diagnostics.eventShapes.join(" ");
    expect(sketches).toContain('"content":{"artifacts":');
    expect(sketches).toContain('"type":"video"');
    expect(sketches).toContain('"status":"completed"');
    expect(sketches).toContain('"url":"string"');
    expect(sketches).toContain('"other":3');
    expect(sketches).not.toContain(sensitive); expect(sketches).not.toContain("private.example");
    expect(sketches).not.toContain("password"); expect(sketches).not.toContain("prompt");
    // DTO snapshots must not share the service's mutable diagnostics arrays.
    result.diagnostics.eventShapes.push("changed local copy");
    expect((await terminal(result.id)).diagnostics.eventShapes).toHaveLength(2);
  });

  it("limits distinct event shapes and preserves them when saving is unavailable", async () => {
    download = async () => new Response(null, { status: 503 });
    const fields = ["id", "asset_id", "url", "file_url", "video_url", "mime_type", "status", "role", "output", "outputs"];
    const events = fields.map((field) => ({ type: "progress", [field]: "private-value-never-stored" }));
    generation = async () => new Response(events.map(frame).join("") + frame(output("https://unconfirmed-cdn.example/video.mp4")), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("save_failed"); expect(result.diagnostics.eventShapes).toHaveLength(8);
    expect(result.diagnostics.eventShapes.every((shape) => shape.length <= 800)).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain("private-value");
    expect(JSON.stringify(result.diagnostics)).not.toContain("unconfirmed-cdn.example");
  });

  it("captures a safe JSON error envelope shape without its error text or numeric value", async () => {
    generation = async () => new Response(JSON.stringify({ code: 403, error: { message: "private-error-with-password" }, data: null }), { headers: { "Content-Type": "application/json" } });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("failed"); expect(result.diagnostics.eventCount).toBe(2);
    expect(result.diagnostics.eventShapes).toContain('{"data":"null","code":"number","error":{"other":1}}');
    expect(JSON.stringify(result.diagnostics)).not.toContain("private-error");
    expect(JSON.stringify(result.diagnostics)).not.toContain("403");
  });

  it("keeps an unconfirmed account fenced across local actors and explicit new submits", async () => {
    generation = async () => new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    expect((await terminal((await submit()).json().id)).status).toBe("unconfirmed");
    expect((await submit()).statusCode).toBe(409);
    const otherCookie = await loginLocal("linjing@reelay.test");
    await connect(otherCookie); await selectProject(otherCookie);
    expect((await submit(input(), otherCookie)).statusCode).toBe(409);
    expect(generates()).toHaveLength(1);
  });

  it("rejects a different platform account after a probe and preserves the original connection and result", async () => {
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    loginResponse = () => json({ token: "different-private-token", user: { id: "different-user", nickname: "另一个账号" } });
    const mismatch = await connect();
    expect(mismatch.statusCode).toBe(409); expect(mismatch.json().error.code).toBe("account_mismatch");
    const state = (await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json();
    expect(state.platformUser.id).toBe("platform-user"); expect(state.probe.id).toBe(result.id);
    expect(JSON.stringify(state)).not.toContain("different-private-token");
  });

  it("deduplicates exact submits and prevents same-account concurrent requests across local actors", async () => {
    let release: (() => void) | undefined;
    generation = async () => { await new Promise<void>((resolve) => { release = resolve; }); return new Response(frame(output()), { headers: { "Content-Type": "text/event-stream" } }); };
    await connect(); await selectProject();
    const payload = input();
    const first = await submit(payload); const duplicate = await submit(payload);
    expect(first.json().id).toBe(duplicate.json().id); expect(generates()).toHaveLength(1);
    expect((await submit({ ...payload, prompt: "changed prompt" })).statusCode).toBe(409);
    expect((await submit()).statusCode).toBe(409);
    expect((await app.inject({ method: "DELETE", url: "/api/real-generation/connection", headers: { cookie: localCookie } })).statusCode).toBe(409);
    expect((await connect()).statusCode).toBe(409);
    const otherCookie = await loginLocal("linjing@reelay.test");
    await connect(otherCookie); await selectProject(otherCookie);
    expect((await submit(input(), otherCookie)).statusCode).toBe(409);
    release!();
    await terminal(first.json().id);
    expect(generates()).toHaveLength(1);
    expect(calls.filter((entry) => entry.url.endsWith("/api/v1/assets") && entry.init?.method === "POST")).toHaveLength(1);
    expect(calls.filter((entry) => entry.url.endsWith("/api/v1/artifacts") && entry.init?.method === "POST")).toHaveLength(1);
  });

  it.each(["http://127.0.0.1:5183/private", "https://user:password@reelay.tech.jetsentv.com/result.mp4", "https://127.0.0.1/private.mp4", "https://localhost/private.mp4", "https://cdn.example.com:444/result.mp4"]) ("refuses an invalid/private result location %s without any outgoing download", async (url) => {
    generation = async () => new Response(frame(output(url)), { headers: { "Content-Type": "text/event-stream" } });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("save_failed"); expect(result.result).toBeNull();
    expect(calls.some((entry) => entry.url === url)).toBe(false);
    expect(JSON.stringify(result)).not.toContain(url);
  });

  it.each(["https://cdn.example.com/result.mp4", "https://reelay.tech.jetsentv.com.evil.example/video.mp4"])("saves public output %s only through the official proxy, without sending JWT", async (url) => {
    generation = async () => new Response(frame(output(url)), { headers: { "Content-Type": "text/event-stream" } });
    download = async (init) => {
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(new Headers(init?.headers).has("X-Platform")).toBe(false);
      expect(init?.redirect).toBe("error");
      return new Response(videoBytes, { headers: { "Content-Type": "video/mp4" } });
    };
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("succeeded");
    expect(calls.some((entry) => entry.url === url)).toBe(false);
    const proxy = calls.find((entry) => entry.url.startsWith(`${REELAY_PLATFORM_BASE}/proxy-image?`));
    expect(proxy).toBeDefined();
    expect(new URL(proxy!.url).searchParams.get("url")).toBe(url);
    expect(JSON.stringify(result)).not.toContain(url);
  });

  it("refuses redirects and misleading MIME bytes, keeping confirmed generation separate from saving", async () => {
    download = async (init) => { expect(init?.redirect).toBe("error"); return new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/private" } }); };
    await connect(); await selectProject();
    const first = await terminal((await submit()).json().id);
    expect(first.status).toBe("save_failed");
    download = async () => new Response("<html>not a video</html>", { headers: { "Content-Type": "video/mp4" } });
    expect((await app.inject({ method: "POST", url: `/api/real-generation/probes/${first.id}/retry-save`, headers: { cookie: localCookie } })).statusCode).toBe(202);
    expect((await terminal(first.id)).status).toBe("save_failed");
    expect(generates()).toHaveLength(1);
  });

  it("retries a failed ObjectStore write using retained video bytes, without re-generation or exposing upstream error", async () => {
    vi.spyOn(objects, "putObject").mockRejectedValueOnce(new Error("secret-storage-credential"));
    await connect(); await selectProject();
    const initial = await terminal((await submit()).json().id);
    expect(initial.status).toBe("save_failed"); expect(JSON.stringify(initial)).not.toContain("secret-storage");
    expect((await app.inject({ method: "POST", url: `/api/real-generation/probes/${initial.id}/retry-save`, headers: { cookie: localCookie } })).statusCode).toBe(202);
    expect((await terminal(initial.id)).status).toBe("succeeded");
    expect(generates()).toHaveLength(1); expect(calls.filter((entry) => entry.url === videoUrl)).toHaveLength(1);
  });

  it("marks an expired platform response without automatic login or paid retry", async () => {
    generation = async () => new Response(JSON.stringify({ msg: secret }), { status: 401 });
    await connect(); await selectProject();
    const result = await terminal((await submit()).json().id);
    expect(result.status).toBe("unconfirmed");
    const state = (await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json();
    expect(state.state).toBe("expired"); expect(state.platformUser).toBeNull();
    expect(calls.filter((entry) => entry.url.endsWith("/auth/login"))).toHaveLength(1);
    expect(generates()).toHaveLength(1);
  });

  it("does not let a stale listing 401 expire a newer connection", async () => {
    await connect();
    let release: ((response: Response) => void) | undefined;
    const original = fakeFetch;
    // Build a fresh composition so its injected transport can hold the old
    // token's list request while the same local actor reconnects.
    await app.close();
    let holdOldList = true;
    const delayed: typeof fetch = async (request, init) => {
      if (String(request).includes("/api/v1/projects?") && holdOldList) {
        holdOldList = false;
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return original(request, init);
    };
    app = await buildServer({ store: new InMemoryCollaborationStore(), objectStore: objects, realGeneration: { enabled: true, fetcher: delayed } });
    localCookie = await loginLocal(); await connect();
    const oldRequest = app.inject({ url: "/api/real-generation/projects", headers: { cookie: localCookie } });
    // Fastify inject starts work when awaited/then'ed.
    const oldResponse = oldRequest.then((response) => response);
    for (let attempt = 0; !release && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 1));
    expect(release).toBeDefined();
    expect((await app.inject({ method: "DELETE", url: "/api/real-generation/connection", headers: { cookie: localCookie } })).statusCode).toBe(204);
    loginResponse = () => json({ token: "new-private-token", user: { id: "platform-user", nickname: "重新登录" } });
    await connect();
    release!(new Response("old token expired", { status: 401 }));
    expect((await oldResponse).statusCode).toBe(401);
    const state = (await app.inject({ url: "/api/real-generation/connection", headers: { cookie: localCookie } })).json();
    expect(state.state).toBe("connected"); expect(state.platformUser.displayName).toBe("重新登录");
    expect(JSON.stringify(state)).not.toContain("new-private-token");
  });

  it("aborts local generation reads on close without requesting supplier cancellation", async () => {
    let generationSignal: AbortSignal | null = null;
    generation = async (init) => {
      generationSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => generationSignal!.addEventListener("abort", () => reject(new Error("read aborted")), { once: true }));
    };
    await connect(); await selectProject();
    await submit();
    await app.close();
    expect((generationSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(calls.some((entry) => /cancel|refund/.test(entry.url))).toBe(false);
  });
});
