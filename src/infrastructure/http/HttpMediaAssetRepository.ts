import type {
  CreateMediaUploadIntentInput,
  FinalizedMediaAsset,
  MediaAssetRepository,
  MediaUploadGrant,
  PersonalMediaAsset,
  ProjectMediaAsset,
} from "../../application/assets/MediaAssetRepository";
import type { ProjectId } from "../../domain/project/project";
import type { WorkspaceId } from "../../domain/workspace/workspace";
import type { MediaStorageSpace } from "../../domain/asset/media-storage";
import { MediaStorageResponseSchema } from "./media-storage-contracts";
import {
  FinalizeMediaUploadResponseDtoSchema,
  MediaUploadIntentResponseDtoSchema,
  MediaUploadPolicyResponseDtoSchema,
  MediaUploadCancellationResponseDtoSchema,
  PersonalMediaAssetsResponseDtoSchema,
  ProjectAssetResponseDtoSchema,
  ProjectAssetsResponseDtoSchema,
} from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";
import { HttpMediaLibraryRepository } from "./HttpMediaLibraryRepository";

export class HttpMediaAssetRepository implements MediaAssetRepository {
  private readonly http: HttpApiClient;
  readonly library: HttpMediaLibraryRepository;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
    this.library = new HttpMediaLibraryRepository(this.http);
  }

  async createUploadIntent(input: CreateMediaUploadIntentInput): Promise<MediaUploadGrant> {
    const { workspaceId, ...body } = input;
    return this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-upload-intents`,
      MediaUploadIntentResponseDtoSchema,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  async getUploadPolicy(workspaceId: WorkspaceId) {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-upload-policy`,
      MediaUploadPolicyResponseDtoSchema,
    );
    return response.policy;
  }

  async getStorageUsage(workspaceId: WorkspaceId, space: MediaStorageSpace) {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-storage?space=${space}`,
      MediaStorageResponseSchema,
    );
    return response.storage;
  }

  async cancelUpload(workspaceId: WorkspaceId, uploadId: string) {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-upload-intents/${encodeURIComponent(uploadId)}`,
      MediaUploadCancellationResponseDtoSchema,
      { method: "DELETE" },
    );
    return response.uploadIntent;
  }

  async finalizeUpload(workspaceId: WorkspaceId, uploadId: string): Promise<FinalizedMediaAsset> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-upload-intents/${encodeURIComponent(uploadId)}/finalize`,
      FinalizeMediaUploadResponseDtoSchema,
      { method: "POST", body: JSON.stringify({}) },
    );
    return response.asset;
  }

  async renamePersonalAsset(
    workspaceId: WorkspaceId,
    assetId: string,
    displayName: string,
    space: "personal" | "organization" = "personal",
  ): Promise<PersonalMediaAsset> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-assets/${encodeURIComponent(assetId)}`,
      FinalizeMediaUploadResponseDtoSchema,
      { method: "PATCH", body: JSON.stringify({ displayName, ...(space === "organization" ? { space } : {}) }) },
    );
    return {
      ...response.asset,
      contentUrl: `/api/workspaces/${encodeURIComponent(workspaceId)}/media-assets/${encodeURIComponent(assetId)}/content`,
    };
  }

  async attachToProject(projectId: ProjectId, assetId: string): Promise<ProjectMediaAsset> {
    const response = await this.http.read(
      `/api/projects/${encodeURIComponent(projectId)}/asset-references/${encodeURIComponent(assetId)}`,
      ProjectAssetResponseDtoSchema,
      { method: "PUT", body: JSON.stringify({}) },
    );
    return response.projectAsset;
  }

  async listPersonalAssets(workspaceId: WorkspaceId): Promise<PersonalMediaAsset[]> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-assets?scope=personal`,
      PersonalMediaAssetsResponseDtoSchema,
    );
    return response.assets;
  }

  async listProjectAssets(projectId: ProjectId): Promise<ProjectMediaAsset[]> {
    const response = await this.http.read(
      `/api/projects/${encodeURIComponent(projectId)}/asset-references`,
      ProjectAssetsResponseDtoSchema,
    );
    return response.projectAssets;
  }
}
