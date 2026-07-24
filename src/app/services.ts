import type { AccountRepository } from "../application/account/AccountRepository";
import type { CanvasDocumentRepository } from "../application/canvases/CanvasDocumentRepository";
import type { OrganizationRepository } from "../application/organizations/OrganizationRepository";
import type { ProjectRepository } from "../application/projects/ProjectRepository";
import type { SessionGateway } from "../application/session/SessionGateway";
import type { WorkspaceRepository } from "../application/workspaces/WorkspaceRepository";
import { createHttpServices } from "../infrastructure/http/createHttpServices";

export interface ApplicationServices {
  accountRepository: AccountRepository;
  canvasDocumentRepository: CanvasDocumentRepository;
  organizationRepository: OrganizationRepository;
  projectRepository: ProjectRepository;
  sessionGateway: SessionGateway;
  workspaceRepository: WorkspaceRepository;
}

export const applicationServices: ApplicationServices = createHttpServices();
