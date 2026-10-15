import {
  RealGenerationError,
  type PlatformGenerationOutcome,
  type PlatformGenerationInput,
  type PlatformIdentity,
  type PlatformPage,
  type PlatformVideo,
  type RealGenerationPlatform,
} from "../application/RealGenerationPlatform";
import { REAL_GENERATION_CALL_SOURCE, REAL_GENERATION_PLATFORM_ORIGIN, REAL_GENERATION_PROBE_SPEC, type PlatformLogin } from "../../contracts/real-generation";
import { buildSeedanceWebVideoPayload, validateSeedanceVideoRequest } from "../../contracts/seedance-video";
import { isIP } from "node:net";

export const REELAY_PLATFORM_BASE = REAL_GENERATION_PLATFORM_ORIGIN;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const pageSize = 20;
const shapeFields = ["type", "status", "content", "artifacts", "assets", "asset", "id", "asset_id", "artifact_id", "data", "code", "error", "url", "file_url", "mime_type", "role"] as const;
const shapeEnums: Partial<Record<typeof shapeFields[number], ReadonlySet<string>>> = {
  type: new Set(["artifact", "artifact_status", "asset_status", "scheduled", "error", "status", "progress", "message", "done", "video", "image", "audio"]),
  status: new Set(["queued", "pending", "processing", "completed", "failed", "error", "failure", "canceled", "cancelled"]),
  role: new Set(["output", "generated_video", "generated_image", "reference_video", "reference_image", "reference_audio"]),
};

type EventSketch = string | Record<string, unknown> | EventSketch[];

function eventShape(value: unknown): string {
  const sketch = (entry: unknown, depth: number, field?: typeof shapeFields[number]): EventSketch => {
    if (entry === null) return "null";
    if (typeof entry === "string") return field && shapeEnums[field]?.has(entry) ? entry : "string";
    if (typeof entry === "number") return "number";
    if (typeof entry === "boolean") return "boolean";
    if (Array.isArray(entry)) return depth >= 4 ? "array" : entry.length ? [sketch(entry[0], depth + 1)] : [];
    const record = object(entry);
    if (!record) return "other";
    if (depth >= 4) return "object";
    const result: Record<string, unknown> = {};
    const keys = Object.keys(record);
    let selected = 0;
    for (const key of shapeFields) {
      if (!Object.hasOwn(record, key) || selected >= 16) continue;
      result[key] = sketch(record[key], depth + 1, key); selected++;
    }
    // Unknown names may themselves contain a prompt, signature, credential or
    // error message. Count them without ever reproducing their names/values.
    const other = keys.length - selected;
    if (other) result.other = other;
    return result;
  };
  return JSON.stringify(sketch(value, 0)).slice(0, 800);
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function identifier(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : null;
}

function generationStatus(value: unknown): "completed" | "failed" | "pending" | null {
  // Matches the website's finite status mapping, including numeric SSE states.
  const status = typeof value === "string" ? value.trim().toLowerCase() : value;
  if (typeof status !== "string" && typeof status !== "number") return null;
  if (status === "completed" || status === 3 || status === "3") return "completed";
  if (["failed", "error", "failure", "canceled", "cancelled", 4, 5, "4", "5"].includes(status)) return "failed";
  if (["queued", "pending", "processing", 0, 1, 2, "0", "1", "2"].includes(status)) return "pending";
  return null;
}

async function boundedBody(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) throw new RealGenerationError("protocol_unconfirmed");
  if (!response.body) throw new RealGenerationError("protocol_unconfirmed");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new RealGenerationError("protocol_unconfirmed");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
  return body;
}

function safeResultUrl(raw: string): { url: URL; proxy: boolean } {
  let url: URL;
  try { url = new URL(raw); } catch { throw new RealGenerationError("save_unavailable"); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port
    || isIP(hostname) || !hostname.includes(".") || /(?:^|\.)(?:localhost|local|localdomain|internal|lan|home)$/.test(hostname)) {
    throw new RealGenerationError("save_unavailable");
  }
  if (url.origin === REELAY_PLATFORM_BASE) {
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "").toLowerCase(); }
    catch { throw new RealGenerationError("save_unavailable"); }
    // Only a direct result URL can enter this adapter. An existing proxy URL
    // would hide its target from the validation above and must never inherit
    // the authenticated direct-download headers merely because it is same-origin.
    if (pathname === "/proxy-image") throw new RealGenerationError("save_unavailable");
    return { url, proxy: false };
  }
  // Mirrors the verified website downloader: cross-origin outputs are read
  // through its same-origin proxy. We never contact a guessed CDN directly or
  // pass platform credentials to that proxy or its remote target.
  const proxyUrl = new URL("/proxy-image", REELAY_PLATFORM_BASE);
  proxyUrl.searchParams.set("url", url.href);
  return { url: proxyUrl, proxy: true };
}

export class ReelayPlatformClient implements RealGenerationPlatform {
  private readonly lifecycle = new AbortController();
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  dispose(): void { this.lifecycle.abort(); }

  private async request(path: string, options: RequestInit, token?: string, callSource: "agent" | "web" = REAL_GENERATION_CALL_SOURCE): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("X-Platform", callSource);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await this.fetcher(`${REELAY_PLATFORM_BASE}/api/v1${path}`, {
        ...options, headers, redirect: "error", signal: AbortSignal.any([this.lifecycle.signal, options.signal ?? AbortSignal.timeout(30_000)]),
      });
    } catch { throw new RealGenerationError("platform_unavailable"); }
    if (response.status === 401) throw new RealGenerationError(callSource === "agent" ? "agent_channel_rejected" : token ? "expired" : "credentials_rejected");
    if (!response.ok) throw new RealGenerationError("platform_unavailable");
    return response;
  }

  private async json(path: string, options: RequestInit, token?: string, callSource?: "agent" | "web"): Promise<Record<string, unknown>> {
    const response = await this.request(path, options, token, callSource);
    let envelope: Record<string, unknown> | null;
    try { envelope = object(JSON.parse(new TextDecoder().decode(await boundedBody(response, MAX_RESPONSE_BYTES)))); }
    catch { throw new RealGenerationError("protocol_unconfirmed"); }
    if (envelope?.code !== 200) throw new RealGenerationError(token ? "platform_unavailable" : "credentials_rejected");
    const data = object(envelope.data);
    if (!data) throw new RealGenerationError("protocol_unconfirmed");
    return data;
  }

  async login(input: PlatformLogin): Promise<PlatformIdentity> {
    const data = await this.json("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const user = object(data.user);
    const userId = identifier(user?.id);
    if (typeof data.token !== "string" || !data.token || data.token.length > 16_384 || !userId) throw new RealGenerationError("protocol_unconfirmed");
    return { token: data.token, userId, displayName: typeof user?.nickname === "string" && user.nickname.trim() ? user.nickname.slice(0, 100) : "Reelay 账号" };
  }

  private async list(path: string, token: string, page: number, callSource?: "agent" | "web"): Promise<PlatformPage> {
    const data = await this.json(path, { method: "GET" }, token, callSource);
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.list) ? data.list : null;
    if (!rows || rows.length > pageSize) throw new RealGenerationError("protocol_unconfirmed");
    const items = rows.map((row) => {
      const entry = object(row);
      const id = identifier(entry?.id);
      if (!id) throw new RealGenerationError("protocol_unconfirmed");
      const name = entry?.name;
      if (typeof name !== "string") throw new RealGenerationError("protocol_unconfirmed");
      return { id, name: name.slice(0, 200) };
    });
    const hasMore = typeof data.has_more === "boolean" ? data.has_more
      : typeof data.total === "number" ? data.total > page * pageSize : rows.length === pageSize;
    return { items, hasMore };
  }

  listProjects(token: string, page: number): Promise<PlatformPage> {
    return this.list(`/projects?page=${page}&page_size=${pageSize}`, token, page);
  }

  // Read-only comparison only. Agent IDs never authorize Web generation.
  listAgentProjects(token: string, page: number): Promise<PlatformPage> {
    return this.list(`/projects?page=${page}&page_size=${pageSize}`, token, page, "agent");
  }

  async generate(input: PlatformGenerationInput): Promise<PlatformGenerationOutcome> {
    const probe = REAL_GENERATION_PROBE_SPEC;
    const parameters = validateSeedanceVideoRequest(input.parameters ?? {
      modelId: probe.modelId, model: probe.model, resolution: probe.resolution, aspectRatio: probe.aspectRatio,
      duration: probe.duration, generateAudio: probe.generateAudio, workflow: "omni-reference", generationStage: "standard",
    });
    const jsonOptions = (body: Record<string, unknown>): RequestInit => ({
      method: "POST", signal: input.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    // The website persists a placeholder asset and artifact before starting
    // its stream. Omitting artifact_id in its builder is not evidence that
    // generate-stream can create a host. These writes run only after consent.
    const placeholder = await this.json("/assets", jsonOptions({
      name: "视频生成", type: "video", source: "uploaded", project_id: input.projectId,
      file_name: "composer-host-placeholder.mp4", file_key: "composer-placeholder/host-noop.mp4",
    }), input.token);
    const placeholderId = identifier(placeholder.id);
    if (!placeholderId || (placeholder.project_id !== undefined && placeholder.project_id !== input.projectId)
      || (placeholder.type !== undefined && placeholder.type !== "video")) throw new RealGenerationError("protocol_unconfirmed");
    const artifact = await this.json("/artifacts", jsonOptions({
      type: "video", project_id: input.projectId, asset_id: placeholderId,
      position_x: 0, position_y: 0, width: 280, height: 280,
    }), input.token);
    const artifactId = identifier(artifact.id);
    if (!artifactId || (artifact.project_id !== undefined && artifact.project_id !== input.projectId)
      || (artifact.type !== undefined && artifact.type !== "video")
      || (artifact.asset_id !== undefined && artifact.asset_id !== placeholderId)) throw new RealGenerationError("protocol_unconfirmed");
    input.onEvent("artifact", eventShape({ type: "artifact", content: artifact }));
    await input.onArtifact?.({ assetId: placeholderId, artifactId });
    const response = await this.request("/artifacts/generate-stream", {
      method: "POST", signal: input.signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(buildSeedanceWebVideoPayload({ parameters, prompt: input.prompt, projectId: input.projectId, artifactId })),
    }, input.token);

    let video: PlatformVideo | null = null;
    let outputAssetId: string | null = null;
    let failed = false;
    let ambiguous = false;
    const observedAssets = new Map<string, Record<string, unknown>>();
    const complete = (row: Record<string, unknown>, assetId: string) => {
      if (row.type !== undefined && row.type !== "video") return;
      if (row.role !== undefined && row.role !== "output" && row.role !== "generated_video") return;
      if (row.project_id !== undefined && row.project_id !== input.projectId) { ambiguous = true; return; }
      const status = generationStatus(row.status);
      if (status === "failed") { if (video) ambiguous = true; else failed = true; return; }
      if (status !== "completed") return;
      const rawUrl = typeof row.url === "string" && row.url.trim() ? row.url : row.file_url;
      // A completed host row may arrive before its asset URL. It establishes
      // linkage, but only a later complete output can establish success.
      if (typeof rawUrl !== "string" || !rawUrl.trim()) return;
      if (rawUrl.length > 16_384) { ambiguous = true; return; }
      if (failed) ambiguous = true;
      if (video && (video.assetId !== assetId || video.url !== rawUrl)) ambiguous = true;
      else video = { assetId, artifactId, url: rawUrl };
    };
    const bind = (assetId: string): boolean => {
      // The placeholder is an uploaded stub, never the generated output.
      if (assetId === placeholderId) return false;
      if (outputAssetId && outputAssetId !== assetId) { ambiguous = true; return false; }
      outputAssetId = assetId;
      const previous = observedAssets.get(assetId);
      if (previous) complete(previous, assetId);
      return true;
    };
    const consumeArtifact = (raw: unknown, terminal: boolean) => {
      const row = object(raw);
      if (!row || row.id !== artifactId) return;
      if (row.type !== undefined && row.type !== "video") { ambiguous = true; return; }
      if (row.project_id !== undefined && row.project_id !== input.projectId) { ambiguous = true; return; }
      const assetId = identifier(row.asset_id);
      if (!assetId) { if (terminal) ambiguous = true; return; }
      if (bind(assetId) && terminal) complete(row, assetId);
    };
    const consumeAsset = (raw: unknown) => {
      const row = object(raw);
      const assetId = identifier(row?.asset_id ?? row?.id);
      if (!row || !assetId || assetId === placeholderId) return;
      if (row.type !== undefined && row.type !== "video") return;
      if (row.role !== undefined && row.role !== "output" && row.role !== "generated_video") return;
      if (row.artifact_id !== undefined && row.artifact_id !== artifactId) return;
      if (row.artifact_id === artifactId) bind(assetId);
      if (assetId === outputAssetId) complete(row, assetId);
      else {
        // Asset events can precede their artifact link. Retain only a bounded
        // set from this stream; never accept them until the host proves linkage.
        if (!observedAssets.has(assetId) && observedAssets.size >= 20) { ambiguous = true; return; }
        observedAssets.set(assetId, row);
      }
    };
    const consume = (value: unknown, eventName = "message", diagnosticValue: unknown = value) => {
      const event = object(value);
      const type = typeof event?.type === "string" ? event.type : eventName;
      // Diagnostics only contain names from this finite vocabulary, never
      // arbitrary platform strings that might embed credentials or URLs.
      input.onEvent(["artifact", "artifact_status", "asset_status", "error", "scheduled", "status", "progress", "message", "done"].includes(type) ? type : "other", eventShape(diagnosticValue));
      if (!event) { ambiguous = true; return; }
      const explicitError = event.error !== undefined && event.error !== null && event.error !== false && event.error !== "";
      if (event.ok === false || explicitError || generationStatus(event.status) === "failed" || type === "error") {
        if (video) ambiguous = true;
        else failed = true;
        return;
      }
      const content = object(event.content);
      if (!content) return;
      if (type === "artifact") { consumeArtifact(content, false); return; }
      if (type !== "artifact_status" && type !== "asset_status") return;
      const artifacts = Array.isArray(content.artifacts) ? content.artifacts : [];
      const assets = Array.isArray(content.assets) ? content.assets : [];
      if (artifacts.length > 20 || assets.length > 20) { ambiguous = true; return; }
      // If a frame contains both collections, establish host linkage before
      // examining assets. Separate official frames and reverse order work too.
      for (const raw of artifacts) consumeArtifact(raw, true);
      for (const raw of assets) consumeAsset(raw);
    };

    if (response.headers.get("content-type")?.includes("application/json")) {
      let value: unknown;
      try { value = JSON.parse(new TextDecoder().decode(await boundedBody(response, MAX_RESPONSE_BYTES))); }
      catch { return { status: "unconfirmed" }; }
      const envelope = object(value);
      const code = typeof envelope?.code === "number" ? envelope.code
        : typeof envelope?.code === "string" && /^2\d{2}$/.test(envelope.code) ? Number(envelope.code) : null;
      const accepted = code !== null && code >= 200 && code < 300;
      if (envelope?.code !== undefined && !accepted) { input.onEvent("error", eventShape(value)); return { status: "failed" }; }
      // An accepted/scheduled JSON envelope is not a failed task and cannot
      // release the account fence. Only an identified terminal output below
      // establishes success; all other positive 2xx shapes stay unconfirmed.
      consume(accepted ? envelope?.data : value, "message", value);
    } else if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let bytes = 0;
      let eventName = "message";
      let dataLines: string[] = [];
      let dataSize = 0;
      let streamDone = false;
      const dispatch = () => {
        if (dataLines.length) {
          const data = dataLines.join("\n");
          if (data.trim() === "[DONE]") { input.onEvent("done"); streamDone = true; }
          else { try { consume(JSON.parse(data), eventName); } catch { ambiguous = true; input.onEvent("other"); } }
        }
        dataLines = []; dataSize = 0; eventName = "message";
      };
      const line = (value: string) => {
        if (value === "") { dispatch(); return; }
        if (value.startsWith(":")) return;
        const colon = value.indexOf(":");
        const field = colon < 0 ? value : value.slice(0, colon);
        const rest = colon < 0 ? "" : value.slice(colon + 1).replace(/^ /, "");
        if (field === "event") eventName = rest;
        if (field === "data") { dataLines.push(rest); dataSize += rest.length; }
        if (dataSize > MAX_RESPONSE_BYTES) throw new RealGenerationError("protocol_unconfirmed");
      };
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) throw new RealGenerationError("protocol_unconfirmed");
          buffer += decoder.decode(next.value, { stream: true });
          while (!streamDone) {
            const newline = buffer.search(/[\r\n]/);
            if (newline < 0 || (buffer[newline] === "\r" && newline === buffer.length - 1)) break;
            const length = buffer[newline] === "\r" && buffer[newline + 1] === "\n" ? 2 : 1;
            line(buffer.slice(0, newline)); buffer = buffer.slice(newline + length);
          }
          if (streamDone) break;
        }
        if (!streamDone) {
          buffer += decoder.decode();
          if (buffer.endsWith("\r")) { line(buffer.slice(0, -1)); buffer = ""; }
        }
        // SSE events are dispatched only after a full blank-line frame. A
        // truncated final frame cannot establish successful completion.
        if (!streamDone && (buffer.length || dataLines.length)) ambiguous = true;
      } catch {
        // A complete, unambiguous terminal output frame establishes the
        // result even if the transport fails after it. Never infer success
        // from a partially received frame or from DONE alone.
        if (!video) ambiguous = true;
      }
      finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    } else return { status: "unconfirmed" };
    if (ambiguous) return { status: "unconfirmed" };
    if (failed) return { status: "failed" };
    return video && !ambiguous ? { status: "succeeded", video } : { status: "unconfirmed" };
  }

  async download(token: string, video: PlatformVideo, signal: AbortSignal): Promise<{ contentType: string; body: Uint8Array }> {
    const target = safeResultUrl(video.url);
    const headers = new Headers({ Accept: "video/*,*/*" });
    if (!target.proxy) { headers.set("Authorization", `Bearer ${token}`); headers.set("X-Platform", REAL_GENERATION_CALL_SOURCE); }
    let response: Response;
    try { response = await this.fetcher(target.url, { headers, redirect: "error", signal: AbortSignal.any([this.lifecycle.signal, signal, AbortSignal.timeout(60_000)]) }); }
    catch { throw new RealGenerationError("save_unavailable"); }
    // The public website proxy receives no bearer token. Its cookie gate or
    // target rejection cannot establish that the Web API token has expired.
    if (response.status === 401) throw new RealGenerationError(target.proxy ? "save_unavailable" : "expired");
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!response.ok || (contentType !== "video/mp4" && contentType !== "application/octet-stream")) throw new RealGenerationError("save_unavailable");
    const body = await boundedBody(response, MAX_VIDEO_BYTES);
    // MP4 results must be bytes rather than an HTML/JSON login page with a
    // misleading MIME type. ftyp is the ISO BMFF signature for this slice.
    if (body.length < 12 || new TextDecoder().decode(body.slice(4, 8)) !== "ftyp") throw new RealGenerationError("save_unavailable");
    return { contentType: "video/mp4", body };
  }
}
