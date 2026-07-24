import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";
import { HttpAccountRepository } from "./HttpAccountRepository";
import { HttpCanvasDocumentRepository } from "./HttpCanvasDocumentRepository";
import { HttpOrganizationRepository } from "./HttpOrganizationRepository";
import { HttpProjectRepository } from "./HttpProjectRepository";
import { HttpSessionGateway } from "./HttpSessionGateway";
import { HttpWorkspaceRepository } from "./HttpWorkspaceRepository";

export interface HttpServices {
  accountRepository: HttpAccountRepository;
  canvasDocumentRepository: HttpCanvasDocumentRepository;
  organizationRepository: HttpOrganizationRepository;
  sessionGateway: HttpSessionGateway;
  workspaceRepository: HttpWorkspaceRepository;
  projectRepository: HttpProjectRepository;
}

export function createHttpServices(options: HttpAdapterOptions = {}): HttpServices {
  const http = new HttpApiClient(options);
  return {
    accountRepository: new HttpAccountRepository(http),
    canvasDocumentRepository: new HttpCanvasDocumentRepository(http),
    organizationRepository: new HttpOrganizationRepository(http),
    sessionGateway: new HttpSessionGateway(http),
    workspaceRepository: new HttpWorkspaceRepository(http),
    projectRepository: new HttpProjectRepository(http),
  };
}
