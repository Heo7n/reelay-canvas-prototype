import { z } from "zod";

import type { ApplicationServices } from "../../app/services";
import { ApplicationError } from "../../application/shared/ApplicationError";
import type { CanvasDocument } from "../../domain/canvas/canvas-document";
import type { SessionActor } from "../../domain/identity/session";
import type { ProjectSummary } from "../../domain/project/project";
import type { Workspace } from "../../domain/workspace/workspace";
import { ExperienceAssetStore } from "./ExperienceAssetStore";

export const EXPERIENCE_WORKSPACE_ID = "workspace-experience";
const EXPERIENCE_ACTOR_ID = "actor-experience-visitor";

const workspace: Workspace = {
  id: EXPERIENCE_WORKSPACE_ID,
  kind: "organization",
  name: "Reelay 体验空间",
  currentUserRole: "owner",
};

const projectNameSchema = z.string().trim().min(1).max(100);
const coverSchema = z.string().trim().min(1).max(160).nullable();
const createProjectSchema = z.object({ name: projectNameSchema, coverAssetId: coverSchema.optional() }).strict();
const updateProjectSchema = createProjectSchema.partial().refine((input) => input.name !== undefined || input.coverAssetId !== undefined);
const contactsSchema = z.object({
  contactEmail: z.string().trim().email().max(254).nullable(),
  contactPhone: z.string().trim().min(5).max(32).regex(/^[+0-9()\-\s]+$/).nullable(),
}).strict();
const canvasIdSchema = z.string().min(1).max(160).refine((id) => id.trim() === id);
const canvasSaveSchema = z.object({
  projectId: z.string().min(1),
  canvasId: canvasIdSchema,
  schemaVersion: z.literal(1),
  expectedRevision: z.number().int().nonnegative().max(2_147_483_646),
  content: z.json(),
}).strict();

function validate<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApplicationError("request_failed", message, { serviceCode: "invalid_request" });
  return result.data;
}

function initialActor(): SessionActor {
  return {
    id: EXPERIENCE_ACTOR_ID,
    account: "visitor@reelay.example",
    displayName: "体验访客",
    workspaceIds: [EXPERIENCE_WORKSPACE_ID],
    contactEmail: null,
    contactPhone: null,
  };
}

function initialProjects(): ProjectSummary[] {
  // Public presentation fields only; never import the internal account/demo seed.
  return [
    { id: "experience-project-perfume", name: "香水品牌影像", accessKind: "private", coverAssetId: "demo-cover-perfume" },
    { id: "experience-project-scifi", name: "科幻概念预告片", accessKind: "collaborative", coverAssetId: "demo-cover-scifi" },
    { id: "experience-project-character", name: "角色动画短片", accessKind: "private", coverAssetId: "demo-cover-character" },
    { id: "experience-project-product", name: "产品视觉广告", accessKind: "collaborative", coverAssetId: "demo-cover-product" },
  ].map((project, index) => ({
    ...project,
    accessKind: project.accessKind as ProjectSummary["accessKind"],
    workspaceId: EXPERIENCE_WORKSPACE_ID,
    currentUserRole: "admin",
    updatedAt: `2026-09-0${4 - index}T08:00:00.000Z`,
  }));
}

export interface ExperienceServices extends ApplicationServices {
  transientMediaRepository: ExperienceAssetStore;
}

/** A new page load constructs a new instance; nothing is written to storage or HTTP. */
export function createExperienceServices(): ExperienceServices {
  let actor = initialActor();
  const projects = new Map<string, { project: ProjectSummary; trashed: boolean }>();
  const documents = new Map<string, Map<string, CanvasDocument>>();
  const assets = new ExperienceAssetStore({
    workspaceId: EXPERIENCE_WORKSPACE_ID,
    hasProject: (projectId) => projects.get(projectId)?.trashed === false,
  });

  function reset(): void {
    actor = initialActor();
    projects.clear();
    documents.clear();
    for (const project of initialProjects()) projects.set(project.id, { project, trashed: false });
    assets.reset();
  }

  function requireWorkspace(workspaceId: string): void {
    if (workspaceId !== EXPERIENCE_WORKSPACE_ID) {
      throw new ApplicationError("not_found", "体验空间不存在。", { serviceCode: "workspace_not_found" });
    }
  }

  function requireProject(projectId: string): ProjectSummary {
    const entry = projects.get(projectId);
    if (!entry || entry.trashed) {
      throw new ApplicationError("not_found", "项目不存在或已删除。", { serviceCode: "project_not_found" });
    }
    return entry.project;
  }

  function listProjects(): ProjectSummary[] {
    return structuredClone([...projects.values()].filter((entry) => !entry.trashed).map((entry) => entry.project));
  }

  reset();

  return {
    transientMediaRepository: assets,
    mediaAssetRepository: assets.media,
    entityRepository: assets.entities,
    sessionGateway: {
      getCurrent: async () => ({ actor: structuredClone(actor) }),
      // Credentials are intentionally neither authenticated, retained, nor sent.
      signInWithPassword: async () => ({ actor: structuredClone(actor) }),
      signOut: async () => { reset(); },
    },
    workspaceRepository: {
      listForActor: async (actorId) => actorId === EXPERIENCE_ACTOR_ID ? [structuredClone(workspace)] : [],
      getById: async (workspaceId) => workspaceId === EXPERIENCE_WORKSPACE_ID ? structuredClone(workspace) : null,
    },
    workspaceContextGateway: {
      load: async (workspaceId) => {
        requireWorkspace(workspaceId);
        return { actor: structuredClone(actor), workspaces: [structuredClone(workspace)], projects: listProjects() };
      },
    },
    organizationRepository: {
      listMembers: async (workspaceId) => {
        requireWorkspace(workspaceId);
        return [{ userId: actor.id, displayName: actor.displayName, loginIdentifier: actor.account, role: "owner" }];
      },
    },
    accountRepository: {
      updateContacts: async (input) => {
        const contacts = validate(contactsSchema, input, "联系资料格式无效。");
        actor = { ...actor, ...contacts };
        return structuredClone(actor);
      },
    },
    projectRepository: {
      listByWorkspace: async (workspaceId) => {
        requireWorkspace(workspaceId);
        return listProjects();
      },
      getById: async (workspaceId, projectId) => {
        requireWorkspace(workspaceId);
        const entry = projects.get(projectId);
        return entry && !entry.trashed ? structuredClone(entry.project) : null;
      },
      create: async (workspaceId, input) => {
        requireWorkspace(workspaceId);
        const values = validate(createProjectSchema, input, "项目名称或封面无效。");
        const project: ProjectSummary = {
          id: `experience-project-${crypto.randomUUID()}`,
          workspaceId: EXPERIENCE_WORKSPACE_ID,
          name: values.name,
          coverAssetId: values.coverAssetId ?? null,
          accessKind: "private",
          currentUserRole: "admin",
          updatedAt: new Date().toISOString(),
        };
        projects.set(project.id, { project, trashed: false });
        return structuredClone(project);
      },
      update: async (workspaceId, projectId, input) => {
        requireWorkspace(workspaceId);
        const project = requireProject(projectId);
        if (project.currentUserRole === "view") throw new ApplicationError("forbidden", "当前项目权限为只读。");
        const values = validate(updateProjectSchema, input, "项目名称或封面无效。");
        const updated = {
          ...project,
          name: values.name ?? project.name,
          coverAssetId: values.coverAssetId === undefined ? project.coverAssetId : values.coverAssetId,
          updatedAt: new Date().toISOString(),
        };
        projects.set(projectId, { project: updated, trashed: false });
        return structuredClone(updated);
      },
      moveToTrash: async (workspaceId, projectId) => {
        requireWorkspace(workspaceId);
        const project = requireProject(projectId);
        if (project.currentUserRole !== "admin") throw new ApplicationError("forbidden", "当前账号无权删除此项目。");
        // Preserve the in-memory record/document while revoking all access.
        projects.set(projectId, { project, trashed: true });
      },
    },
    canvasDocumentRepository: {
      getCanvasDocument: async (projectId, canvasId) => {
        requireProject(projectId);
        validate(canvasIdSchema, canvasId, "画布标识无效。");
        return structuredClone(documents.get(projectId)?.get(canvasId) ?? null);
      },
      save: async (input) => {
        const project = requireProject(input.projectId);
        if (project.currentUserRole === "view") throw new ApplicationError("forbidden", "当前项目权限为只读。");
        const values = validate(canvasSaveSchema, input, "画布文档数据无效。");
        const currentRevision = documents.get(values.projectId)?.get(values.canvasId)?.revision ?? 0;
        if (values.expectedRevision !== currentRevision) {
          throw new ApplicationError("conflict", "画布已被其他保存更新，请重新加载后再试。", {
            serviceCode: "canvas_revision_conflict", details: { currentRevision },
          });
        }
        const document: CanvasDocument = {
          id: values.canvasId, projectId: values.projectId, schemaVersion: 1,
          revision: currentRevision + 1, content: structuredClone(values.content),
        };
        let projectDocuments = documents.get(values.projectId);
        if (!projectDocuments) {
          projectDocuments = new Map();
          documents.set(values.projectId, projectDocuments);
        }
        projectDocuments.set(values.canvasId, document);
        return structuredClone(document);
      },
    },
  };
}
