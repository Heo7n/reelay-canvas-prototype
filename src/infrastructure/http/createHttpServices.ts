import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";
import { HttpAccountRepository } from "./HttpAccountRepository";
import { HttpCanvasDocumentRepository } from "./HttpCanvasDocumentRepository";
import { HttpEntityRepository } from "./HttpEntityRepository";
import { HttpMediaAssetRepository } from "./HttpMediaAssetRepository";
import { HttpOrganizationRepository } from "./HttpOrganizationRepository";
import { HttpProjectRepository } from "./HttpProjectRepository";
import { HttpSessionGateway } from "./HttpSessionGateway";
import { HttpWorkspaceContextGateway } from "./HttpWorkspaceContextGateway";
import { HttpWorkspaceRepository } from "./HttpWorkspaceRepository";

export interface HttpServices {
  accountRepository: HttpAccountRepository;
  canvasDocumentRepository: HttpCanvasDocumentRepository;
  entityRepository: HttpEntityRepository;
  mediaAssetRepository: HttpMediaAssetRepository;
  organizationRepository: HttpOrganizationRepository;
  sessionGateway: HttpSessionGateway;
  workspaceContextGateway: HttpWorkspaceContextGateway;
  workspaceRepository: HttpWorkspaceRepository;
  projectRepository: HttpProjectRepository;
}

export function createHttpServices(options: HttpAdapterOptions = {}): HttpServices {
  const http = new HttpApiClient(options);
  return {
    accountRepository: new HttpAccountRepository(http),
    canvasDocumentRepository: new HttpCanvasDocumentRepository(http),
    entityRepository: new HttpEntityRepository(http),
    mediaAssetRepository: new HttpMediaAssetRepository(http),
    organizationRepository: new HttpOrganizationRepository(http),
    sessionGateway: new HttpSessionGateway(http),
    workspaceContextGateway: new HttpWorkspaceContextGateway(http),
    workspaceRepository: new HttpWorkspaceRepository(http),
    projectRepository: new HttpProjectRepository(http),
  };
}
