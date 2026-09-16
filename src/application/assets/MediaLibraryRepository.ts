import type { MoveLibraryEntitiesInput, DeleteLibraryTagInput, UpdateLibraryTagsInput, RenameLibraryFolderInput, DeleteLibraryInput, CreateLibraryFolderInput, CreateLibraryTagInput, LibraryFolder, LibraryTag, MediaLibraryCatalog, SaveLibraryInput } from "../../domain/asset/media-library";

export interface MediaLibraryRepository {
  list(workspaceId: string): Promise<MediaLibraryCatalog>;
  createFolder(input: CreateLibraryFolderInput): Promise<LibraryFolder>;
  createTag(input: CreateLibraryTagInput): Promise<LibraryTag>;
  moveEntities(input: MoveLibraryEntitiesInput): Promise<MediaLibraryCatalog>;
  save(input: SaveLibraryInput): Promise<MediaLibraryCatalog>;
  delete(input: DeleteLibraryInput): Promise<MediaLibraryCatalog>;
  deleteTag(input: DeleteLibraryTagInput): Promise<MediaLibraryCatalog>;
  updateTags(input: UpdateLibraryTagsInput): Promise<MediaLibraryCatalog>;
  renameFolder(input: RenameLibraryFolderInput): Promise<LibraryFolder>;
}
