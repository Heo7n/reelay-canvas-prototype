import type { ProjectRepository } from "../application/projects/ProjectRepository";
import type { SessionGateway } from "../application/session/SessionGateway";
import type { WorkspaceRepository } from "../application/workspaces/WorkspaceRepository";
import { createHttpServices } from "../infrastructure/http/createHttpServices";

export interface ApplicationServices {
  projectRepository: ProjectRepository;
  sessionGateway: SessionGateway;
  workspaceRepository: WorkspaceRepository;
}

export const applicationServices: ApplicationServices = createHttpServices();
