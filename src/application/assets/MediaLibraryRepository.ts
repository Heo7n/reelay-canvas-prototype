import type { RenameLibraryFolderInput, DeleteLibraryInput, CreateLibraryFolderInput, CreateLibraryTagInput, LibraryFolder, LibraryTag, MediaLibraryCatalog, SaveLibraryInput } from "../../domain/asset/media-library";

export interface MediaLibraryRepository {
  list(workspaceId: string): Promise<MediaLibraryCatalog>;
  createFolder(input: CreateLibraryFolderInput): Promise<LibraryFolder>;
  createTag(input: CreateLibraryTagInput): Promise<LibraryTag>;
  save(input: SaveLibraryInput): Promise<MediaLibraryCatalog>;
  delete(input: DeleteLibraryInput): Promise<MediaLibraryCatalog>;
  renameFolder(input: RenameLibraryFolderInput): Promise<LibraryFolder>;
}
