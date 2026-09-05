import type { ActorId } from "../identity/session";
import type { ProjectId } from "../project/project";
import type { WorkspaceId } from "../workspace/workspace";

export type AssetUploadIntentId = string;
export type WorkspaceMediaAssetId = string;
export type MediaAssetPlacementId = string;
export type ProjectAssetReferenceId = string;

export type MediaKind = "image" | "video" | "audio";
export type AssetUploadStatus = "pending" | "uploaded" | "finalized";

export interface AssetUploadIntent {
  id: AssetUploadIntentId;
  workspaceId: WorkspaceId;
  createdByActorId: ActorId;
  idempotencyKey: string;
  mediaKind: MediaKind;
  displayName: string;
  objectKey: string;
  expectedContentType: string;
  expectedByteSize: number;
  expectedChecksumSha256: string;
  status: AssetUploadStatus;
  uploadedContentType: string | null;
  uploadedByteSize: number | null;
  uploadedChecksumSha256: string | null;
  uploadedEtag: string | null;
  assetId: WorkspaceMediaAssetId | null;
  createdAt: string;
  expiresAt: string;
  uploadedAt: string | null;
  finalizedAt: string | null;
}

export interface WorkspaceMediaAsset {
  id: WorkspaceMediaAssetId;
  workspaceId: WorkspaceId;
  mediaKind: MediaKind;
  displayName: string;
  objectKey: string;
  objectVersion: number;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  createdByActorId: ActorId;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetPlacement {
  id: MediaAssetPlacementId;
  workspaceId: WorkspaceId;
  assetId: WorkspaceMediaAssetId;
  scopeKind: "personal";
  ownerActorId: ActorId;
  createdByActorId: ActorId;
  createdAt: string;
}

export interface ProjectAssetReference {
  id: ProjectAssetReferenceId;
  workspaceId: WorkspaceId;
  projectId: ProjectId;
  assetId: WorkspaceMediaAssetId;
  assetVersion: number;
  createdByActorId: ActorId;
  createdAt: string;
}

export interface ProjectAsset {
  reference: ProjectAssetReference;
  asset: WorkspaceMediaAsset;
}
