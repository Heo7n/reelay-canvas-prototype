import type { WorkspaceId } from "../../domain/workspace/workspace";

export interface WorkspaceEntityMediaReference {
  assetId: string;
  order: number;
}

export interface WorkspaceEntity {
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
  workspaceId: WorkspaceId;
  idempotencyKey: string;
  name: string;
  description: string;
  assetIds: string[];
  coverAssetId: string | null;
}

export interface UpdateWorkspaceEntityInput {
  workspaceId: WorkspaceId;
  entityId: string;
  expectedVersion: number;
  name: string;
  description: string;
  assetIds: string[];
  coverAssetId: string | null;
}

export interface EntityRepository {
  create(input: CreateWorkspaceEntityInput): Promise<WorkspaceEntity>;
  get(workspaceId: WorkspaceId, entityId: string): Promise<WorkspaceEntity>;
  listPersonal(workspaceId: WorkspaceId): Promise<WorkspaceEntity[]>;
  update(input: UpdateWorkspaceEntityInput): Promise<WorkspaceEntity>;
}
