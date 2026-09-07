import type {
  CreateWorkspaceEntityInput,
  EntityRepository,
  UpdateWorkspaceEntityInput,
  WorkspaceEntity,
} from "../../application/assets/EntityRepository";
import type {
  MediaAssetRepository,
  PersonalMediaAsset,
  ProjectMediaAsset,
} from "../../application/assets/MediaAssetRepository";
import type {
  ImportTransientMediaInput,
  TransientMediaRepository,
} from "../../application/assets/TransientMediaRepository";
import { ApplicationError } from "../../application/shared/ApplicationError";
import {
  EntityValidationError,
  normalizeEntityContent,
  normalizeEntityIdempotencyKey,
  normalizeExpectedEntityVersion,
} from "../../domain/asset/entity";
import { createExperienceAssetFixtures } from "./experience-fixtures";

export const EXPERIENCE_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const EXPERIENCE_MAX_IMPORT_BYTES = 128 * 1024 * 1024;

const CONTENT_TYPES_BY_KIND = {
  image: new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/ogg", "video/quicktime", "video/webm"]),
  audio: new Set(["audio/aac", "audio/flac", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/x-wav"]),
};

interface ExperienceAssetStoreOptions {
  workspaceId: string;
  hasProject: (projectId: string) => boolean;
}

function invalid(message: string, serviceCode = "invalid_request"): ApplicationError {
  return new ApplicationError("request_failed", message, { serviceCode });
}

function normalizeDisplayName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 300) throw invalid("素材名称需为 1–300 个字符。");
  return name;
}

/** Browser-page-owned data, with no network client or persistent storage. */
export class ExperienceAssetStore implements TransientMediaRepository {
  private readonly assets = new Map<string, PersonalMediaAsset>();
  private readonly entityRecords = new Map<string, WorkspaceEntity>();
  private readonly projectReferences = new Map<string, Map<string, string>>();
  private readonly entityCreations = new Map<string, { entityId: string; fingerprint: string }>();
  private readonly objectUrls = new Set<string>();
  private allocatedBytes = 0;
  private generation = 0;
  private disposed = false;

  readonly media: MediaAssetRepository = {
    createUploadIntent: async () => {
      this.requireActive();
      throw invalid("体验素材请使用本页临时导入。", "transient_upload_required");
    },
    finalizeUpload: async () => {
      this.requireActive();
      throw invalid("体验素材请使用本页临时导入。", "transient_upload_required");
    },
    renamePersonalAsset: async (workspaceId, assetId, displayName) => {
      this.requireWorkspace(workspaceId);
      const current = this.requireAsset(assetId);
      const asset = { ...current, displayName: normalizeDisplayName(displayName), updatedAt: new Date().toISOString() };
      this.assets.set(assetId, asset);
      return structuredClone(asset);
    },
    attachToProject: async (projectId, assetId) => {
      this.requireProject(projectId);
      return this.attach(projectId, this.requireAsset(assetId));
    },
    listPersonalAssets: async (workspaceId) => {
      this.requireWorkspace(workspaceId);
      return structuredClone([...this.assets.values()]);
    },
    listProjectAssets: async (projectId) => {
      this.requireProject(projectId);
      return [...(this.projectReferences.get(projectId) ?? [])].map(([assetId, referenceId]) => (
        this.projectAsset(this.requireAsset(assetId), referenceId)
      ));
    },
  };

  readonly entities: EntityRepository = {
    create: async (input) => this.createEntity(input),
    get: async (workspaceId, entityId) => {
      this.requireWorkspace(workspaceId);
      return structuredClone(this.requireEntity(entityId));
    },
    listPersonal: async (workspaceId) => {
      this.requireWorkspace(workspaceId);
      return structuredClone([...this.entityRecords.values()]);
    },
    update: async (input) => this.updateEntity(input),
  };

  constructor(private readonly options: ExperienceAssetStoreOptions) {
    this.reset();
  }

  readonly importFile = async (input: ImportTransientMediaInput): Promise<{
    asset: PersonalMediaAsset;
    projectAsset: ProjectMediaAsset | null;
  }> => {
    this.requireWorkspace(input.workspaceId);
    this.requireProject(input.projectId);
    if (input.target !== "personal" && input.target !== "project") throw invalid("素材目标无效。");
    const { projectId, target, mediaKind } = input;
    const displayName = normalizeDisplayName(input.displayName);
    const contentType = input.contentType.trim().toLowerCase();
    if (!CONTENT_TYPES_BY_KIND[mediaKind]?.has(contentType)) throw invalid("暂不支持此素材格式。");
    const byteSize = input.body.byteLength;
    if (byteSize === 0) throw invalid("无法导入空文件。");
    if (byteSize > EXPERIENCE_MAX_FILE_BYTES) throw invalid("体验版单个素材最大支持 4 MB。", "asset_too_large");
    if (this.allocatedBytes + byteSize > EXPERIENCE_MAX_IMPORT_BYTES) {
      throw invalid("本次体验的临时素材已达 128 MB，刷新页面后可重新体验。", "experience_memory_limit");
    }

    // Reserve before asynchronous hashing so simultaneous imports share one limit.
    const generation = this.generation;
    this.allocatedBytes += byteSize;
    let objectUrl: string | undefined;
    try {
      const body = input.body.slice(0);
      const digest = await crypto.subtle.digest("SHA-256", body);
      this.requireActive();
      if (generation !== this.generation) throw invalid("本次体验已重置，请重新导入。", "experience_reset");
      this.requireProject(projectId);
      const checksumSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      objectUrl = URL.createObjectURL(new Blob([body], { type: contentType }));
      const timestamp = new Date().toISOString();
      const asset: PersonalMediaAsset = {
        id: `experience-media-${crypto.randomUUID()}`,
        workspaceId: this.options.workspaceId,
        mediaKind,
        displayName,
        objectVersion: 1,
        contentType,
        byteSize,
        checksumSha256,
        contentUrl: objectUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.assets.set(asset.id, asset);
      this.objectUrls.add(objectUrl);
      return {
        asset: structuredClone(asset),
        projectAsset: target === "project" ? this.attach(projectId, asset) : null,
      };
    } catch (error) {
      if (generation === this.generation) this.allocatedBytes -= byteSize;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      throw error;
    }
  };

  reset(): void {
    this.requireActive();
    this.clear();
    const fixtures = createExperienceAssetFixtures(this.options.workspaceId);
    for (const asset of fixtures.media) this.assets.set(asset.id, asset);
    for (const entity of fixtures.entities) this.entityRecords.set(entity.id, entity);
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
  }

  private clear(): void {
    this.generation += 1;
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.assets.clear();
    this.entityRecords.clear();
    this.projectReferences.clear();
    this.entityCreations.clear();
    this.allocatedBytes = 0;
  }

  private requireActive(): void {
    if (this.disposed) throw invalid("本次体验已结束。", "experience_disposed");
  }

  private requireWorkspace(workspaceId: string): void {
    this.requireActive();
    if (workspaceId !== this.options.workspaceId) throw new ApplicationError("not_found", "空间不存在。");
  }

  private requireProject(projectId: string): void {
    this.requireActive();
    if (!this.options.hasProject(projectId)) throw new ApplicationError("not_found", "项目不存在。");
  }

  private requireAsset(assetId: string): PersonalMediaAsset {
    const asset = this.assets.get(assetId);
    if (!asset) throw new ApplicationError("not_found", "素材不存在。");
    return asset;
  }

  private requireEntity(entityId: string): WorkspaceEntity {
    const entity = this.entityRecords.get(entityId);
    if (!entity) throw new ApplicationError("not_found", "主体不存在。");
    return entity;
  }

  private attach(projectId: string, asset: PersonalMediaAsset): ProjectMediaAsset {
    let references = this.projectReferences.get(projectId);
    if (!references) {
      references = new Map();
      this.projectReferences.set(projectId, references);
    }
    let referenceId = references.get(asset.id);
    if (!referenceId) {
      referenceId = `experience-reference-${crypto.randomUUID()}`;
      references.set(asset.id, referenceId);
    }
    return this.projectAsset(asset, referenceId);
  }

  private projectAsset(asset: PersonalMediaAsset, referenceId: string): ProjectMediaAsset {
    return {
      referenceId,
      assetId: asset.id,
      assetVersion: asset.objectVersion,
      mediaKind: asset.mediaKind,
      displayName: asset.displayName,
      contentType: asset.contentType,
      byteSize: asset.byteSize,
      checksumSha256: asset.checksumSha256,
      contentUrl: asset.contentUrl,
    };
  }

  private entityContent(input: CreateWorkspaceEntityInput | UpdateWorkspaceEntityInput) {
    try {
      const content = normalizeEntityContent({
        name: input.name,
        description: input.description,
        mediaAssetIds: input.assetIds,
        coverMediaId: input.coverAssetId,
      });
      for (const ref of content.mediaRefs) this.requireAsset(ref.mediaAssetId);
      return {
        name: content.name,
        description: content.description,
        mediaRefs: content.mediaRefs.map((ref) => ({ assetId: ref.mediaAssetId, order: ref.order })),
        coverAssetId: content.coverMediaId,
      };
    } catch (error) {
      if (error instanceof EntityValidationError) throw invalid(error.message, error.reason);
      throw error;
    }
  }

  private createEntity(input: CreateWorkspaceEntityInput): WorkspaceEntity {
    this.requireWorkspace(input.workspaceId);
    let key: string;
    try {
      key = normalizeEntityIdempotencyKey(input.idempotencyKey);
    } catch (error) {
      if (error instanceof EntityValidationError) throw invalid(error.message, error.reason);
      throw error;
    }
    const content = this.entityContent(input);
    const fingerprint = JSON.stringify(content);
    const previous = this.entityCreations.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ApplicationError("conflict", "本次创建请求的内容已改变。");
      return structuredClone(this.requireEntity(previous.entityId));
    }
    const timestamp = new Date().toISOString();
    const entity: WorkspaceEntity = {
      id: `experience-entity-${crypto.randomUUID()}`,
      workspaceId: this.options.workspaceId,
      ...content,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.entityRecords.set(entity.id, entity);
    this.entityCreations.set(key, { entityId: entity.id, fingerprint });
    return structuredClone(entity);
  }

  private updateEntity(input: UpdateWorkspaceEntityInput): WorkspaceEntity {
    this.requireWorkspace(input.workspaceId);
    const current = this.requireEntity(input.entityId);
    try {
      normalizeExpectedEntityVersion(input.expectedVersion);
    } catch (error) {
      if (error instanceof EntityValidationError) throw invalid(error.message, error.reason);
      throw error;
    }
    if (input.expectedVersion !== current.version) throw new ApplicationError("conflict", "主体已更新，请重新打开编辑。");
    const entity: WorkspaceEntity = {
      ...current,
      ...this.entityContent(input),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.entityRecords.set(entity.id, entity);
    return structuredClone(entity);
  }
}
