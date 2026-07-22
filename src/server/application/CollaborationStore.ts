import type { ActorId, SessionActor } from "../../domain/identity/session";
import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { Workspace, WorkspaceId } from "../../domain/workspace/workspace";

export interface CreateProjectInput {
  workspaceId: WorkspaceId;
  createdByActorId: ActorId;
  name: string;
  coverAssetId?: string | null;
}

export interface UpdateProjectInput {
  updatedByActorId: ActorId;
  name?: string;
  coverAssetId?: string | null;
}

export interface CollaborationStore {
  readonly storageKind: "server-memory" | "postgresql";

  ping(): Promise<void>;
  close(): Promise<void>;

  authenticate(account: string, password: string): Promise<ActorId | null>;
  createSession(actorId: ActorId): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
  getSessionActor(sessionId: string | undefined): Promise<SessionActor | null>;

  listWorkspacesForActor(actorId: ActorId): Promise<Workspace[]>;
  canReadWorkspace(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean>;
  getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null>;

  listProjects(actorId: ActorId, workspaceId: WorkspaceId): Promise<ProjectSummary[]>;
  getProject(actorId: ActorId, workspaceId: WorkspaceId, projectId: ProjectId): Promise<ProjectSummary | null>;
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null>;
}
