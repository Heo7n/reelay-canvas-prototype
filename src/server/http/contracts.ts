import { z } from "zod";

export const DemoSessionBodySchema = z
  .object({
    account: z.string().trim().min(1).max(160),
    password: z.string().min(1).max(160),
  })
  .strict();

export const UpdateAccountContactsBodySchema = z
  .object({
    contactEmail: z.string().trim().email().max(254).nullable(),
    contactPhone: z
      .string()
      .trim()
      .min(5)
      .max(32)
      .regex(/^[+0-9()\-\s]+$/, "Phone contains unsupported characters.")
      .nullable(),
  })
  .strict();

export const WorkspaceParamsSchema = z.object({
  workspaceId: z.string().trim().min(1).max(120),
});

export const ProjectParamsSchema = WorkspaceParamsSchema.extend({
  projectId: z.string().trim().min(1).max(160),
});

export const CanvasDocumentParamsSchema = z.object({
  projectId: z.string().trim().min(1).max(160),
  canvasId: z.string().trim().min(1).max(160),
});

export const SaveCanvasDocumentBodySchema = z
  .object({
    schemaVersion: z.number().int().positive().max(2_147_483_647),
    expectedRevision: z.number().int().nonnegative().max(2_147_483_647),
    content: z.json(),
  })
  .strict();

export const CreateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    coverAssetId: z.string().trim().min(1).max(160).nullable().optional(),
    accessKind: z.literal("private").optional(),
  })
  .strict();

export const UpdateProjectBodySchema = CreateProjectBodySchema.omit({ accessKind: true }).partial().refine(
  (value) => value.name !== undefined || value.coverAssetId !== undefined,
  { message: "At least one project field is required." },
);
