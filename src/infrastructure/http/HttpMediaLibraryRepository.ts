import { z } from "zod";
import type { MediaLibraryRepository } from "../../application/assets/MediaLibraryRepository";
import {
  LibraryFolderSchema, LibraryTagSchema, MediaLibraryCatalogSchema,
  type MoveLibraryEntitiesInput, type DeleteLibraryTagInput, type UpdateLibraryTagsInput, type RenameLibraryFolderInput, type DeleteLibraryInput, type CreateLibraryFolderInput, type CreateLibraryTagInput, type SaveLibraryInput,
} from "../../domain/asset/media-library";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

const catalogResponse = z.object({ catalog: MediaLibraryCatalogSchema }).strict();
const folderResponse = z.object({ folder: LibraryFolderSchema }).strict();
const tagResponse = z.object({ tag: LibraryTagSchema }).strict();

export class HttpMediaLibraryRepository implements MediaLibraryRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  private path(workspaceId: string): string {
    return `/api/workspaces/${encodeURIComponent(workspaceId)}/media-library`;
  }

  async list(workspaceId: string) {
    return (await this.http.read(this.path(workspaceId), catalogResponse)).catalog;
  }

  async createFolder({ workspaceId, ...body }: CreateLibraryFolderInput) {
    return (await this.http.read(`${this.path(workspaceId)}/folders`, folderResponse, {
      method: "POST", body: JSON.stringify(body),
    })).folder;
  }

  async renameFolder({ workspaceId, ...body }: RenameLibraryFolderInput) {
    return (await this.http.read(`${this.path(workspaceId)}/rename-folder`, folderResponse, {
      method: "POST", body: JSON.stringify(body),
    })).folder;
  }

  async createTag({ workspaceId, ...body }: CreateLibraryTagInput) {
    return (await this.http.read(`${this.path(workspaceId)}/tags`, tagResponse, {
      method: "POST", body: JSON.stringify(body),
    })).tag;
  }

  async delete({ workspaceId, ...body }: DeleteLibraryInput) {
    return (await this.http.read(`${this.path(workspaceId)}/delete`, catalogResponse, {
      method: "POST", body: JSON.stringify(body),
    })).catalog;
  }

  async deleteTag({ workspaceId, ...body }: DeleteLibraryTagInput) {
    return (await this.http.read(`${this.path(workspaceId)}/tags/delete`, catalogResponse, {
      method: "POST", body: JSON.stringify(body),
    })).catalog;
  }

  async updateTags({ workspaceId, ...body }: UpdateLibraryTagsInput) {
    return (await this.http.read(`${this.path(workspaceId)}/tags/update`, catalogResponse, {
      method: "POST", body: JSON.stringify(body),
    })).catalog;
  }

  async moveEntities({ workspaceId, ...body }: MoveLibraryEntitiesInput) {
    return (await this.http.read(`${this.path(workspaceId)}/move-entities`, catalogResponse, {
      method: "POST", body: JSON.stringify(body),
    })).catalog;
  }

  async save({ workspaceId, ...body }: SaveLibraryInput) {
    return (await this.http.read(`${this.path(workspaceId)}/save`, catalogResponse, {
      method: "POST", body: JSON.stringify(body),
    })).catalog;
  }
}
