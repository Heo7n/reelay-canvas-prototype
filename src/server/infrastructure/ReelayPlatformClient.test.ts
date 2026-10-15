import { describe, expect, it, vi } from "vitest";
import { REAL_GENERATION_PROBE_SPEC } from "../../contracts/real-generation";
import { getSeedanceVideoCapability, validateSeedanceVideoRequest } from "../../contracts/seedance-video";
import { REELAY_PLATFORM_BASE, ReelayPlatformClient } from "./ReelayPlatformClient";

const videoUrl = `${REELAY_PLATFORM_BASE}/generated/output.mp4`;
const frame = (value: unknown, newline = "\n") => `data: ${JSON.stringify(value)}${newline}${newline}`;
const host = (status: unknown = "processing", extra: Record<string, unknown> = {}) => ({
  type: "artifact_status", content: { artifacts: [{ id: "artifact-created", asset_id: "asset-output", status, ...extra }] },
});
const output = (status: unknown = "completed", extra: Record<string, unknown> = {}) => ({
  type: "asset_status", content: { assets: [{ id: "asset-output", status, file_url: videoUrl, ...extra }] },
});
const json = (data: unknown, options?: ResponseInit) => new Response(JSON.stringify({ code: 200, data }), {
  headers: { "Content-Type": "application/json" }, ...options,
});
const sse = (text: string | ReadableStream<Uint8Array>) => new Response(text, { headers: { "Content-Type": "text/event-stream" } });
const request = { token: "private-token", projectId: "web-project", prompt: "清晨的雪山与湖面，镜头缓慢向前移动。", signal: new AbortController().signal, onEvent: vi.fn() };
const ordinaryParameters = {
  modelId: "seedance-2-5", resolution: "720p", aspectRatio: "9:16", duration: 30,
  generateAudio: false, workflow: "omni-reference", generationStage: "standard",
};

function clientFor(stream: Response) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (raw) => {
    const url = new URL(String(raw));
    if (url.pathname === "/api/v1/assets") return json({ id: "placeholder-video" });
    if (url.pathname === "/api/v1/artifacts") return json({ id: "artifact-created" });
    if (url.pathname === "/api/v1/artifacts/generate-stream") return stream;
    throw new Error("unexpected request");
  });
  return { client: new ReelayPlatformClient(fetcher), fetcher };
}

describe("ReelayPlatformClient website protocol", () => {
  it("uses the Web channel for login and project listing, and Agent only for read-only comparison", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (raw) => String(raw).includes("/auth/login")
      ? json({ token: "private-token", user: { id: "real-user", nickname: "Test user" } })
      : json({ list: [{ id: "project", name: "Existing project" }], total: 1 }));
    const client = new ReelayPlatformClient(fetcher);
    await expect(client.login({ type: "email", target: "user@example.com", password: "password" })).resolves.toMatchObject({ userId: "real-user" });
    await client.listProjects("private-token", 1);
    await client.listAgentProjects("private-token", 2);
    expect(fetcher.mock.calls.map(([, options]) => new Headers(options?.headers).get("X-Platform"))).toEqual(["web", "web", "agent"]);
    expect(fetcher.mock.calls[2][0]).toBe(`${REELAY_PLATFORM_BASE}/api/v1/projects?page=2&page_size=20`);
  });

  it.each([
    ["web", "expired"], ["agent", "agent_channel_rejected"],
  ] as const)("maps %s channel rejection without misclassifying the active website credential", async (channel, code) => {
    const client = new ReelayPlatformClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(channel === "web" ? client.listProjects("token", 1) : client.listAgentProjects("token", 1)).rejects.toMatchObject({ code });
  });

  it("persists the official placeholder and host before one stream request, with fixed specifications", async () => {
    const { client, fetcher } = clientFor(sse(frame(host()) + frame(output())));
    await expect(client.generate({ ...request, onEvent: vi.fn() })).resolves.toEqual({
      status: "succeeded", video: { assetId: "asset-output", artifactId: "artifact-created", url: videoUrl },
    });
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/api/v1/assets", "/api/v1/artifacts", "/api/v1/artifacts/generate-stream",
    ]);
    const bodies = fetcher.mock.calls.map(([, options]) => JSON.parse(String(options?.body)) as Record<string, unknown>);
    expect(bodies).toEqual([
      { name: "视频生成", type: "video", source: "uploaded", project_id: "web-project", file_name: "composer-host-placeholder.mp4", file_key: "composer-placeholder/host-noop.mp4" },
      { type: "video", project_id: "web-project", asset_id: "placeholder-video", position_x: 0, position_y: 0, width: 280, height: 280 },
      { prompt: request.prompt, generate_type: "text_to_video", model: REAL_GENERATION_PROBE_SPEC.model, project_id: "web-project", artifact_id: "artifact-created",
        video: { aspect_ratio: "16:9", duration: 5, resolution: "480P", generate_audio: true } },
    ]);
    expect(fetcher.mock.calls.every(([, options]) => new Headers(options?.headers).get("X-Platform") === "web" && options?.redirect === "error")).toBe(true);
  });

  it.each([
    ["seedance-2", "jimeng/seedance-2.0", "1080p", 15],
    ["seedance-2-fast", "jimeng/seedance-2.0-fast", "720p", 4],
    ["seedance-2-5", "jimeng/seedance-2.5", "1080P", 30],
  ])("sends %s with the user's validated ordinary parameters instead of the probe's fixed Fast model", async (modelId, model, resolution, duration) => {
    const { client, fetcher } = clientFor(sse(frame(host()) + frame(output())));
    const parameters = validateSeedanceVideoRequest({ ...ordinaryParameters, modelId, resolution, duration });
    await expect(client.generate({ ...request, parameters })).resolves.toMatchObject({ status: "succeeded" });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
      prompt: request.prompt, generate_type: "text_to_video", model,
      project_id: "web-project", artifact_id: "artifact-created",
      video: { aspect_ratio: "9:16", duration, resolution: resolution.toUpperCase(), generate_audio: false },
    });
  });

  it("persists the validated placeholder and artifact identity before submitting the stream", async () => {
    const { client, fetcher } = clientFor(sse(frame(host()) + frame(output())));
    const onArtifact = vi.fn(async (artifact) => {
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(artifact).toEqual({ assetId: "placeholder-video", artifactId: "artifact-created" });
    });
    await client.generate({ ...request, parameters: validateSeedanceVideoRequest(ordinaryParameters), onArtifact });
    expect(onArtifact).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each(["seedance-2", "seedance-2-fast", "seedance-2-5"] as const)("maps %s ordinary task type and output format to the evidenced Web field location", async (modelId) => {
    const { client, fetcher } = clientFor(sse(frame(host()) + frame(output())));
    const parameters = validateSeedanceVideoRequest({ ...ordinaryParameters, modelId, duration: 5, omniReferenceTaskType: "auto", outputFormat: "mp4" });
    await client.generate({ ...request, parameters });
    const payload = JSON.parse(String(fetcher.mock.calls[2][1]?.body));
    const optionalFields = { omni_reference_task_type: "auto", output_format: "mp4" };
    expect(payload.video).toEqual({
      aspect_ratio: "9:16", duration: 5, resolution: "720P", generate_audio: false,
      ...(modelId === "seedance-2-5" ? { extra: optionalFields } : optionalFields),
    });
  });

  it("does not submit or retry generation if durable artifact identity cannot be saved", async () => {
    const { client, fetcher } = clientFor(sse(frame(host()) + frame(output())));
    const onArtifact = vi.fn(async () => { throw new Error("local persistence unavailable"); });
    await expect(client.generate({ ...request, onArtifact })).rejects.toThrow("local persistence unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onArtifact).toHaveBeenCalledOnce();
  });

  it("validates runtime parameter input before creating any remote placeholders", async () => {
    const { client, fetcher } = clientFor(sse(frame(host()) + frame(output())));
    const parameters = validateSeedanceVideoRequest(ordinaryParameters);
    await expect(client.generate({ ...request, parameters: { ...parameters, model: "jimeng/seedance-2.0-fast" } })).rejects.toMatchObject({ name: "ZodError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["asset", "artifact"])("never retries or starts generation after an unconfirmed %s creation", async (step) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(step === "asset" ? json({ unexpected: "id" }) : json({ id: "placeholder-video" }));
    if (step === "artifact") fetcher.mockRejectedValueOnce(new Error("private upstream message"));
    const client = new ReelayPlatformClient(fetcher);
    await expect(client.generate(request)).rejects.toMatchObject({ code: step === "asset" ? "protocol_unconfirmed" : "platform_unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(step === "asset" ? 1 : 2);
  });

  it.each(["completed", 3, "3"])("accepts official terminal status %j from the linked asset without requiring a repeated media type", async (status) => {
    const { client } = clientFor(sse(frame(host()) + frame(output(status))));
    await expect(client.generate(request)).resolves.toMatchObject({ status: "succeeded", video: { assetId: "asset-output" } });
  });

  it("accepts the host's explicit terminal URL, without searching arbitrary nested URLs", async () => {
    const { client } = clientFor(sse(frame(host(3, { url: videoUrl }))));
    await expect(client.generate(request)).resolves.toMatchObject({ status: "succeeded", video: { artifactId: "artifact-created" } });
  });

  it("links reversed asset/host frames and both collections in one frame", async () => {
    for (const text of [frame(output()) + frame(host()), frame({ type: "asset_status", content: { ...host().content, ...output().content } })]) {
      const { client } = clientFor(sse(text));
      await expect(client.generate(request)).resolves.toMatchObject({ status: "succeeded" });
    }
  });

  it("ignores another host, a reference asset, and the placeholder even when all carry completed URLs", async () => {
    const unrelated = frame(host(3, { id: "other-artifact", url: videoUrl }))
      + frame(output(3, { role: "reference_video", artifact_id: "artifact-created" }))
      + frame(output(3, { id: "placeholder-video", artifact_id: "artifact-created" }));
    const { client } = clientFor(sse(unrelated));
    await expect(client.generate(request)).resolves.toEqual({ status: "unconfirmed" });
  });

  it.each([
    frame(output()),
    frame({ type: "asset_status", assets: output().content.assets }),
    frame({ type: "asset_status", data: { result: { id: "asset-output", status: "completed", url: videoUrl } } }),
    frame(host()) + frame(output("success")),
    frame(host()) + frame(output("completed", { file_url: undefined })),
    "data: [DONE]\n\n",
  ])("keeps unrecognized, unlinked or incomplete outputs unconfirmed", async (text) => {
    const { client } = clientFor(sse(text));
    await expect(client.generate(request)).resolves.toEqual({ status: "unconfirmed" });
  });

  it.each([4, "5", "failed", "cancelled"])("records the linked official failure %j", async (status) => {
    const { client } = clientFor(sse(frame(host()) + frame(output(status))));
    await expect(client.generate(request)).resolves.toEqual({ status: "failed" });
  });

  it("treats conflicting output IDs as unconfirmed instead of silently choosing one", async () => {
    const { client } = clientFor(sse(frame(host()) + frame(output()) + frame(host(3, { asset_id: "second-output", url: videoUrl }))));
    await expect(client.generate(request)).resolves.toEqual({ status: "unconfirmed" });
  });

  it.each([
    { type: "error", error: { message: "private rejection" } },
    { type: "status", status: "failed" },
    { type: "status", error: "private rejection" },
    { type: "status", ok: false },
  ])("preserves contradictory platform terminal events as unconfirmed rather than treating them like transport failure", async (error) => {
    const { client } = clientFor(sse(frame(host()) + frame(output()) + frame(error)));
    await expect(client.generate(request)).resolves.toEqual({ status: "unconfirmed" });
  });

  it("also fences a failure followed by a contradictory successful terminal output", async () => {
    const { client } = clientFor(sse(frame({ type: "error" }) + frame(host()) + frame(output())));
    await expect(client.generate(request)).resolves.toEqual({ status: "unconfirmed" });
  });

  it.each([201, 202, 204, 299, "202"])("keeps a positive JSON acceptance code %j without a terminal output unconfirmed", async (code) => {
    const response = new Response(JSON.stringify({ code, data: { task_id: "upstream-task", status: "pending" } }), {
      status: 202, headers: { "Content-Type": "application/json" },
    });
    const { client, fetcher } = clientFor(response);
    await expect(client.generate(request)).resolves.toEqual({ status: "unconfirmed" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("can establish a JSON result only from an explicit terminal output linked to this artifact", async () => {
    const terminal = { type: "asset_status", content: { ...host().content, ...output().content } };
    const response = new Response(JSON.stringify({ code: 202, data: terminal }), { status: 202, headers: { "Content-Type": "application/json" } });
    const { client } = clientFor(response);
    await expect(client.generate(request)).resolves.toMatchObject({ status: "succeeded", video: { assetId: "asset-output" } });
  });

  it("retains an explicit rejecting JSON error as failed", async () => {
    const response = new Response(JSON.stringify({ code: 403, error: { message: "private rejection" }, data: null }), {
      headers: { "Content-Type": "application/json" },
    });
    const { client } = clientFor(response);
    await expect(client.generate(request)).resolves.toEqual({ status: "failed" });
  });

  it.each([true, false])("requires a complete terminal frame before preserving a result after transport failure (complete=%j)", async (complete) => {
    let delivered = false;
    const text = frame(host()) + frame(output()).replace(/\n\n$/, complete ? "\n\n" : "\n");
    const stream = new ReadableStream<Uint8Array>({ pull(controller) {
      if (!delivered) { delivered = true; controller.enqueue(new TextEncoder().encode(text)); }
      else controller.error(new Error("connection lost"));
    } });
    const { client, fetcher } = clientFor(sse(stream));
    await expect(client.generate(request)).resolves.toMatchObject({ status: complete ? "succeeded" : "unconfirmed" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("decodes split UTF8, CRLF, comments and multiline data, and cancels an open stream after DONE", async () => {
    const bytes = new TextEncoder().encode(": 心跳\r\n" + frame(host(), "\r\n")
      + 'event: asset_status\r\ndata: {"content":\r\ndata: {"assets":[{"id":"asset-output","status":3,"url":' + JSON.stringify(videoUrl) + '}]}}\r\n\r\n'
      + "data: [DONE]\r\n\r\n");
    let offset = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (offset < bytes.length) controller.enqueue(bytes.slice(offset, ++offset)); }, cancel });
    const { client } = clientFor(sse(stream));
    await expect(client.generate(request)).resolves.toMatchObject({ status: "succeeded" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds SSE and JSON bodies without resubmitting", async () => {
    for (const response of [sse("data: " + "x".repeat(2 * 1024 * 1024 + 1)),
      new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "3000000" } })]) {
      const { client, fetcher } = clientFor(response);
      await expect(client.generate(request)).resolves.toEqual({ status: "unconfirmed" });
      expect(fetcher).toHaveBeenCalledTimes(3);
    }
  });

  it("redacts all IDs, prompts, URLs, credentials and unknown names from diagnostic sketches", async () => {
    const secret = "sensitive-secret";
    const event = host(3, { id: "artifact-created", url: videoUrl, token: secret, [secret]: request.prompt });
    const onEvent = vi.fn();
    const { client } = clientFor(sse(frame(event)));
    await client.generate({ ...request, onEvent });
    const sketches = onEvent.mock.calls.map((call) => call[1] as string).join("\n");
    expect(sketches).toContain('"content"');
    for (const value of [secret, request.prompt, request.token, videoUrl, "artifact-created", "asset-output"]) expect(sketches).not.toContain(value);
    expect(onEvent.mock.calls.every((call) => typeof call[1] !== "string" || call[1].length <= 800)).toBe(true);
  });
});

describe("Seedance ordinary Web request validation", () => {
  it.each(["seedance-2", "seedance-2-fast", "seedance-2-5"] as const)("takes %s ranges and channel mapping from the model directory", (modelId) => {
    const capability = getSeedanceVideoCapability(modelId);
    expect(capability.model).toMatch(/^jimeng\/seedance-/);
    for (const duration of [capability.durationRange.min, capability.durationRange.max]) {
      for (const resolution of capability.resolutions) {
        for (const aspectRatio of capability.aspectRatios) {
          expect(validateSeedanceVideoRequest({ ...ordinaryParameters, modelId, duration, resolution, aspectRatio })).toMatchObject({
            modelId, model: capability.model, duration, resolution, aspectRatio,
            generateAudio: false, workflow: "omni-reference", generationStage: "standard",
          });
        }
      }
    }
  });

  it.each([
    { modelId: "seedance-2-5-draft" }, { modelId: "jimeng/seedance-2.5" }, { modelId: "kling-video-3" },
    { modelId: "seedance-2-fast", resolution: "1080P", duration: 5 },
    { modelId: "seedance-2", duration: 16 }, { modelId: "seedance-2-fast", duration: 3 },
    { duration: 31 }, { duration: 3 }, { duration: 5.5 }, { duration: "10s" },
    { model: "jimeng/seedance-2.0-fast" }, { resolution: "4K" }, { generateAudio: "false" },
    { aspectRatio: "adaptive" }, { aspectRatio: "Auto" }, { aspectRatio: "5:4" },
    { generationStage: "draft" }, { generationStage: "final" }, { generationStage: "ordinary" },
    { workflow: "edit" }, { workflow: "extend" }, { omniReferenceTaskType: "edit" },
    { omniReferenceTaskType: "extend" }, { omniReferenceTaskType: "reference" },
    { outputFormat: "mov" }, { count: 2 }, { draft: true }, { mode: "draft" },
    { references: [{ type: "image", url: "https://example.com/reference.png" }] },
    { references: [{ type: "video", asset_id: "platform-asset", role: "reference_video", url: "https://example.com/reference.mp4" }] },
    { references: [{ type: "audio", url: "asset://remote-platform-asset" }] },
  ])("blocks unsupported or invalid intent without silently removing it: %j", (extra) => {
    expect(() => validateSeedanceVideoRequest({ ...ordinaryParameters, ...extra })).toThrow();
  });

  it("accepts explicit ordinary defaults and retains silent-audio intent after canonical normalization", () => {
    expect(validateSeedanceVideoRequest({ ...ordinaryParameters, omniReferenceTaskType: "auto", outputFormat: "mp4", count: 1, references: [] })).toEqual({
      modelId: "seedance-2-5", model: "jimeng/seedance-2.5", resolution: "720P", aspectRatio: "9:16", duration: 30,
      generateAudio: false, workflow: "omni-reference", generationStage: "standard",
      omniReferenceTaskType: "auto", outputFormat: "mp4",
    });
  });

  it("describes unverified adaptive ratio as a current channel boundary", () => {
    expect(() => validateSeedanceVideoRequest({ ...ordinaryParameters, aspectRatio: "adaptive" })).toThrow(/当前通道尚未核验/);
  });

  it("does not expose mutable directory capability state to callers", () => {
    const capability = getSeedanceVideoCapability("seedance-2-5");
    capability.durationRange.max = 999;
    expect(getSeedanceVideoCapability("seedance-2-5").durationRange.max).toBe(30);
  });
});

describe("ReelayPlatformClient controlled result download", () => {
  const mp4 = new Uint8Array([0, 0, 0, 12, 102, 116, 121, 112, 105, 115, 111, 109]);

  it("uses the verified same-origin website proxy for a public HTTPS result and never forwards JWT", async () => {
    const url = "https://cdn.example.com/final.mp4?signature=private";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(mp4, { headers: { "Content-Type": "application/octet-stream" } }));
    const client = new ReelayPlatformClient(fetcher);
    await expect(client.download("private-token", { assetId: "asset-output", artifactId: "artifact-created", url }, request.signal)).resolves.toEqual({ contentType: "video/mp4", body: mp4 });
    const [raw, options] = fetcher.mock.calls[0];
    const target = new URL(String(raw));
    expect(target.origin).toBe(REELAY_PLATFORM_BASE);
    expect(target.pathname).toBe("/proxy-image");
    expect(target.searchParams.get("url")).toBe(url);
    expect(new Headers(options?.headers).get("Authorization")).toBeNull();
    expect(options?.redirect).toBe("error");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    ["https://cdn.example.com/output.mp4", "save_unavailable"], [videoUrl, "expired"],
  ])("does not confuse a proxy 401 with rejection of the Web token (url=%s)", async (url, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const client = new ReelayPlatformClient(fetcher);
    await expect(client.download("private-token", { assetId: "asset-output", url }, request.signal)).rejects.toMatchObject({ code });
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe(code === "expired" ? "Bearer private-token" : null);
  });

  it.each(["/proxy-image", "/proxy-image/", "/%70roxy-image", "/PROXY-IMAGE"])("rejects a prewrapped same-origin proxy URL %s before it can inherit authenticated headers", async (pathname) => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ReelayPlatformClient(fetcher);
    const url = new URL(pathname, REELAY_PLATFORM_BASE);
    url.searchParams.set("url", "http://localhost/private.mp4");
    await expect(client.download("private-token", { assetId: "asset-output", url: url.href }, request.signal)).rejects.toMatchObject({ code: "save_unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["http://cdn.example.com/final.mp4", "https://127.0.0.1/video.mp4", "https://[::1]/video.mp4", "https://localhost/video.mp4",
    "https://machine.internal/video.mp4", "https://singlelabel/video.mp4", "https://cdn.example.com:8443/video.mp4",
    "https://user:password@cdn.example.com/video.mp4", "https://cdn.example.com/video.mp4#fragment", "file:///tmp/video.mp4"])("rejects unsupported result address %s before any request", async (url) => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new ReelayPlatformClient(fetcher);
    await expect(client.download("token", { assetId: "asset-output", url }, request.signal)).rejects.toMatchObject({ code: "save_unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    new Response("<html>Login</html>", { headers: { "Content-Type": "video/mp4" } }),
    new Response(mp4, { headers: { "Content-Type": "text/html" } }),
    new Response(mp4, { status: 302, headers: { Location: "https://other.example.com/video.mp4" } }),
    new Response(mp4, { headers: { "Content-Type": "video/mp4", "Content-Length": "67108865" } }),
  ])("requires a bounded successful MP4 body without following redirects", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const client = new ReelayPlatformClient(fetcher);
    await expect(client.download("token", { assetId: "asset-output", url: videoUrl }, request.signal)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
