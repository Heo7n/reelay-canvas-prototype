import type {
  CreateWorkspaceEntityInput,
  EntityRepository,
  EntitySpace,
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
import type { MediaLibraryRepository } from "../../application/assets/MediaLibraryRepository";
import {
  validateLibraryEntityMove, BUILTIN_LIBRARY_TAGS, MediaLibraryError, libraryNameKey, normalizeLibraryName,
  planLibraryDeletion, planLibraryTagDeletion, planLibraryTagUpdate, validateLibraryFolderRename, validateLibraryFolder, validateLibrarySave,
  type LibraryEntry, type LibraryFolder, type LibraryTag, type MediaLibraryCatalog,
} from "../../domain/asset/media-library";
import { normalizeEntityLibraryTags, validateEntityLibraryTags, requireExpectedEntityLibraryTags } from "../../domain/asset/entity-library-tags";
import { ApplicationError } from "../../application/shared/ApplicationError";
import { buildMediaUploadPolicy, isLibraryUploadFormat } from "../../domain/asset/media-upload-policy";
import {
  EntityValidationError,
  normalizeEntityContent,
  normalizeEntityIdempotencyKey,
  normalizeExpectedEntityVersion,
} from "../../domain/asset/entity";
import { createExperienceAssetFixtures } from "./experience-fixtures";
import { DEMO_ASSET_FIXTURES, DEMO_ENTITY_FIXTURES } from "../../config/entity-demo-fixtures";
import { DEMO_ASSET_TAG_IDS } from "../../config/demo-asset-tags";
import { DEMO_LIBRARY_DIRECTORY_EXAMPLE } from "../../config/media-library-directory-example";

export const EXPERIENCE_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const EXPERIENCE_MAX_IMPORT_BYTES = 128 * 1024 * 1024;

const CONTENT_TYPES_BY_KIND = {
  image: new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp", "image/svg+xml"]),
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
  private readonly deletedLibraryEntities = new Set<string>();
  private readonly entityRecords = new Map<string, WorkspaceEntity>();
  private readonly projectReferences = new Map<string, Map<string, string>>();
  private readonly entityCreations = new Map<string, { entityId: string; fingerprint: string }>();
  private readonly objectUrls = new Set<string>();
  private readonly libraryFolders = new Map<string, LibraryFolder>();
  private readonly libraryTags = new Map<string, LibraryTag>();
  private readonly libraryEntries = new Map<string, LibraryEntry>();
  private readonly libraryEntityLocations = new Map<string, { folderId: string | null; addedAt: string }>();
  private readonly libraryEntityTags = new Map<string, string[]>();
  private allocatedBytes = 0;
  private generation = 0;
  private disposed = false;

  readonly library: MediaLibraryRepository = {
    list: async (workspaceId) => {
      this.requireWorkspace(workspaceId);
      return this.catalog();
    },
    createFolder: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      const name = validateLibraryFolder(this.catalog(), input);
      const folder: LibraryFolder = { id: `experience-folder-${crypto.randomUUID()}`,
        space: input.space, parentId: input.parentId, name };
      this.libraryFolders.set(folder.id, folder);
      return structuredClone(folder);
    }),
    renameFolder: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      const folder = validateLibraryFolderRename(this.catalog(), input);
      this.libraryFolders.set(folder.id, folder);
      return structuredClone(folder);
    }),
    createTag: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      const name = normalizeLibraryName(input.name);
      if (!name || name.length > 40 || /[\u0000-\u001f]/u.test(name)) throw invalid("标签名称需为 1–40 个字符。", "invalid_tag_name");
      const builtin = BUILTIN_LIBRARY_TAGS.find((tag) => libraryNameKey(tag.name) === libraryNameKey(name));
      if (builtin) return { ...builtin, space: input.space };
      const existing = [...this.libraryTags.values()].find((tag) => tag.space === input.space && libraryNameKey(tag.name) === libraryNameKey(name));
      if (existing) return structuredClone(existing);
      const tag: LibraryTag = { id: `experience-tag-${crypto.randomUUID()}`, space: input.space, name };
      this.libraryTags.set(tag.id, tag);
      return structuredClone(tag);
    }),
    delete: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      const entities = [...this.entityRecords.values()].filter((entity) => !this.deletedLibraryEntities.has(entity.id) && (entity.space ?? "personal") === input.space);
      const plan = planLibraryDeletion(this.catalog(), entities.map((entity) => ({ id: entity.id, version: entity.version, assetIds: entity.mediaRefs.map((ref) => ref.assetId) })), input);
      for (const id of plan.entityIds) {
        this.deletedLibraryEntities.add(id);
        this.libraryEntityTags.delete(id);
      }
      for (const [id, location] of this.libraryEntityLocations) {
        if (location.folderId && plan.folderIds.includes(location.folderId)) this.libraryEntityLocations.set(id, { ...location, folderId: null });
      }
      for (const id of plan.assetIds) this.libraryEntries.delete(`${input.space}:${id}`);
      for (const id of plan.folderIds) this.libraryFolders.delete(id);
      return this.catalog();
    }),
    deleteTag: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      const catalog = planLibraryTagDeletion(this.catalog(), input);
      // Validate the observed usage before changing the dictionary or any placement.
      this.libraryTags.clear();
      for (const tag of catalog.tags) this.libraryTags.set(tag.id, tag);
      for (const entry of catalog.entries) this.libraryEntries.set(`${entry.space}:${entry.assetId}`, entry);
      for (const entry of catalog.entityEntries ?? []) this.libraryEntityTags.set(entry.entityId, entry.tagIds);
      return this.catalog();
    }),
    updateTags: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      const plan = planLibraryTagUpdate(this.catalog(), input);
      // The full selection is validated before either media or group metadata changes.
      for (const item of plan.items) {
        if (item.kind === "entity") this.libraryEntityTags.set(item.id, item.tagIds);
        else {
          const key = `${plan.space}:${item.id}`;
          this.libraryEntries.set(key, { ...this.libraryEntries.get(key)!, tagIds: item.tagIds });
        }
      }
      return this.catalog();
    }),
    moveEntities: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      const normalized = validateLibraryEntityMove(this.catalog(), input);
      for (const item of normalized.items) {
        const current = this.libraryEntityLocations.get(item.entityId);
        if ((current?.folderId ?? null) !== normalized.folderId) this.libraryEntityLocations.set(item.entityId, { folderId: normalized.folderId, addedAt: new Date().toISOString() });
      }
      return this.catalog();
    }),
    save: async (input) => this.libraryOperation(() => {
      this.requireWorkspace(input.workspaceId);
      this.requireProject(input.projectId);
      const normalized = validateLibrarySave(this.catalog(), input);
      // Validate the complete batch before committing any placement.
      const entries = normalized.items.map((item) => {
        const asset = this.requireAsset(item.assetId);
        if (![...this.libraryEntries.values()].some((entry) => entry.assetId === asset.id) && !this.projectReferences.get(input.projectId)?.has(asset.id)) throw new ApplicationError("not_found", "素材不存在或无法从当前项目保存。");
        const existing = this.libraryEntries.get(`${normalized.space}:${item.assetId}`);
        if (existing && item.action === "add") return existing;
        return { ...this.libraryEntry(asset), createdAt: existing?.createdAt ?? new Date().toISOString(),
          addedAt: existing && existing.folderId === normalized.folderId ? existing.addedAt ?? existing.createdAt : new Date().toISOString(), displayName: item.displayName,
          space: normalized.space, folderId: normalized.folderId, tagIds: [...normalized.tagIds] };
      });
      for (const entry of entries) this.libraryEntries.set(`${entry.space}:${entry.assetId}`, entry);
      return this.catalog();
    }),
  };

  readonly media: MediaAssetRepository = {
    library: this.library,
    getUploadPolicy: async (workspaceId) => {
      this.requireWorkspace(workspaceId);
      return buildMediaUploadPolicy(EXPERIENCE_MAX_FILE_BYTES);
    },
    createUploadIntent: async () => {
      this.requireActive();
      throw invalid("体验素材请使用本页临时导入。", "transient_upload_required");
    },
    finalizeUpload: async () => {
      this.requireActive();
      throw invalid("体验素材请使用本页临时导入。", "transient_upload_required");
    },
    renamePersonalAsset: async (workspaceId, assetId, displayName, space = "personal") => {
      this.requireWorkspace(workspaceId);
      const current = this.requireAsset(assetId);
      if (!this.libraryEntries.has(`${space}:${assetId}`)) throw new ApplicationError("not_found", "素材不存在。");
      const asset = { ...current, displayName: normalizeDisplayName(displayName), updatedAt: new Date().toISOString() };
      const entry = this.libraryEntries.get(`${space}:${assetId}`);
      if (entry) this.libraryEntries.set(`${space}:${assetId}`, { ...entry, displayName: asset.displayName });
      return structuredClone(asset);
    },
    attachToProject: async (projectId, assetId) => {
      this.requireProject(projectId);
      if (![...this.libraryEntries.values()].some((entry) => entry.assetId === assetId)) throw new ApplicationError("not_found", "素材不存在。");
      return this.attach(projectId, this.requireAsset(assetId));
    },
    listPersonalAssets: async (workspaceId) => {
      this.requireWorkspace(workspaceId);
      return structuredClone([...this.libraryEntries.values()].filter((entry) => entry.space === "personal").map((entry) => ({ ...this.requireAsset(entry.assetId), displayName: entry.displayName })));
    },
    listProjectAssets: async (projectId) => {
      this.requireProject(projectId);
      return [...(this.projectReferences.get(projectId) ?? [])].map(([assetId, referenceId]) => (
        this.projectAsset(this.requireAsset(assetId), referenceId)
      ));
    },
  };

  readonly entities: EntityRepository = {
    create: async (input) => this.libraryOperation(() => this.createEntity(input)),
    get: async (workspaceId, entityId, space = "personal") => {
      this.requireWorkspace(workspaceId);
      return this.entityWithTags(this.requireEntity(entityId, space));
    },
    listPersonal: async (workspaceId, space = "personal") => {
      this.requireWorkspace(workspaceId);
      return [...this.entityRecords.values()].filter((entity) => !this.deletedLibraryEntities.has(entity.id) && (entity.space ?? "personal") === space).map((entity) => this.entityWithTags(entity));
    },
    update: async (input) => this.libraryOperation(() => this.updateEntity(input)),
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
    const providedType = input.contentType.trim().toLowerCase();
    const contentType = buildMediaUploadPolicy(EXPERIENCE_MAX_FILE_BYTES).library.contentTypeAliases[providedType] || providedType;
    if (!CONTENT_TYPES_BY_KIND[mediaKind]?.has(contentType)) throw invalid("暂不支持此素材格式。");
    if (input.uploadPurpose === "library" && !isLibraryUploadFormat({ mediaKind, contentType, displayName: input.displayName })) {
      throw invalid("资产库暂不支持此文件格式。");
    }
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
      const space = input.storageSpace ?? "personal";
      this.libraryEntries.set(`${space}:${asset.id}`, { ...this.libraryEntry(asset), space });
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
    for (const asset of fixtures.media) {
      this.assets.set(asset.id, asset);
      this.libraryEntries.set(`personal:${asset.id}`, this.libraryEntry(asset));
    }
    for (const fixture of DEMO_ASSET_FIXTURES) {
      const key = `personal:experience-${fixture.staticMediaId}`;
      const entry = this.libraryEntries.get(key);
      if (entry) this.libraryEntries.set(key, { ...entry, tagIds: [...(DEMO_ASSET_TAG_IDS[fixture.key] ?? [])] });
    }
    for (const entity of fixtures.entities) this.entityRecords.set(entity.id, entity);
    for (const fixture of DEMO_ENTITY_FIXTURES) {
      if (["umbra", "baixi", "xuanling"].includes(fixture.key)) {
        this.libraryEntityTags.set(`experience-${fixture.staticEntityId}`, ["builtin:character"]);
      }
    }
    this.resetLibraryDirectoryExample();
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
    this.deletedLibraryEntities.clear();
    this.projectReferences.clear();
    this.entityCreations.clear();
    this.libraryEntries.clear();
    this.libraryEntityTags.clear();
    this.libraryEntityLocations.clear();
    this.libraryFolders.clear();
    this.libraryTags.clear();
    this.allocatedBytes = 0;
  }

  private requireActive(): void {
    if (this.disposed) throw invalid("本次体验已结束。", "experience_disposed");
  }

  private catalog(): MediaLibraryCatalog {
    return structuredClone({ folders: [...this.libraryFolders.values()], tags: [...this.libraryTags.values()],
      entries: [...this.libraryEntries.values()],
      entityEntries: [...this.entityRecords.keys()].filter((id) => !this.deletedLibraryEntities.has(id))
        .map((entityId) => ({ entityId, space: this.entityRecords.get(entityId)!.space ?? "personal", tagIds: this.libraryEntityTags.get(entityId) ?? [], folderId: this.libraryEntityLocations.get(entityId)?.folderId ?? null, addedAt: this.libraryEntityLocations.get(entityId)?.addedAt ?? this.entityRecords.get(entityId)!.createdAt })) });
  }

  private resetLibraryDirectoryExample(): void {
    const example = DEMO_LIBRARY_DIRECTORY_EXAMPLE;
    const fixture = DEMO_ASSET_FIXTURES.find((asset) => asset.key === example.assetKey);
    if (!fixture) throw new Error("The library directory example must reference an existing demo asset.");
    let parentId: string | null = null;
    for (const [index, name] of example.path.entries()) {
      const folder: LibraryFolder = { id: `experience-library-example-folder-${index + 1}`,
        name, parentId, space: "personal" };
      validateLibraryFolder(this.catalog(), { ...folder, workspaceId: this.options.workspaceId });
      this.libraryFolders.set(folder.id, folder);
      parentId = folder.id;
    }
    const asset = this.requireAsset(`experience-${fixture.staticMediaId}`);
    this.libraryEntries.set(`personal:${asset.id}`, { ...this.libraryEntry(asset),
      displayName: example.displayName, folderId: parentId, tagIds: [example.builtinTagId] });
  }

  private libraryEntry(asset: PersonalMediaAsset): LibraryEntry {
    return { assetId: asset.id, assetVersion: asset.objectVersion, mediaKind: asset.mediaKind,
      displayName: asset.displayName, contentType: asset.contentType, byteSize: asset.byteSize,
      checksumSha256: asset.checksumSha256, contentUrl: asset.contentUrl, createdAt: asset.createdAt, addedAt: asset.createdAt,
      space: "personal", folderId: null, tagIds: [] };
  }

  private libraryOperation<T>(operation: () => T): T {
    try { return operation(); } catch (error) {
      if (!(error instanceof MediaLibraryError)) throw error;
      const code = ["folder_name_conflict", "placement_changed", "explicit_move_required", "library_item_in_use", "entity_changed", "folder_changed", "tag_usage_changed"].includes(error.code)
        ? "conflict" : error.code.endsWith("not_found") ? "not_found" : "request_failed";
      throw new ApplicationError(code, error.message, { serviceCode: error.code });
    }
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

  private requireEntity(entityId: string, space: EntitySpace = "personal"): WorkspaceEntity {
    const entity = this.entityRecords.get(entityId);
    if (!entity || (entity.space ?? "personal") !== space || this.deletedLibraryEntities.has(entityId)) throw new ApplicationError("not_found", "主体不存在。");
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
      for (const ref of content.mediaRefs) {
        this.requireAsset(ref.mediaAssetId);
        const space = input.space ?? "personal";
        if (!this.libraryEntries.has(`${space}:${ref.mediaAssetId}`)) throw new ApplicationError("not_found", "素材未保存在目标素材库中。");
      }
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

  private entityWithTags(entity: WorkspaceEntity): WorkspaceEntity {
    return { ...structuredClone(entity), space: entity.space ?? "personal", libraryTagIds: [...(this.libraryEntityTags.get(entity.id) ?? [])] };
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
    const space = input.space ?? "personal";
    const creationKey = `${space}:${key}`;
    const previous = this.entityCreations.get(creationKey);
    if (previous && this.deletedLibraryEntities.has(previous.entityId)) throw new ApplicationError("conflict", "该素材组已删除，请重新发起创建。");
    const content = this.entityContent(input);
    const tagIds = normalizeEntityLibraryTags(input.tagIds ?? []);
    const fingerprint = JSON.stringify({ ...content, space, folderId: input.folderId ?? null, tagIds });
    if (previous) {
      if (this.deletedLibraryEntities.has(previous.entityId) || previous.fingerprint !== fingerprint) throw new ApplicationError("conflict", "本次创建请求的内容已改变。");
      return this.entityWithTags(this.requireEntity(previous.entityId, space));
    }
    validateEntityLibraryTags(tagIds, (id) => this.catalog().tags.some((tag) => tag.id === id && tag.space === (input.space ?? "personal")));
    if (input.folderId && !this.catalog().folders.some((folder) => folder.id === input.folderId && folder.space === space)) throw new ApplicationError("not_found", "保存目录不存在或不可访问，请重新选择。", { serviceCode: "folder_not_found" });
    const timestamp = new Date().toISOString();
    const entity: WorkspaceEntity = {
      id: `experience-entity-${crypto.randomUUID()}`,
      space,
      workspaceId: this.options.workspaceId,
      ...content,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.entityRecords.set(entity.id, entity);
    this.libraryEntityLocations.set(entity.id, { folderId: input.folderId ?? null, addedAt: timestamp });
    this.libraryEntityTags.set(entity.id, tagIds);
    this.entityCreations.set(creationKey, { entityId: entity.id, fingerprint });
    return this.entityWithTags(entity);
  }

  private updateEntity(input: UpdateWorkspaceEntityInput): WorkspaceEntity {
    this.requireWorkspace(input.workspaceId);
    const current = this.requireEntity(input.entityId, input.space ?? "personal");
    try {
      normalizeExpectedEntityVersion(input.expectedVersion);
    } catch (error) {
      if (error instanceof EntityValidationError) throw invalid(error.message, error.reason);
      throw error;
    }
    if (input.expectedVersion !== current.version) throw new ApplicationError("conflict", "主体已更新，请重新打开编辑。");
    let tagIds = this.libraryEntityTags.get(current.id) ?? [];
    if (input.tagIds !== undefined) {
      requireExpectedEntityLibraryTags(tagIds, input.expectedTagIds);
      tagIds = validateEntityLibraryTags(input.tagIds, (id) => this.catalog().tags.some((tag) => tag.id === id && tag.space === (input.space ?? "personal")));
    }
    const entity: WorkspaceEntity = {
      ...current,
      ...this.entityContent(input),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.entityRecords.set(entity.id, entity);
    this.libraryEntityTags.set(entity.id, [...tagIds]);
    return this.entityWithTags(entity);
  }
}
