import type { WorkspaceId } from "../../domain/workspace/workspace";

export interface WorkspaceEntityMediaReference {
  assetId: string;
  order: number;
}

export type EntitySpace = "personal" | "organization";

export interface WorkspaceEntity {
  space?: EntitySpace;
  libraryTagIds?: string[];
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  description: string;
  mediaRefs: WorkspaceEntityMediaReference[];
  coverAssetId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceEntityInput {
  space?: EntitySpace;
  workspaceId: WorkspaceId;
  idempotencyKey: string;
  tagIds?: string[];
  folderId?: string | null;
  name: string;
  description: string;
  assetIds: string[];
  coverAssetId: string | null;
}

export interface UpdateWorkspaceEntityInput {
  space?: EntitySpace;
  workspaceId: WorkspaceId;
  entityId: string;
  expectedVersion: number;
  tagIds?: string[];
  expectedTagIds?: string[];
  name: string;
  description: string;
  assetIds: string[];
  coverAssetId: string | null;
}

export interface EntityRepository {
  create(input: CreateWorkspaceEntityInput): Promise<WorkspaceEntity>;
  get(workspaceId: WorkspaceId, entityId: string, space?: EntitySpace): Promise<WorkspaceEntity>;
  listPersonal(workspaceId: WorkspaceId, space?: EntitySpace): Promise<WorkspaceEntity[]>;
  update(input: UpdateWorkspaceEntityInput): Promise<WorkspaceEntity>;
}
