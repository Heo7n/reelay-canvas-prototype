import { createHash } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { WorkspaceMediaAsset, ProjectAsset } from "../../domain/asset/workspace-media-asset";
import type { SessionActor } from "../../domain/identity/session";
import type { ObjectStore, StoredObjectMetadata } from "../application/ObjectStore";
import { ImagePreviewService, ImagePreviewUnsupportedError, ImagePreviewUnavailableError } from "../infrastructure/ImagePreviewService";
import type { ProjectAccessReader } from "../application/ProjectStore";
import {
  ProjectAssetUnavailableError,
  type ProjectAssetReferenceStore,
} from "../application/ProjectAssetReferenceStore";
import type { SessionActorReader } from "../application/SessionStore";
import {
  AssetUploadConflictError,
  AssetUploadIntentUnavailableError,
  AssetWorkspaceUnavailableError,
  PersonalAssetUnavailableError,
  type WorkspaceMediaAssetStore,
} from "../application/WorkspaceMediaAssetStore";
import {
  AssetUploadParamsSchema,
  AssetContentQuerySchema,
  CreateAssetUploadIntentBodySchema,
  PersonalAssetQuerySchema,
  ProjectAssetContentParamsSchema,
  ProjectAssetItemParamsSchema,
  ProjectAssetParamsSchema,
  RenamePersonalAssetBodySchema,
  WorkspaceAssetItemParamsSchema,
  WorkspaceAssetParamsSchema,
} from "./asset-contracts";
import { getRequestActor } from "./session-context";

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

const CONTENT_TYPES_BY_KIND = Object.freeze({
  image: new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/ogg", "video/quicktime", "video/webm"]),
  audio: new Set([
    "audio/aac",
    "audio/flac",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-wav",
  ]),
});

interface AssetRouteDependencies {
  maxUploadBytes?: number;
  assetStore: WorkspaceMediaAssetStore & ProjectAssetReferenceStore;
  objectStore: ObjectStore;
  projects: ProjectAccessReader;
  sessions: SessionActorReader;
}

interface ByteRange {
  start: number;
  end: number;
}

async function requireActor(
  request: FastifyRequest,
  reply: FastifyReply,
  sessions: SessionActorReader,
): Promise<SessionActor | null> {
  const actor = await getRequestActor(request, sessions);
  if (!actor) {
    reply.code(401).send({ error: { code: "session_required", message: "请先登录演示账号。" } });
    return null;
  }
  return actor;
}

function workspaceAssetDto(asset: WorkspaceMediaAsset) {
  return {
    id: asset.id,
    workspaceId: asset.workspaceId,
    mediaKind: asset.mediaKind,
    displayName: asset.displayName,
    objectVersion: asset.objectVersion,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function projectAssetDto(projectAsset: ProjectAsset) {
  const { reference, asset } = projectAsset;
  return {
    referenceId: reference.id,
    assetId: asset.id,
    assetVersion: reference.assetVersion,
    mediaKind: asset.mediaKind,
    displayName: asset.displayName,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    contentUrl: `/api/projects/${encodeURIComponent(reference.projectId)}/asset-references/${encodeURIComponent(reference.id)}/content`,
  };
}

function parseByteRange(value: string | undefined, byteSize: number): ByteRange | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";

  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    return { start: Math.max(0, byteSize - suffixLength), end: byteSize - 1 };
  }

  const start = Number.parseInt(match[1], 10);
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : byteSize - 1;
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || start >= byteSize
    || requestedEnd < start
  ) return "invalid";
  return { start, end: Math.min(requestedEnd, byteSize - 1) };
}

function setStoredObjectHeaders(reply: FastifyReply, metadata: StoredObjectMetadata): FastifyReply {
  return reply
    .header("Accept-Ranges", "bytes")
    .header("Cache-Control", "private, no-cache")
    .header("Vary", "Cookie")
    .header("Content-Type", metadata.contentType)
    .header("ETag", `"${metadata.etag}"`)
    .header("X-Content-Type-Options", "nosniff");
}

function unavailableObject(reply: FastifyReply) {
  return reply.header("Cache-Control", "private, no-store").code(503).send({
    error: { code: "asset_content_unavailable", message: "素材内容暂时不可用。" },
  });
}

async function sendStoredObject(
  request: FastifyRequest,
  reply: FastifyReply,
  objectStore: ObjectStore,
  asset: WorkspaceMediaAsset,
) {
  // The authorized, immutable asset record already contains the representation
  // identity and length. Revalidation must not download that same object again.
  const metadata: StoredObjectMetadata = {
    objectKey: asset.objectKey,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    etag: asset.checksumSha256,
  };
  const etag = `"${metadata.etag}"`;
  const unchanged = request.headers["if-none-match"]?.split(",").some((value) => {
    const token = value.trim();
    return token === "*" || token.replace(/^W\//, "") === etag;
  });
  if (unchanged) return setStoredObjectHeaders(reply, metadata).code(304).send();
  if (request.method === "HEAD") {
    return setStoredObjectHeaders(reply, metadata)
      .header("Content-Length", String(metadata.byteSize)).send();
  }
  // Only a matching strong validator can safely resume an earlier byte range.
  const ifRange = request.headers["if-range"];
  const rangeHeader = ifRange !== undefined && (typeof ifRange !== "string" || ifRange.trim() !== etag)
    ? undefined : request.headers.range;
  const range = parseByteRange(rangeHeader, metadata.byteSize);

  if (range === "invalid") {
    return setStoredObjectHeaders(reply, metadata)
      .code(416)
      .header("Cache-Control", "private, no-store")
      .header("Content-Range", `bytes */${metadata.byteSize}`)
      .send();
  }

  // Remote audio/video and large originals must not buffer through the Function response limit.
  // Both content routes authorize the current actor before reaching this point.
  // A non-cacheable, short-lived redirect lets Storage serve byte ranges directly.
  const directDownload = asset.mediaKind === "audio" || asset.mediaKind === "video"
    || metadata.byteSize > 4 * 1024 * 1024;
  if (directDownload && objectStore.createSignedDownload) {
    const download = await objectStore.createSignedDownload(asset.objectKey, 300);
    if (!download
      || download.objectKey !== metadata.objectKey
      || download.contentType !== metadata.contentType
      || download.byteSize !== metadata.byteSize
      || download.checksumSha256 !== metadata.checksumSha256
      || download.etag !== metadata.etag) return unavailableObject(reply);
    return reply.header("Cache-Control", "private, no-store")
      .header("Vary", "Cookie")
      .header("Referrer-Policy", "no-referrer")
      .redirect(download.url, 307);
  }

  const object = await objectStore.getObject(asset.objectKey, range ? { range } : undefined);
  const expectedLength = range ? range.end - range.start + 1 : metadata.byteSize;
  if (
    !object
    || object.objectKey !== metadata.objectKey
    || object.contentType !== metadata.contentType
    || object.byteSize !== metadata.byteSize
    || object.checksumSha256 !== metadata.checksumSha256
    || object.etag !== metadata.etag
    || object.body.byteLength !== expectedLength
  ) return unavailableObject(reply);

  setStoredObjectHeaders(reply, metadata);
  if (range) {
    return reply
      .code(206)
      .header("Content-Length", String(object.body.byteLength))
      .header("Content-Range", `bytes ${range.start}-${range.end}/${metadata.byteSize}`)
      .send(Buffer.from(object.body.buffer, object.body.byteOffset, object.body.byteLength));
  }
  reply
    .header("Content-Length", String(metadata.byteSize));
  return reply.send(Buffer.from(object.body.buffer, object.body.byteOffset, object.body.byteLength));
}

function uploadConflict(reply: FastifyReply, error: AssetUploadConflictError) {
  const messages: Record<AssetUploadConflictError["reason"], string> = {
    expired: "上传凭证已过期，请重新选择文件。",
    idempotency_key_reused: "上传请求标识已用于其他文件。",
    metadata_mismatch: "上传内容与登记的文件信息不一致。",
    not_uploaded: "文件尚未完成上传。",
  };
  return reply.code(409).send({
    error: { code: `asset_upload_${error.reason}`, message: messages[error.reason] },
  });
}

// Both callers have already checked the session and the asset's current visibility.
// A cached thumbnail may be reused only after that same authorization succeeds.
async function sendAssetContent(
  request: FastifyRequest,
  reply: FastifyReply,
  objectStore: ObjectStore,
  previews: ImagePreviewService,
  asset: WorkspaceMediaAsset,
) {
  const query = AssetContentQuerySchema.safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: { code: "invalid_request", message: "素材预览参数无效。" } });
  if (!query.data.preview) return sendStoredObject(request, reply, objectStore, asset);
  if (asset.mediaKind !== "image") {
    return reply.code(415).send({ error: { code: "preview_unsupported", message: "此素材不支持图片缩略预览。" } });
  }
  const etag = previews.etag(asset, query.data.preview);
  const unchanged = request.headers["if-none-match"]?.split(",").some((value) => {
    const token = value.trim();
    return token === "*" || token.replace(/^W\//, "") === etag.replace(/^W\//, "");
  });
  reply.header("Cache-Control", "private, no-cache").header("Vary", "Cookie").header("ETag", etag);
  if (unchanged) return reply.code(304).send();
  try {
    const preview = await previews.getPreview(asset, query.data.preview);
    return reply
      .type("image/webp")
      .header("Content-Length", String(preview.body.byteLength))
      .header("X-Content-Type-Options", "nosniff")
      .send(Buffer.from(preview.body));
  } catch (error) {
    reply.header("Cache-Control", "private, no-store").removeHeader("ETag");
    if (error instanceof ImagePreviewUnsupportedError) {
      return reply.code(422).send({ error: { code: "preview_unsupported", message: "此图片暂时无法生成缩略预览，仍可查看原文件。" } });
    }
    if (error instanceof ImagePreviewUnavailableError) return unavailableObject(reply);
    throw error;
  }
}

export async function registerAssetRoutes(
  app: FastifyInstance,
  dependencies: AssetRouteDependencies,
): Promise<void> {
  const previews = new ImagePreviewService(dependencies.objectStore);
  const maxUploadBytes = dependencies.maxUploadBytes ?? MAX_UPLOAD_BYTES;
  const maxIntentBytes = dependencies.objectStore.createSignedUpload
    ? Math.max(maxUploadBytes, 50 * 1024 * 1024) : maxUploadBytes;
  if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0 || maxUploadBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Asset upload byte limit is invalid.");
  }
  if (!app.hasContentTypeParser("application/octet-stream")) {
    app.addContentTypeParser(
      "application/octet-stream",
      { parseAs: "buffer", bodyLimit: maxUploadBytes },
      (_request, body, done) => done(null, body),
    );
  }

  app.post("/api/workspaces/:workspaceId/media-upload-intents", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = WorkspaceAssetParamsSchema.safeParse(request.params);
    const body = CreateAssetUploadIntentBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "上传文件信息无效。" } });
    }
    if (body.data.byteSize > maxIntentBytes) {
      return reply.code(413).send({
        error: { code: "asset_too_large", message: `当前环境单个素材最大支持 ${maxIntentBytes / (1024 * 1024)} MB。` },
      });
    }
    if (!CONTENT_TYPES_BY_KIND[body.data.mediaKind].has(body.data.contentType)) {
      return reply.code(400).send({
        error: { code: "unsupported_media_type", message: "文件类型与素材类型不匹配。" },
      });
    }
    try {
      const intent = await dependencies.assetStore.createUploadIntent({
        actorId: actor.id,
        workspaceId: params.data.workspaceId,
        ...body.data,
      });
      const encodedWorkspaceId = encodeURIComponent(params.data.workspaceId);
      const encodedUploadId = encodeURIComponent(intent.id);
      if (body.data.byteSize > maxUploadBytes && intent.status !== "finalized"
        && Date.now() >= Date.parse(intent.expiresAt)) {
        throw new AssetUploadConflictError("expired");
      }
      const upload = body.data.byteSize > maxUploadBytes && dependencies.objectStore.createSignedUpload
        ? await dependencies.objectStore.createSignedUpload({
          objectKey: intent.objectKey, contentType: intent.expectedContentType,
          checksumSha256: intent.expectedChecksumSha256,
        })
        : {
          url: `/api/workspaces/${encodedWorkspaceId}/media-upload-intents/${encodedUploadId}/content`,
          method: "PUT", headers: { "Content-Type": "application/octet-stream" },
        };
      return reply.code(201).send({
        uploadIntent: { id: intent.id, expiresAt: intent.expiresAt },
        upload,
      });
    } catch (error) {
      if (error instanceof AssetWorkspaceUnavailableError) {
        return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
      }
      if (error instanceof AssetUploadConflictError) return uploadConflict(reply, error);
      throw error;
    }
  });

  app.put(
    "/api/workspaces/:workspaceId/media-upload-intents/:uploadId/content",
    { config: { rawBody: false }, bodyLimit: maxUploadBytes },
    async (request, reply) => {
      const actor = await requireActor(request, reply, dependencies.sessions);
      if (!actor) return reply;
      const params = AssetUploadParamsSchema.safeParse(request.params);
      const body = Buffer.isBuffer(request.body) ? request.body : null;
      if (!params.success || !body || body.byteLength <= 0 || body.byteLength > maxUploadBytes) {
        return reply.code(400).send({ error: { code: "invalid_request", message: "上传内容无效。" } });
      }
      try {
        const intent = await dependencies.assetStore.getUploadIntent({
          actorId: actor.id,
          workspaceId: params.data.workspaceId,
          uploadIntentId: params.data.uploadId,
        });
        if (!intent) throw new AssetUploadIntentUnavailableError();
        const expiresAt = Date.parse(intent.expiresAt);
        if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
          throw new AssetUploadConflictError("expired");
        }
        const checksum = createHash("sha256").update(body).digest("hex");
        if (body.byteLength !== intent.expectedByteSize || checksum !== intent.expectedChecksumSha256) {
          throw new AssetUploadConflictError("metadata_mismatch");
        }
        const stored = await dependencies.objectStore.putObject({
          objectKey: intent.objectKey,
          contentType: intent.expectedContentType,
          body,
        });
        const recorded = await dependencies.assetStore.recordUpload({
          actorId: actor.id,
          workspaceId: params.data.workspaceId,
          uploadIntentId: intent.id,
          objectKey: stored.objectKey,
          contentType: stored.contentType,
          byteSize: stored.byteSize,
          checksumSha256: stored.checksumSha256,
          etag: stored.etag,
        });
        return { uploadIntent: { id: recorded.id, status: recorded.status, uploadedAt: recorded.uploadedAt } };
      } catch (error) {
        if (error instanceof AssetUploadIntentUnavailableError) {
          return reply.code(404).send({ error: { code: "asset_upload_not_found", message: "上传凭证不存在。" } });
        }
        if (error instanceof AssetWorkspaceUnavailableError) {
          return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
        }
        if (error instanceof AssetUploadConflictError) return uploadConflict(reply, error);
        throw error;
      }
    },
  );

  app.post(
    "/api/workspaces/:workspaceId/media-upload-intents/:uploadId/finalize",
    async (request, reply) => {
      const actor = await requireActor(request, reply, dependencies.sessions);
      if (!actor) return reply;
      const params = AssetUploadParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: { code: "invalid_request", message: "上传凭证无效。" } });
      }
      try {
        let intent = await dependencies.assetStore.getUploadIntent({
          actorId: actor.id,
          workspaceId: params.data.workspaceId,
          uploadIntentId: params.data.uploadId,
        });
        if (!intent) throw new AssetUploadIntentUnavailableError();
        if (intent.status !== "finalized" && Date.now() >= Date.parse(intent.expiresAt)) {
          throw new AssetUploadConflictError("expired");
        }
        // Direct uploads carry client-supplied metadata. Before publishing one,
        // read and hash the real bytes; HEAD alone is not evidence of integrity.
        const stored = intent.status === "pending"
          ? await dependencies.objectStore.getObject(intent.objectKey)
          : await dependencies.objectStore.headObject(intent.objectKey);
        if (!stored) throw new AssetUploadConflictError("not_uploaded");
        if (intent.status === "pending") {
          if (!("body" in stored) || !(stored.body instanceof Uint8Array)
            || stored.body.byteLength !== intent.expectedByteSize
            || createHash("sha256").update(stored.body).digest("hex") !== intent.expectedChecksumSha256) {
            throw new AssetUploadConflictError("metadata_mismatch");
          }
          intent = await dependencies.assetStore.recordUpload({
            actorId: actor.id,
            workspaceId: params.data.workspaceId,
            uploadIntentId: intent.id,
            objectKey: stored.objectKey,
            contentType: stored.contentType,
            byteSize: stored.byteSize,
            checksumSha256: stored.checksumSha256,
            etag: stored.etag,
          });
        }
        const asset = await dependencies.assetStore.finalizeUpload({
          actorId: actor.id,
          workspaceId: params.data.workspaceId,
          uploadIntentId: intent.id,
        });
        return { asset: workspaceAssetDto(asset) };
      } catch (error) {
        if (error instanceof AssetUploadIntentUnavailableError) {
          return reply.code(404).send({ error: { code: "asset_upload_not_found", message: "上传凭证不存在。" } });
        }
        if (error instanceof AssetWorkspaceUnavailableError) {
          return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
        }
        if (error instanceof AssetUploadConflictError) return uploadConflict(reply, error);
        throw error;
      }
    },
  );

  app.get("/api/workspaces/:workspaceId/media-assets", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = WorkspaceAssetParamsSchema.safeParse(request.params);
    const query = PersonalAssetQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "资产查询无效。" } });
    }
    try {
      const assets = await dependencies.assetStore.listPersonalAssets({
        actorId: actor.id,
        workspaceId: params.data.workspaceId,
      });
      return {
        assets: assets.map((asset) => ({
          ...workspaceAssetDto(asset),
          contentUrl: `/api/workspaces/${encodeURIComponent(asset.workspaceId)}/media-assets/${encodeURIComponent(asset.id)}/content`,
        })),
      };
    } catch (error) {
      if (error instanceof AssetWorkspaceUnavailableError) {
        return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
      }
      throw error;
    }
  });

  app.patch("/api/workspaces/:workspaceId/media-assets/:assetId", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = WorkspaceAssetItemParamsSchema.safeParse(request.params);
    const body = RenamePersonalAssetBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "素材名称无效。" } });
    }
    try {
      const asset = await dependencies.assetStore.renamePersonalAsset({
        actorId: actor.id,
        workspaceId: params.data.workspaceId,
        assetId: params.data.assetId,
        displayName: body.data.displayName,
      });
      return { asset: workspaceAssetDto(asset) };
    } catch (error) {
      if (error instanceof PersonalAssetUnavailableError) {
        return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在。" } });
      }
      if (error instanceof AssetWorkspaceUnavailableError) {
        return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
      }
      throw error;
    }
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/api/workspaces/:workspaceId/media-assets/:assetId/content",
    handler: async (request, reply) => {
      reply.header("Cache-Control", "private, no-store").header("Vary", "Cookie");
      const actor = await requireActor(request, reply, dependencies.sessions);
      if (!actor) return reply;
      const params = WorkspaceAssetItemParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在。" } });
      try {
        const asset = await dependencies.assetStore.getPersonalAsset({
          actorId: actor.id,
          workspaceId: params.data.workspaceId,
          assetId: params.data.assetId,
        });
        if (!asset) return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在。" } });
        return sendAssetContent(request, reply, dependencies.objectStore, previews, asset);
      } catch (error) {
        if (error instanceof AssetWorkspaceUnavailableError) {
          return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
        }
        throw error;
      }
    },
  });

  app.get("/api/projects/:projectId/asset-references", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = ProjectAssetParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "invalid_request", message: "项目标识无效。" } });
    try {
      const assets = await dependencies.assetStore.listProjectAssets({
        actorId: actor.id,
        projectId: params.data.projectId,
      });
      return { projectAssets: assets.map(projectAssetDto) };
    } catch (error) {
      if (error instanceof ProjectAssetUnavailableError) {
        return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
      }
      throw error;
    }
  });

  app.put("/api/projects/:projectId/asset-references/:assetId", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = ProjectAssetItemParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "invalid_request", message: "项目资产标识无效。" } });
    const project = await dependencies.projects.getProjectById(actor.id, params.data.projectId);
    if (!project) return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
    if (project.currentUserRole === "view") {
      return reply.code(403).send({ error: { code: "project_forbidden", message: "当前项目权限为只读。" } });
    }
    try {
      const reference = await dependencies.assetStore.attachAssetToProject({
        actorId: actor.id,
        projectId: params.data.projectId,
        assetId: params.data.assetId,
      });
      const projectAsset = await dependencies.assetStore.getProjectAsset({
        actorId: actor.id,
        projectId: params.data.projectId,
        referenceId: reference.id,
      });
      if (!projectAsset) throw new ProjectAssetUnavailableError();
      return { projectAsset: projectAssetDto(projectAsset) };
    } catch (error) {
      if (error instanceof ProjectAssetUnavailableError) {
        return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在或不可加入此项目。" } });
      }
      throw error;
    }
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/api/projects/:projectId/asset-references/:referenceId/content",
    handler: async (request, reply) => {
      reply.header("Cache-Control", "private, no-store").header("Vary", "Cookie");
      const actor = await requireActor(request, reply, dependencies.sessions);
      if (!actor) return reply;
      const params = ProjectAssetContentParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在。" } });
      try {
        const projectAsset = await dependencies.assetStore.getProjectAsset({
          actorId: actor.id,
          projectId: params.data.projectId,
          referenceId: params.data.referenceId,
        });
        if (!projectAsset) return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在。" } });
        return sendAssetContent(request, reply, dependencies.objectStore, previews, projectAsset.asset);
      } catch (error) {
        if (error instanceof ProjectAssetUnavailableError) {
          return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在。" } });
        }
        throw error;
      }
    },
  });
}
