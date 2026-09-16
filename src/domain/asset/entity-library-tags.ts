import { z } from "zod";
import { BUILTIN_LIBRARY_TAGS, MediaLibraryError } from "./media-library";

export const EntityLibraryTagIdsSchema = z.array(z.string().trim().min(1).max(200)).max(50);

export function normalizeEntityLibraryTags(value: readonly string[]): string[] {
  const parsed = EntityLibraryTagIdsSchema.safeParse(value);
  if (!parsed.success) throw new MediaLibraryError("invalid_request", "主体标签无效。");
  return [...new Set(parsed.data)].sort();
}

export function validateEntityLibraryTags(value: readonly string[], customTagExists: (id: string) => boolean): string[] {
  const tags = normalizeEntityLibraryTags(value);
  if (tags.some((id) => !BUILTIN_LIBRARY_TAGS.some((tag) => tag.id === id) && !customTagExists(id))) {
    throw new MediaLibraryError("tag_not_found", "标签不存在或不属于当前个人空间，请重新选择。");
  }
  return tags;
}

export function requireExpectedEntityLibraryTags(current: readonly string[], expected: readonly string[] | undefined): void {
  if (expected === undefined) throw new MediaLibraryError("invalid_request", "缺少主体标签的原始状态。");
  if (JSON.stringify(normalizeEntityLibraryTags(current)) !== JSON.stringify(normalizeEntityLibraryTags(expected))) {
    throw new MediaLibraryError("placement_changed", "主体标签已被其他操作更新，请重新打开后再试。");
  }
}
