import { z } from "zod";
import { SeedanceVideoParametersSchema } from "./seedance-video";
import type { CanvasVideoGenerationContext, CanvasVideoProjectBinding, CanvasVideoResult, CanvasVideoTask, CanvasVideoTaskProjection, PrepareCanvasVideoTask } from "../domain/generation/canvas-video-task";

const Id = z.string().trim().min(1).max(200);
export const ExpectedCanvasVideoActorSchema = z.object({ expectedActorId: z.string().min(1).max(200) }).strict();
export interface PrepareCanvasVideoTaskRequest extends PrepareCanvasVideoTask { expectedActorId: string }
export const PrepareCanvasVideoTaskInputSchema = z.object({
  requestKey: z.string().uuid(), projectId: Id, canvasDocumentId: Id, canvasRecordId: Id, nodeId: Id,
  conversationId: z.string().uuid().nullable().default(null), sourceSurface: z.enum(["canvas", "conversation"]),
  prompt: z.string().trim().min(1).max(4000), parameters: SeedanceVideoParametersSchema, references: z.tuple([]),
}).strict().superRefine((value, ctx) => {
  if (value.sourceSurface === "conversation" && !value.conversationId) ctx.addIssue({ code: "custom", path: ["conversationId"], message: "Conversation identity is required." });
  if (value.sourceSurface === "canvas" && value.conversationId) ctx.addIssue({ code: "custom", path: ["conversationId"], message: "Canvas tasks cannot contain private conversation identity." });
}) satisfies z.ZodType<PrepareCanvasVideoTask>;
// The iframe supplies only core intent; its trusted host injects this realm
// precondition. The server removes it before freezing domain task input.
export const PrepareCanvasVideoTaskSchema = PrepareCanvasVideoTaskInputSchema.safeExtend({ expectedActorId: ExpectedCanvasVideoActorSchema.shape.expectedActorId }) satisfies z.ZodType<PrepareCanvasVideoTaskRequest>;
export const CanvasVideoProjectBindingSchema = z.object({ projectId: Id, platformProjectId: Id, platformProjectName: z.string() }) satisfies z.ZodType<CanvasVideoProjectBinding>;
export const SetCanvasVideoBindingSchema = z.object({ projectId: Id, platformProjectId: Id, expectedActorId: ExpectedCanvasVideoActorSchema.shape.expectedActorId }).strict();
export const CanvasVideoResultSchema = z.object({ id: z.string().uuid(), taskId: z.string().uuid(), projectId: Id,
  url: z.string().regex(/^\/api\/projects\/[^/]+\/generation-results\/[a-zA-Z0-9_-]+\/video$/), contentType: z.string().startsWith("video/"), byteSize: z.number().int().positive(),
}) satisfies z.ZodType<CanvasVideoResult>;
export const CanvasVideoTaskSchema = z.object({ id: z.string().uuid(), requestKey: z.string().uuid(), projectId: Id,
  canvasDocumentId: Id, canvasRecordId: Id, nodeId: Id, conversationId: z.string().uuid().nullable(), sourceSurface: z.enum(["canvas", "conversation"]),
  prompt: z.string(), parameters: SeedanceVideoParametersSchema,
  status: z.enum(["prepared", "submitting", "waiting", "saving", "succeeded", "failed", "unconfirmed", "save_failed"]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), message: z.string(), result: CanvasVideoResultSchema.nullable(),
}) satisfies z.ZodType<CanvasVideoTask>;
export const CanvasVideoTaskListSchema = z.object({ tasks: z.array(CanvasVideoTaskSchema) });
export const CanvasVideoTaskProjectionSchema = CanvasVideoTaskSchema.pick({ id: true, projectId: true, canvasDocumentId: true, canvasRecordId: true, nodeId: true, sourceSurface: true, parameters: true, status: true, message: true, result: true }).extend({ isOwner: z.boolean() }) satisfies z.ZodType<CanvasVideoTaskProjection>;
export const CanvasVideoGenerationContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("simulation"), reason: z.enum(["unavailable", "disconnected"]), taskHistoryAvailable: z.boolean().optional() }),
  z.object({ kind: z.literal("blocked"), reason: z.literal("expired"), taskHistoryAvailable: z.boolean().optional() }),
  z.object({ kind: z.literal("real"), platformUser: z.object({ id: Id, displayName: z.string() }), binding: CanvasVideoProjectBindingSchema.nullable(), taskHistoryAvailable: z.boolean().optional() }),
]) satisfies z.ZodType<CanvasVideoGenerationContext>;
export type { CanvasVideoGenerationContext, CanvasVideoProjectBinding, CanvasVideoResult, CanvasVideoTask, CanvasVideoTaskProjection, PrepareCanvasVideoTask } from "../domain/generation/canvas-video-task";
