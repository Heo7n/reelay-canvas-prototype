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
import {
  FinalizeMediaUploadResponseDtoSchema,
  MediaUploadIntentResponseDtoSchema,
  PersonalMediaAssetsResponseDtoSchema,
  ProjectAssetResponseDtoSchema,
  ProjectAssetsResponseDtoSchema,
} from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

export class HttpMediaAssetRepository implements MediaAssetRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async createUploadIntent(input: CreateMediaUploadIntentInput): Promise<MediaUploadGrant> {
    const { workspaceId, ...body } = input;
    return this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-upload-intents`,
      MediaUploadIntentResponseDtoSchema,
      { method: "POST", body: JSON.stringify(body) },
    );
  }

  async finalizeUpload(workspaceId: WorkspaceId, uploadId: string): Promise<FinalizedMediaAsset> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/media-upload-intents/${encodeURIComponent(uploadId)}/finalize`,
      FinalizeMediaUploadResponseDtoSchema,
      { method: "POST", body: JSON.stringify({}) },
    );
    return response.asset;
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
