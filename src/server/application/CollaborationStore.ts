import type { ActorId, SessionActor } from "../../domain/identity/session";
import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { OrganizationMember, Workspace, WorkspaceId } from "../../domain/workspace/workspace";
import type { CanvasDocumentStore } from "./CanvasDocumentStore";

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

export interface CollaborationStore extends CanvasDocumentStore {
  readonly storageKind: "server-memory" | "postgresql";

  ping(): Promise<void>;
  close(): Promise<void>;

  authenticate(account: string, password: string): Promise<ActorId | null>;
  createSession(actorId: ActorId): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
  getSessionActor(sessionId: string | undefined): Promise<SessionActor | null>;
  updateAccountContacts(
    actorId: ActorId,
    contacts: { contactEmail: string | null; contactPhone: string | null },
  ): Promise<SessionActor | null>;

  listWorkspacesForActor(actorId: ActorId): Promise<Workspace[]>;
  canReadWorkspace(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean>;
  getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null>;
  listOrganizationMembers(workspaceId: WorkspaceId): Promise<OrganizationMember[]>;

  listProjects(actorId: ActorId, workspaceId: WorkspaceId): Promise<ProjectSummary[]>;
  getProjectById(actorId: ActorId, projectId: ProjectId): Promise<ProjectSummary | null>;
  getProject(actorId: ActorId, workspaceId: WorkspaceId, projectId: ProjectId): Promise<ProjectSummary | null>;
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null>;
  moveProjectToTrash(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    actorId: ActorId,
  ): Promise<boolean>;
}
