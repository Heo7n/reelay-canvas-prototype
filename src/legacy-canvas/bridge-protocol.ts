import { z } from "zod";

export const bridgeCanvasDocumentSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    schemaVersion: z.number().int().min(1),
    revision: z.number().int().min(0),
    content: z.unknown(),
  })
  .strict();

export const legacyCanvasContextSchema = z
  .object({
    protocolVersion: z.literal(1),
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    projectName: z.string().min(1),
    canvasId: z.string().min(1),
    theme: z.enum(["light", "dark"]),
    writable: z.boolean(),
    actor: z.object({
      account: z.string().min(1),
      displayName: z.string().min(1),
    }).strict(),
    workspace: z.object({
      name: z.string().min(1),
      role: z.enum(["owner", "admin", "member"]),
    }).strict(),
  })
  .strict();

export type LegacyCanvasContext = z.infer<typeof legacyCanvasContextSchema>;

export const hostMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:init"),
    context: legacyCanvasContextSchema,
  })
  .strict();

export const hostDocumentMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:document"),
    protocolVersion: z.literal(1),
    document: bridgeCanvasDocumentSchema.nullable(),
    writable: z.boolean(),
  })
  .strict();

export const hostFlushMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:flush"),
    protocolVersion: z.literal(1),
  })
  .strict();

export const hostSaveResultMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:save-result"),
    protocolVersion: z.literal(1),
    requestId: z.string().min(1),
    document: bridgeCanvasDocumentSchema,
  })
  .strict();

export const hostSaveErrorMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:save-error"),
    protocolVersion: z.literal(1),
    requestId: z.string().min(1),
    code: z.enum(["conflict", "forbidden", "missing", "network"]),
  })
  .strict();

export const canvasMessageSchema = z.discriminatedUnion("type", [
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:ready"),
    protocolVersion: z.literal(1),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:dirty"),
    protocolVersion: z.literal(1),
    dirty: z.boolean(),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:navigate"),
    protocolVersion: z.literal(1),
    target: z.enum(["home", "projects", "logout"]),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:open-account"),
    protocolVersion: z.literal(1),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:save"),
    protocolVersion: z.literal(1),
    requestId: z.string().min(1),
    schemaVersion: z.number().int().min(1),
    expectedRevision: z.number().int().min(0),
    content: z.unknown(),
  }).strict(),
]);

export type CanvasMessage = z.infer<typeof canvasMessageSchema>;

export function parseCanvasMessage(value: unknown): CanvasMessage | null {
  const result = canvasMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
