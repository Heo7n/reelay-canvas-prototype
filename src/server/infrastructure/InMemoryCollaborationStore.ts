import { randomUUID } from "node:crypto";

import {
  CanvasDocumentProjectUnavailableError,
  CanvasDocumentRevisionConflictError,
  type SaveCanvasDocumentInput,
} from "../application/CanvasDocumentStore";
import type { CanvasDocument, CanvasId } from "../../domain/canvas/canvas-document";
import type { ActorId, SessionActor } from "../../domain/identity/session";
import type { ProjectId, ProjectSummary, ProjectUserRole } from "../../domain/project/project";
import type { Membership, Workspace, WorkspaceId } from "../../domain/workspace/workspace";
import type {
  CollaborationStore,
  CreateProjectInput,
  UpdateProjectInput,
} from "../application/CollaborationStore";
import {
  createDemoSeed,
  type DemoAccountFixture,
  type DemoProjectFixture,
  type DemoSeed,
} from "../demo-fixtures";

export class InMemoryCollaborationStore implements CollaborationStore {
  readonly storageKind = "server-memory" as const;

  private readonly accounts: DemoAccountFixture[];
  private readonly workspaces: Workspace[];
  private readonly memberships: Membership[];
  private readonly projects = new Map<ProjectId, DemoProjectFixture>();
  private readonly trashedProjects = new Map<ProjectId, { deletedAt: string; deletedByActorId: ActorId }>();
  private readonly projectMemberships = new Map<ProjectId, Map<ActorId, ProjectUserRole>>();
  private readonly canvasDocuments = new Map<ProjectId, Map<CanvasId, CanvasDocument>>();
  private readonly sessions = new Map<string, ActorId>();
  private readonly accountContacts = new Map<ActorId, { contactEmail: string | null; contactPhone: string | null }>();

  constructor(
    seed: DemoSeed = createDemoSeed(),
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {
    this.accounts = seed.accounts.map((account) => ({ ...account }));
    this.accounts.forEach((account) => {
      this.accountContacts.set(account.actorId, { contactEmail: null, contactPhone: null });
    });
    this.workspaces = seed.workspaces.map((workspace) => ({ ...workspace }));
    this.memberships = seed.memberships.map((membership) => ({ ...membership }));
    seed.projects.forEach((project) => this.projects.set(project.id, { ...project }));
    seed.projectMemberships.forEach(({ projectId, actorId, role }) => {
      const projectMembers = this.projectMemberships.get(projectId) ?? new Map<ActorId, ProjectUserRole>();
      projectMembers.set(actorId, role);
      this.projectMemberships.set(projectId, projectMembers);
    });
  }

  async ping(): Promise<void> {}

  async close(): Promise<void> {}

  async authenticate(account: string, password: string): Promise<ActorId | null> {
    const normalizedAccount = account.trim().toLocaleLowerCase("en-US");
    const match = this.accounts.find(
      (candidate) =>
        candidate.account.toLocaleLowerCase("en-US") === normalizedAccount && candidate.password === password,
    );
    return match?.actorId ?? null;
  }

  async createSession(actorId: ActorId): Promise<string> {
    const sessionId = this.createId();
    this.sessions.set(sessionId, actorId);
    return sessionId;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getSessionActor(sessionId: string | undefined): Promise<SessionActor | null> {
    if (!sessionId) return null;
    const actorId = this.sessions.get(sessionId);
    if (!actorId) return null;
    return this.toSessionActor(actorId);
  }

  private toSessionActor(actorId: ActorId): SessionActor | null {
    const account = this.accounts.find((candidate) => candidate.actorId === actorId);
    if (!account) return null;

    const contacts = this.accountContacts.get(actorId);
    return {
      account: account.account,
      contactEmail: contacts?.contactEmail ?? null,
      contactPhone: contacts?.contactPhone ?? null,
      id: actorId,
      displayName: account.displayName,
      workspaceIds: this.memberships
        .filter((membership) => membership.actorId === actorId)
        .map((membership) => membership.workspaceId),
    };
  }

  async updateAccountContacts(
    actorId: ActorId,
    contacts: { contactEmail: string | null; contactPhone: string | null },
  ): Promise<SessionActor | null> {
    if (!this.accounts.some((account) => account.actorId === actorId)) return null;
    this.accountContacts.set(actorId, { ...contacts });
    return this.toSessionActor(actorId);
  }

  async listWorkspacesForActor(actorId: ActorId): Promise<Workspace[]> {
    return this.memberships
      .filter((membership) => membership.actorId === actorId)
      .flatMap((membership) => {
        const workspace = this.workspaces.find((candidate) => candidate.id === membership.workspaceId);
        return workspace ? [{ ...workspace, currentUserRole: membership.role }] : [];
      });
  }

  async canReadWorkspace(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean> {
    return this.memberships.some(
      (membership) => membership.actorId === actorId && membership.workspaceId === workspaceId,
    );
  }

  async getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    const workspace = this.workspaces.find((candidate) => candidate.id === workspaceId);
    return workspace ? { ...workspace } : null;
  }

  async listProjects(actorId: ActorId, workspaceId: WorkspaceId): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .filter(
        (project) =>
          project.workspaceId === workspaceId &&
          !this.trashedProjects.has(project.id) &&
          this.projectMemberships.get(project.id)?.has(actorId),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((project) => this.toProjectSummary(project, actorId));
  }

  async getProject(
    actorId: ActorId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
  ): Promise<ProjectSummary | null> {
    const project = this.projects.get(projectId);
    if (
      !project ||
      this.trashedProjects.has(projectId) ||
      project.workspaceId !== workspaceId ||
      !this.projectMemberships.get(projectId)?.has(actorId)
    ) {
      return null;
    }
    return this.toProjectSummary(project, actorId);
  }

  async getProjectById(actorId: ActorId, projectId: ProjectId): Promise<ProjectSummary | null> {
    const project = this.projects.get(projectId);
    if (
      !project ||
      this.trashedProjects.has(projectId) ||
      !this.projectMemberships.get(projectId)?.has(actorId)
    ) return null;
    return this.toProjectSummary(project, actorId);
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const project: DemoProjectFixture = {
      id: `project-${this.createId()}`,
      workspaceId: input.workspaceId,
      accessKind: "private",
      createdByActorId: input.createdByActorId,
      name: input.name,
      updatedAt: this.now().toISOString(),
      coverAssetId: input.coverAssetId ?? null,
    };
    this.projects.set(project.id, project);
    this.projectMemberships.set(project.id, new Map([[input.createdByActorId, "admin"]]));
    return this.toProjectSummary(project, input.createdByActorId);
  }

  async updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null> {
    const current = this.projects.get(projectId);
    if (!current || this.trashedProjects.has(projectId) || current.workspaceId !== workspaceId) return null;
    const role = this.projectMemberships.get(projectId)?.get(input.updatedByActorId);
    if (role !== "admin" && role !== "edit") return null;

    const project: DemoProjectFixture = {
      ...current,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.coverAssetId !== undefined ? { coverAssetId: input.coverAssetId } : {}),
      updatedAt: this.now().toISOString(),
    };
    this.projects.set(project.id, project);
    return this.toProjectSummary(project, input.updatedByActorId);
  }

  async moveProjectToTrash(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    actorId: ActorId,
  ): Promise<boolean> {
    const project = this.projects.get(projectId);
    const role = this.projectMemberships.get(projectId)?.get(actorId);
    const canDelete = project?.accessKind === "private"
      ? project.createdByActorId === actorId
      : role === "admin";
    if (
      !project ||
      project.workspaceId !== workspaceId ||
      this.trashedProjects.has(projectId) ||
      !canDelete
    ) {
      return false;
    }
    this.trashedProjects.set(projectId, {
      deletedAt: this.now().toISOString(),
      deletedByActorId: actorId,
    });
    return true;
  }

  async getCanvasDocument(projectId: ProjectId, canvasId: CanvasId): Promise<CanvasDocument | null> {
    const document = this.canvasDocuments.get(projectId)?.get(canvasId);
    return document ? structuredClone(document) : null;
  }

  async saveCanvasDocument(input: SaveCanvasDocumentInput): Promise<CanvasDocument> {
    const project = this.projects.get(input.projectId);
    const role = this.projectMemberships.get(input.projectId)?.get(input.actorId);
    if (
      !project ||
      this.trashedProjects.has(input.projectId) ||
      (role !== "admin" && role !== "edit")
    ) {
      throw new CanvasDocumentProjectUnavailableError();
    }
    const projectDocuments = this.canvasDocuments.get(input.projectId) ?? new Map<CanvasId, CanvasDocument>();
    const current = projectDocuments.get(input.canvasId);
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== input.expectedRevision) {
      throw new CanvasDocumentRevisionConflictError(currentRevision);
    }

    const document: CanvasDocument = {
      id: input.canvasId,
      projectId: input.projectId,
      schemaVersion: input.schemaVersion,
      revision: currentRevision + 1,
      content: structuredClone(input.content),
    };
    projectDocuments.set(input.canvasId, document);
    this.canvasDocuments.set(input.projectId, projectDocuments);
    return structuredClone(document);
  }

  private toProjectSummary(project: DemoProjectFixture, actorId: ActorId): ProjectSummary {
    const currentUserRole = this.projectMemberships.get(project.id)?.get(actorId);
    if (!currentUserRole) throw new Error(`Missing project membership for ${project.id}.`);
    return {
      id: project.id,
      workspaceId: project.workspaceId,
      accessKind: project.accessKind,
      currentUserRole,
      name: project.name,
      updatedAt: project.updatedAt,
      coverAssetId: project.coverAssetId,
    };
  }
}
