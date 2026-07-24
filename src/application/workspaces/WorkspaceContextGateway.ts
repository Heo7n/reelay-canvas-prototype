import type { SessionActor } from "../../domain/identity/session";
import type { ProjectSummary } from "../../domain/project/project";
import type { Workspace, WorkspaceId } from "../../domain/workspace/workspace";

export interface WorkspaceContext {
  actor: SessionActor;
  projects: ProjectSummary[];
  workspaces: Workspace[];
}

export interface WorkspaceContextGateway {
  load(workspaceId: WorkspaceId): Promise<WorkspaceContext>;
}
