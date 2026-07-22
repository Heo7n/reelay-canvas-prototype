import { z } from "zod";

export const DemoSessionBodySchema = z
  .object({
    account: z.string().trim().min(1).max(160),
    password: z.string().min(1).max(160),
  })
  .strict();

export const WorkspaceParamsSchema = z.object({
  workspaceId: z.string().trim().min(1).max(120),
});

export const ProjectParamsSchema = WorkspaceParamsSchema.extend({
  projectId: z.string().trim().min(1).max(160),
});

export const CreateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    coverAssetId: z.string().trim().min(1).max(160).nullable().optional(),
  })
  .strict();

export const UpdateProjectBodySchema = CreateProjectBodySchema.partial().refine(
  (value) => value.name !== undefined || value.coverAssetId !== undefined,
  { message: "At least one project field is required." },
);
