import type {
  AssetUploadIntent,
  AssetUploadIntentId,
  MediaKind,
  WorkspaceMediaAsset,
  WorkspaceMediaAssetId,
} from "../../domain/asset/workspace-media-asset";
import type { ActorId } from "../../domain/identity/session";
import type { WorkspaceId } from "../../domain/workspace/workspace";

export interface CreateAssetUploadIntentInput {
  actorId: ActorId;
  workspaceId: WorkspaceId;
  idempotencyKey: string;
  mediaKind: MediaKind;
  displayName: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
}

export interface RecordAssetUploadInput {
  actorId: ActorId;
  workspaceId: WorkspaceId;
  uploadIntentId: AssetUploadIntentId;
  objectKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  etag?: string | null;
}

export interface FinalizeAssetUploadInput {
  actorId: ActorId;
  workspaceId: WorkspaceId;
  uploadIntentId: AssetUploadIntentId;
}

export interface ListPersonalAssetsInput {
  actorId: ActorId;
  workspaceId: WorkspaceId;
}

export interface ReadAssetUploadIntentInput extends ListPersonalAssetsInput {
  uploadIntentId: AssetUploadIntentId;
}

export interface ReadPersonalAssetInput extends ListPersonalAssetsInput {
  assetId: WorkspaceMediaAssetId;
}

export interface RenamePersonalAssetInput extends ReadPersonalAssetInput {
  displayName: string;
}

export class AssetWorkspaceUnavailableError extends Error {
  constructor() {
    super("The workspace is unavailable or inaccessible to the actor.");
    this.name = "AssetWorkspaceUnavailableError";
  }
}

export type AssetUploadConflictReason =
  | "idempotency_key_reused"
  | "metadata_mismatch"
  | "not_uploaded"
  | "expired";

export class AssetUploadConflictError extends Error {
  constructor(readonly reason: AssetUploadConflictReason) {
    super(`Asset upload cannot continue: ${reason}.`);
    this.name = "AssetUploadConflictError";
  }
}

export class AssetUploadIntentUnavailableError extends Error {
  constructor() {
    super("The asset upload intent is unavailable or inaccessible to the actor.");
    this.name = "AssetUploadIntentUnavailableError";
  }
}

export class PersonalAssetUnavailableError extends Error {
  constructor() {
    super("The personal media asset is unavailable or inaccessible to the actor.");
    this.name = "PersonalAssetUnavailableError";
  }
}

export interface WorkspaceMediaAssetStore {
  createUploadIntent(input: CreateAssetUploadIntentInput): Promise<AssetUploadIntent>;
  getUploadIntent(input: ReadAssetUploadIntentInput): Promise<AssetUploadIntent | null>;
  recordUpload(input: RecordAssetUploadInput): Promise<AssetUploadIntent>;
  finalizeUpload(input: FinalizeAssetUploadInput): Promise<WorkspaceMediaAsset>;
  listPersonalAssets(input: ListPersonalAssetsInput): Promise<WorkspaceMediaAsset[]>;
  getPersonalAsset(input: ReadPersonalAssetInput): Promise<WorkspaceMediaAsset | null>;
  renamePersonalAsset(input: RenamePersonalAssetInput): Promise<WorkspaceMediaAsset>;
}
