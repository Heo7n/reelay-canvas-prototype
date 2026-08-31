import type {
  ProjectAsset,
  ProjectAssetReference,
  ProjectAssetReferenceId,
  WorkspaceMediaAssetId,
} from "../../domain/asset/workspace-media-asset";
import type { ActorId } from "../../domain/identity/session";
import type { ProjectId } from "../../domain/project/project";

export interface AttachAssetToProjectInput {
  actorId: ActorId;
  projectId: ProjectId;
  assetId: WorkspaceMediaAssetId;
}

export interface ListProjectAssetsInput {
  actorId: ActorId;
  projectId: ProjectId;
}

export interface ReadProjectAssetInput extends ListProjectAssetsInput {
  referenceId: ProjectAssetReferenceId;
}

export class ProjectAssetUnavailableError extends Error {
  constructor() {
    super("The project asset is unavailable or inaccessible to the actor.");
    this.name = "ProjectAssetUnavailableError";
  }
}

export interface ProjectAssetReferenceStore {
  attachAssetToProject(input: AttachAssetToProjectInput): Promise<ProjectAssetReference>;
  listProjectAssets(input: ListProjectAssetsInput): Promise<ProjectAsset[]>;
  getProjectAsset(input: ReadProjectAssetInput): Promise<ProjectAsset | null>;
}
