import type { ProjectId } from "../../domain/project/project";
import type { WorkspaceId } from "../../domain/workspace/workspace";

export type MediaAssetKind = "image" | "video" | "audio";

export interface CreateMediaUploadIntentInput {
  workspaceId: WorkspaceId;
  idempotencyKey: string;
  mediaKind: MediaAssetKind;
  displayName: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
}

export interface MediaUploadGrant {
  uploadIntent: { id: string; expiresAt: string };
  upload: { url: string; method: "PUT"; headers: Record<string, string> };
}

export interface FinalizedMediaAsset {
  id: string;
  workspaceId: WorkspaceId;
  mediaKind: MediaAssetKind;
  displayName: string;
  objectVersion: number;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalMediaAsset extends FinalizedMediaAsset {
  contentUrl: string;
}

export interface ProjectMediaAsset {
  referenceId: string;
  assetId: string;
  assetVersion: number;
  mediaKind: MediaAssetKind;
  displayName: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  contentUrl: string;
}

export interface MediaAssetRepository {
  createUploadIntent(input: CreateMediaUploadIntentInput): Promise<MediaUploadGrant>;
  finalizeUpload(workspaceId: WorkspaceId, uploadId: string): Promise<FinalizedMediaAsset>;
  renamePersonalAsset(
    workspaceId: WorkspaceId,
    assetId: string,
    displayName: string,
  ): Promise<PersonalMediaAsset>;
  attachToProject(projectId: ProjectId, assetId: string): Promise<ProjectMediaAsset>;
  listPersonalAssets(workspaceId: WorkspaceId): Promise<PersonalMediaAsset[]>;
  listProjectAssets(projectId: ProjectId): Promise<ProjectMediaAsset[]>;
}
