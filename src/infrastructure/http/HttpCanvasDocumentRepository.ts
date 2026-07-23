import type {
  CanvasDocumentRepository,
  SaveCanvasDocumentInput,
} from "../../application/canvases/CanvasDocumentRepository";
import type { CanvasDocument, CanvasId } from "../../domain/canvas/canvas-document";
import type { ProjectId } from "../../domain/project/project";
import {
  CanvasDocumentReadResponseDtoSchema,
  CanvasDocumentResponseDtoSchema,
} from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

type CanvasDocumentDto = (typeof CanvasDocumentResponseDtoSchema)["_output"]["document"];

function toCanvasDocument(document: CanvasDocumentDto): CanvasDocument {
  return {
    id: document.id,
    projectId: document.projectId,
    schemaVersion: document.schemaVersion,
    revision: document.revision,
    content: document.content,
  };
}

function documentPath(projectId: ProjectId, canvasId: CanvasId): string {
  return `/api/projects/${encodeURIComponent(projectId)}/canvases/${encodeURIComponent(canvasId)}/document`;
}

export class HttpCanvasDocumentRepository implements CanvasDocumentRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async getCanvasDocument(projectId: ProjectId, canvasId: CanvasId): Promise<CanvasDocument | null> {
    const response = await this.http.read(
      documentPath(projectId, canvasId),
      CanvasDocumentReadResponseDtoSchema,
    );
    return response.document ? toCanvasDocument(response.document) : null;
  }

  async save(input: SaveCanvasDocumentInput): Promise<CanvasDocument> {
    const { projectId, canvasId, schemaVersion, content, expectedRevision } = input;
    const response = await this.http.read(
      documentPath(projectId, canvasId),
      CanvasDocumentResponseDtoSchema,
      {
        method: "PUT",
        body: JSON.stringify({
          schemaVersion,
          content,
          expectedRevision,
        }),
      },
    );
    return toCanvasDocument(response.document);
  }
}
