import type { RenameLibraryFolderInput, DeleteLibraryInput, CreateLibraryFolderInput, CreateLibraryTagInput, LibraryFolder, LibraryTag, MediaLibraryCatalog, SaveLibraryInput } from "../../domain/asset/media-library";
import type { WorkspaceMediaAsset } from "../../domain/asset/workspace-media-asset";

export interface LibraryActorInput { actorId: string; workspaceId: string }
export interface MediaLibraryStore {
  listLibrary(input: LibraryActorInput): Promise<MediaLibraryCatalog>;
  createLibraryFolder(input: CreateLibraryFolderInput & { actorId: string }): Promise<LibraryFolder>;
  createLibraryTag(input: CreateLibraryTagInput & { actorId: string }): Promise<LibraryTag>;
  saveLibrary(input: SaveLibraryInput & { actorId: string }): Promise<MediaLibraryCatalog>;
  getLibraryAsset(input: LibraryActorInput & { assetId: string }): Promise<WorkspaceMediaAsset | null>;
  deleteLibrary(input: DeleteLibraryInput & { actorId: string }): Promise<MediaLibraryCatalog>;
  renameLibraryFolder(input: RenameLibraryFolderInput & { actorId: string }): Promise<LibraryFolder>;
}
