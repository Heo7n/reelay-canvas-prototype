import { z } from "zod";

import type { MediaKind } from "./workspace-media-asset";

export interface MediaUploadFormat {
  mediaKind: MediaKind;
  extensions: Record<string, string>;
}

export interface LibraryUploadPolicy {
  maxFileBytes: number;
  formats: MediaUploadFormat[];
  contentTypeAliases: Record<string, string>;
}

export interface MediaUploadPolicy {
  library: LibraryUploadPolicy;
  canvasMaxFileBytes: number;
  maxFileBytesByContentType: Record<string, number>;
}

export const MediaUploadPolicySchema: z.ZodType<MediaUploadPolicy> = z.object({
  library: z.object({
    maxFileBytes: z.number().int().positive(),
    formats: z.array(z.object({
      mediaKind: z.enum(["image", "video", "audio"]),
      extensions: z.record(z.string().min(1), z.string().min(1)),
    }).strict()).min(1),
    contentTypeAliases: z.record(z.string().min(1), z.string().min(1)),
  }).strict(),
  canvasMaxFileBytes: z.number().int().positive(),
  maxFileBytesByContentType: z.record(z.string().min(1), z.number().int().positive()),
}).strict();

// This policy governs new local library uploads. Existing assets and canvas
// references remain readable regardless of the library's intake formats.
export const LIBRARY_UPLOAD_POLICY: LibraryUploadPolicy = {
  maxFileBytes: 50 * 1024 * 1024,
  formats: [
    { mediaKind: "image", extensions: { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml" } },
    { mediaKind: "video", extensions: { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } },
    { mediaKind: "audio", extensions: { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", flac: "audio/flac", aac: "audio/aac", ogg: "audio/ogg" } },
  ],
  contentTypeAliases: {
    "audio/x-wav": "audio/wav",
    "audio/x-flac": "audio/flac",
    "audio/x-m4a": "audio/mp4",
    "audio/x-aac": "audio/aac",
    "application/ogg": "audio/ogg",
  },
};

export function buildMediaUploadPolicy(canvasMaxFileBytes: number): MediaUploadPolicy {
  if (!Number.isSafeInteger(canvasMaxFileBytes) || canvasMaxFileBytes <= 0) {
    throw new Error("Canvas upload byte limit must be a positive safe integer.");
  }
  return {
    library: {
      maxFileBytes: Math.min(LIBRARY_UPLOAD_POLICY.maxFileBytes, canvasMaxFileBytes),
      formats: LIBRARY_UPLOAD_POLICY.formats.map((format) => ({ ...format, extensions: { ...format.extensions } })),
      contentTypeAliases: { ...LIBRARY_UPLOAD_POLICY.contentTypeAliases },
    },
    canvasMaxFileBytes,
    // SVG must stay on the sandboxed content route instead of following a
    // Storage redirect, including in environments with a small response cap.
    maxFileBytesByContentType: { "image/svg+xml": Math.min(4 * 1024 * 1024, canvasMaxFileBytes) },
  };
}

export function isLibraryUploadFormat(input: {
  mediaKind: MediaKind;
  displayName: string;
  contentType: string;
}): boolean {
  const extension = /\.([^.]+)$/.exec(input.displayName.trim())?.[1].toLowerCase();
  if (!extension) return false;
  const format = LIBRARY_UPLOAD_POLICY.formats.find((candidate) => candidate.mediaKind === input.mediaKind);
  const expectedType = format?.extensions[extension];
  const contentType = input.contentType.trim().toLowerCase();
  return Boolean(expectedType && (LIBRARY_UPLOAD_POLICY.contentTypeAliases[contentType] ?? contentType) === expectedType);
}
