import { z } from "zod";

export const legacyCanvasContextSchema = z.object({
  protocolVersion: z.literal(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  canvasId: z.string().min(1),
  theme: z.enum(["light", "dark"]),
});

export type LegacyCanvasContext = z.infer<typeof legacyCanvasContextSchema>;

export const hostMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:init"),
  context: legacyCanvasContextSchema,
});

export const canvasMessageSchema = z.discriminatedUnion("type", [
  z.object({ source: z.literal("reelay-legacy-canvas"), type: z.literal("canvas:ready"), protocolVersion: z.literal(1) }),
  z.object({ source: z.literal("reelay-legacy-canvas"), type: z.literal("canvas:dirty"), dirty: z.boolean() }),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:navigate"),
    target: z.enum(["home", "projects"]),
  }),
]);

export type CanvasMessage = z.infer<typeof canvasMessageSchema>;

export function parseCanvasMessage(value: unknown): CanvasMessage | null {
  const result = canvasMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
