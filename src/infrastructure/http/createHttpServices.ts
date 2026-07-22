import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";
import { HttpCanvasDocumentRepository } from "./HttpCanvasDocumentRepository";
import { HttpProjectRepository } from "./HttpProjectRepository";
import { HttpSessionGateway } from "./HttpSessionGateway";
import { HttpWorkspaceRepository } from "./HttpWorkspaceRepository";

export interface HttpServices {
  canvasDocumentRepository: HttpCanvasDocumentRepository;
  sessionGateway: HttpSessionGateway;
  workspaceRepository: HttpWorkspaceRepository;
  projectRepository: HttpProjectRepository;
}

export function createHttpServices(options: HttpAdapterOptions = {}): HttpServices {
  const http = new HttpApiClient(options);
  return {
    canvasDocumentRepository: new HttpCanvasDocumentRepository(http),
    sessionGateway: new HttpSessionGateway(http),
    workspaceRepository: new HttpWorkspaceRepository(http),
    projectRepository: new HttpProjectRepository(http),
  };
}
