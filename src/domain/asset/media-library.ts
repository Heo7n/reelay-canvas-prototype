import { z } from "zod";
import type { MediaKind } from "./workspace-media-asset";

export type LibrarySpace = "personal" | "organization";
export interface LibraryFolder { id: string; name: string; parentId: string | null; space: LibrarySpace }
export interface LibraryTag { id: string; name: string; space: LibrarySpace }
export const BUILTIN_LIBRARY_TAGS = [
  { id: "builtin:character", name: "角色" },
  { id: "builtin:scene", name: "场景" },
  { id: "builtin:object", name: "物品" },
] as const;
export interface LibraryEntry {
  assetId: string; assetVersion: number; mediaKind: MediaKind; displayName: string;
  contentType: string; byteSize: number; checksumSha256: string; contentUrl: string;
  createdAt: string; addedAt?: string; space: LibrarySpace; folderId: string | null; tagIds: string[];
}
export interface LibraryEntityEntry { entityId: string; space: LibrarySpace; tagIds: string[]; folderId?: string | null; addedAt?: string }
export interface MediaLibraryCatalog { folders: LibraryFolder[]; tags: LibraryTag[]; entries: LibraryEntry[]; entityEntries?: LibraryEntityEntry[] }
export interface CreateLibraryFolderInput { workspaceId: string; space: LibrarySpace; parentId: string | null; name: string }
export interface RenameLibraryFolderInput { workspaceId: string; space: LibrarySpace; folderId: string; name: string; expectedName: string }
export interface CreateLibraryTagInput { workspaceId: string; space: LibrarySpace; name: string }
export interface SaveLibraryInput {
  workspaceId: string; projectId: string; space: LibrarySpace; folderId: string | null; tagIds: string[];
  items: Array<{ assetId: string; displayName: string; action: "add" | "save" | "move"; expectedFolderId?: string | null }>;
}

const IdentifierSchema = z.string().trim().min(1).max(200);
export const LibrarySpaceSchema = z.enum(["personal", "organization"]);
export const LibraryFolderSchema = z.object({ id: IdentifierSchema, name: z.string().min(1).max(100), parentId: IdentifierSchema.nullable(), space: LibrarySpaceSchema }).strict();
export const RenameLibraryFolderInputSchema = z.object({ workspaceId: IdentifierSchema, space: LibrarySpaceSchema, folderId: IdentifierSchema, name: z.string().trim().min(1).max(100), expectedName: z.string().min(1).max(100) }).strict();
export const LibraryTagSchema = z.object({ id: IdentifierSchema, name: z.string().min(1).max(40), space: LibrarySpaceSchema }).strict();
export const LibraryEntrySchema = z.object({
  assetId: IdentifierSchema, assetVersion: z.number().int().positive(), mediaKind: z.enum(["image", "video", "audio"]), displayName: z.string().min(1).max(300),
  contentType: z.string(), byteSize: z.number().int().positive(), checksumSha256: z.string(), contentUrl: z.string(), createdAt: z.string(), addedAt: z.string().optional(),
  space: LibrarySpaceSchema, folderId: IdentifierSchema.nullable(), tagIds: z.array(IdentifierSchema),
}).strict();
export const LibraryEntityEntrySchema = z.object({ entityId: IdentifierSchema, space: LibrarySpaceSchema, tagIds: z.array(IdentifierSchema), folderId: IdentifierSchema.nullable().optional(), addedAt: z.string().optional() }).strict();
export const MediaLibraryCatalogSchema = z.object({ folders: z.array(LibraryFolderSchema), tags: z.array(LibraryTagSchema), entries: z.array(LibraryEntrySchema), entityEntries: z.array(LibraryEntityEntrySchema).optional() }).strict();
export const UpdateLibraryTagsInputSchema = z.object({
  workspaceId: IdentifierSchema, space: LibrarySpaceSchema, operation: z.enum(["add", "remove", "replace"]),
  tagIds: z.array(IdentifierSchema).max(50),
  expectedTagIds: z.array(IdentifierSchema).max(50).optional(),
  items: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("media"), id: IdentifierSchema }).strict(),
    z.object({ kind: z.literal("entity"), id: IdentifierSchema }).strict(),
  ])).min(1).max(100),
}).strict();
export type UpdateLibraryTagsInput = z.infer<typeof UpdateLibraryTagsInputSchema>;
export function isValidLibraryTagUpdate(input: Pick<UpdateLibraryTagsInput, "operation" | "items" | "tagIds" | "expectedTagIds">): boolean {
  return input.operation === "replace"
    ? input.items.length === 1 && input.expectedTagIds !== undefined
    : input.tagIds.length > 0 && input.expectedTagIds === undefined;
}
export const DeleteLibraryTagInputSchema = z.object({
  workspaceId: IdentifierSchema, space: LibrarySpaceSchema, tagId: IdentifierSchema,
  expectedUsageCount: z.number().int().nonnegative(),
}).strict();
export type DeleteLibraryTagInput = z.infer<typeof DeleteLibraryTagInputSchema>;

/** Delete a scoped dictionary label and its placements, never the underlying media or group. */
export function planLibraryTagDeletion(catalog: MediaLibraryCatalog, input: DeleteLibraryTagInput): MediaLibraryCatalog {
  const parsed = DeleteLibraryTagInputSchema.safeParse({ workspaceId: input.workspaceId, space: input.space, tagId: input.tagId, expectedUsageCount: input.expectedUsageCount });
  if (!parsed.success) throw new MediaLibraryError("invalid_request", "删除标签的信息无效。");
  const { space, tagId, expectedUsageCount } = parsed.data;
  if (tagId.startsWith("builtin:")) throw new MediaLibraryError("preset_tag", "内置标签不能删除。");
  if (!catalog.tags.some((tag) => tag.id === tagId && tag.space === space)) return catalog;
  const affected = (entry: { space: LibrarySpace; tagIds: string[] }) => entry.space === space && entry.tagIds.includes(tagId);
  const count = catalog.entries.filter(affected).length + (catalog.entityEntries ?? []).filter(affected).length;
  if (count !== expectedUsageCount) throw new MediaLibraryError("tag_usage_changed", "标签使用情况已变化，请刷新后重新确认删除。");
  const clearTag = <T extends { space: LibrarySpace; tagIds: string[] }>(entry: T): T => affected(entry) ? { ...entry, tagIds: entry.tagIds.filter((id) => id !== tagId) } : entry;
  return {
    ...catalog,
    tags: catalog.tags.filter((tag) => !(tag.id === tagId && tag.space === space)),
    entries: catalog.entries.map(clearTag),
    ...(catalog.entityEntries ? { entityEntries: catalog.entityEntries.map(clearTag) } : {}),
  };
}
export interface LibraryTagUpdatePlan { space: LibrarySpace; items: Array<{ kind: "media" | "entity"; id: string; tagIds: string[] }> }

/** Resolve each placement before mutation. Group tags never read or change member tags. */
export function planLibraryTagUpdate(catalog: MediaLibraryCatalog, input: UpdateLibraryTagsInput): LibraryTagUpdatePlan {
  const parsed = UpdateLibraryTagsInputSchema.safeParse({ workspaceId: input.workspaceId, space: input.space, operation: input.operation, tagIds: input.tagIds, items: input.items, expectedTagIds: input.expectedTagIds });
  if (!parsed.success) throw new MediaLibraryError("invalid_request", "整理标签的信息无效。");
  const normalized = parsed.data;
  if (!isValidLibraryTagUpdate(normalized)) {
    throw new MediaLibraryError("invalid_request", "整理标签的信息无效。");
  }
  if (new Set(normalized.items.map((item) => `${item.kind}:${item.id}`)).size !== normalized.items.length) throw new MediaLibraryError("invalid_request", "整理列表包含重复条目。");
  if (normalized.tagIds.some((id) => !BUILTIN_LIBRARY_TAGS.some((tag) => tag.id === id) && !catalog.tags.some((tag) => tag.id === id && tag.space === normalized.space))) throw new MediaLibraryError("tag_not_found", "标签不属于当前空间，请重新选择。");
  const selectedTags = new Set(normalized.tagIds);
  return { space: normalized.space, items: normalized.items.map((item) => {
    const entry = item.kind === "media"
      ? catalog.entries.find((entry) => entry.assetId === item.id && entry.space === normalized.space)
      : catalog.entityEntries?.find((entry) => entry.entityId === item.id && entry.space === normalized.space);
    if (!entry) throw new MediaLibraryError("library_item_not_found", "所选素材不存在或不可访问，请刷新后重新选择。");
    const tagIds = [...new Set(normalized.operation === "replace" ? [...selectedTags]
      : normalized.operation === "add" ? [...entry.tagIds, ...selectedTags] : entry.tagIds.filter((id) => !selectedTags.has(id)))].sort();
    if (normalized.operation === "replace") {
      const sameTags = (left: string[], right: string[]) => JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
      if (!sameTags(entry.tagIds, normalized.expectedTagIds!) && !sameTags(entry.tagIds, tagIds)) {
        throw new MediaLibraryError("tag_selection_changed", "素材标签已发生变化，请关闭后重新打开设置标签。");
      }
    }
    if (tagIds.length > 50) throw new MediaLibraryError("tag_limit_exceeded", "每个条目最多保留 50 个标签，请先移除部分标签。");
    return { ...item, tagIds };
  }) };
}
export const MoveLibraryEntitiesInputSchema = z.object({
  workspaceId: IdentifierSchema, space: z.literal("personal"), folderId: IdentifierSchema.nullable(),
  items: z.array(z.object({ entityId: IdentifierSchema, expectedFolderId: IdentifierSchema.nullable() }).strict()).min(1).max(100),
}).strict();
export type MoveLibraryEntitiesInput = z.infer<typeof MoveLibraryEntitiesInputSchema>;

export function validateLibraryEntityMove(catalog: MediaLibraryCatalog, input: MoveLibraryEntitiesInput): MoveLibraryEntitiesInput {
  const parsed = MoveLibraryEntitiesInputSchema.safeParse({ workspaceId: input.workspaceId, space: input.space, folderId: input.folderId, items: input.items });
  if (!parsed.success) throw new MediaLibraryError("invalid_request", "移动素材组的信息无效。");
  const normalized = parsed.data;
  if (normalized.folderId && !catalog.folders.some((folder) => folder.id === normalized.folderId && folder.space === "personal")) throw new MediaLibraryError("folder_not_found", "保存目录不存在或不可访问，请重新选择。");
  if (new Set(normalized.items.map((item) => item.entityId)).size !== normalized.items.length) throw new MediaLibraryError("invalid_request", "移动列表包含重复素材组。");
  for (const item of normalized.items) {
    const entry = catalog.entityEntries?.find((entry) => entry.entityId === item.entityId && entry.space === "personal");
    if (!entry) throw new MediaLibraryError("library_item_not_found", "素材组不存在或不可访问。");
    const current = entry.folderId ?? null;
    if (current !== item.expectedFolderId && current !== normalized.folderId) throw new MediaLibraryError("placement_changed", "素材组已被移动，请刷新后重新选择。");
  }
  return normalized;
}

export const SaveLibraryItemSchema = z.object({ assetId: IdentifierSchema, displayName: z.string().trim().min(1).max(300), action: z.enum(["add", "save", "move"]), expectedFolderId: IdentifierSchema.nullable().optional() }).strict();
export const SaveLibraryInputSchema = z.object({ workspaceId: IdentifierSchema, projectId: IdentifierSchema, space: LibrarySpaceSchema, folderId: IdentifierSchema.nullable(), tagIds: z.array(IdentifierSchema).max(50), items: z.array(SaveLibraryItemSchema).min(1).max(100) }).strict();
export const DeleteLibraryItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("media"), id: IdentifierSchema }).strict(),
  z.object({ kind: z.literal("folder"), id: IdentifierSchema }).strict(),
  z.object({ kind: z.literal("entity"), id: IdentifierSchema, expectedVersion: z.number().int().positive() }).strict(),
]);
export const DeleteLibraryInputSchema = z.object({ workspaceId: IdentifierSchema, space: LibrarySpaceSchema, items: z.array(DeleteLibraryItemSchema).min(1).max(100) }).strict();
export type DeleteLibraryInput = z.infer<typeof DeleteLibraryInputSchema>;
export interface LibraryEntityBinding { id: string; version: number; assetIds: string[] }
export interface LibraryDeletionPlan { folderIds: string[]; assetIds: string[]; entityIds: string[] }

/** Resolve the entire selection before adapters mutate anything. Source assets are never part of this plan. */
export function planLibraryDeletion(catalog: MediaLibraryCatalog, entities: LibraryEntityBinding[], input: DeleteLibraryInput): LibraryDeletionPlan {
  const parsed = DeleteLibraryInputSchema.safeParse({ workspaceId: input.workspaceId, space: input.space, items: input.items });
  if (!parsed.success) throw new MediaLibraryError("invalid_request", "删除素材的信息无效。");
  if (new Set(input.items.map((item) => `${item.kind}:${item.id}`)).size !== input.items.length) throw new MediaLibraryError("invalid_request", "删除列表包含重复条目。");
  const folders = catalog.folders.filter((folder) => folder.space === input.space);
  const folderIds = new Set(input.items.filter((item) => item.kind === "folder" && folders.some((folder) => folder.id === item.id)).map((item) => item.id));
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const folder of folders) if (folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) { folderIds.add(folder.id); expanded = true; }
  }
  const requestedAssets = new Set(input.items.filter((item) => item.kind === "media").map((item) => item.id));
  const assetIds = catalog.entries.filter((entry) => entry.space === input.space && (requestedAssets.has(entry.assetId) || (entry.folderId && folderIds.has(entry.folderId)))).map((entry) => entry.assetId);
  // Subjects have their own library area; historical folder locations never imply deletion.
  const entityIds: string[] = [];
  for (const item of input.items) {
    if (item.kind !== "entity") continue;
    const entity = entities.find((candidate) => candidate.id === item.id);
    if (!entity) continue;
    if (entity.version !== item.expectedVersion) throw new MediaLibraryError("entity_changed", "素材组已更新，请刷新后重新选择。");
    if (!entityIds.includes(entity.id)) entityIds.push(entity.id);
  }
  if (entities.some((entity) => !entityIds.includes(entity.id) && entity.assetIds.some((id) => assetIds.includes(id)))) throw new MediaLibraryError("library_item_in_use", "素材仍被主体引用，请先从主体中移除后再删除。");
  return { folderIds: [...folderIds], assetIds, entityIds };
}

export class MediaLibraryError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "MediaLibraryError"; }
}
export function normalizeLibraryName(value: string): string { return value.trim().normalize("NFKC"); }
export function libraryNameKey(value: string): string { return normalizeLibraryName(value).toLowerCase(); }
export function validateLibraryFolder(catalog: MediaLibraryCatalog, input: CreateLibraryFolderInput): string {
  const name = normalizeLibraryName(input.name);
  if (!name || name.length > 100 || [...name].some((character) => character.charCodeAt(0) < 32)) throw new MediaLibraryError("invalid_folder_name", "文件夹名称需为 1–100 个字符。");
  let depth = 1;
  let parentId = input.parentId;
  while (parentId) {
    const parent = catalog.folders.find((folder) => folder.id === parentId && folder.space === input.space);
    if (!parent) throw new MediaLibraryError("folder_not_found", "保存目录不存在或不可访问，请重新选择。");
    depth += 1;
    if (depth > 4) throw new MediaLibraryError("folder_depth_exceeded", "目录最多支持五级，当前位置无法新建子文件夹。");
    parentId = parent.parentId;
  }
  if (catalog.folders.some((folder) => folder.space === input.space && folder.parentId === input.parentId && libraryNameKey(folder.name) === libraryNameKey(name))) throw new MediaLibraryError("folder_name_conflict", "当前目录已有同名文件夹。");
  return name;
}
export function validateLibraryFolderRename(catalog: MediaLibraryCatalog, input: RenameLibraryFolderInput): LibraryFolder {
  const parsed = RenameLibraryFolderInputSchema.safeParse({ workspaceId: input.workspaceId, space: input.space, folderId: input.folderId, name: input.name, expectedName: input.expectedName });
  if (!parsed.success) throw new MediaLibraryError("invalid_request", "重命名文件夹的信息无效。");
  const current = catalog.folders.find((folder) => folder.id === parsed.data.folderId && folder.space === parsed.data.space);
  if (!current) throw new MediaLibraryError("folder_not_found", "文件夹不存在或不可访问，请重新选择。");
  const name = validateLibraryFolder({ ...catalog, folders: catalog.folders.filter((folder) => folder.id !== current.id) }, { workspaceId: parsed.data.workspaceId, space: current.space, parentId: current.parentId, name: parsed.data.name });
  if (current.name !== parsed.data.expectedName && current.name !== name) throw new MediaLibraryError("folder_changed", "文件夹名称已更新，请刷新后重新编辑。");
  return { ...current, name };
}

export function validateLibrarySave(catalog: MediaLibraryCatalog, input: SaveLibraryInput): SaveLibraryInput {
  const parsed = SaveLibraryInputSchema.safeParse({ workspaceId: input.workspaceId, projectId: input.projectId, space: input.space, folderId: input.folderId, tagIds: input.tagIds, items: input.items });
  if (!parsed.success) throw new MediaLibraryError("invalid_request", "保存素材的信息无效。");
  const normalized = { ...parsed.data, tagIds: [...new Set(parsed.data.tagIds)].sort() };
  if (normalized.folderId && !catalog.folders.some((folder) => folder.id === normalized.folderId && folder.space === normalized.space)) throw new MediaLibraryError("folder_not_found", "保存目录不存在或不可访问，请重新选择。");
  if (normalized.tagIds.some((id) => !BUILTIN_LIBRARY_TAGS.some((tag) => tag.id === id) && !catalog.tags.some((tag) => tag.id === id && tag.space === normalized.space))) throw new MediaLibraryError("tag_not_found", "标签不属于当前空间，请重新选择。");
  if (new Set(normalized.items.map((item) => item.assetId)).size !== normalized.items.length) throw new MediaLibraryError("duplicate_asset", "同一素材只能保存一次。");
  for (const item of normalized.items) {
    const existing = catalog.entries.find((entry) => entry.space === normalized.space && entry.assetId === item.assetId);
    if (item.action === "move") {
      if (item.expectedFolderId === undefined || !existing) throw new MediaLibraryError("placement_changed", "素材位置已变化，请刷新后重试。");
      if (existing.folderId !== item.expectedFolderId && !(existing.folderId === normalized.folderId && existing.displayName === item.displayName && JSON.stringify([...existing.tagIds].sort()) === JSON.stringify(normalized.tagIds))) throw new MediaLibraryError("placement_changed", "素材已被移动，请刷新后重新选择。");
    } else if (item.action === "save" && existing && existing.folderId !== normalized.folderId) throw new MediaLibraryError("explicit_move_required", "素材已在当前空间入库，请明确移动到所选位置。");
  }
  return normalized;
}
