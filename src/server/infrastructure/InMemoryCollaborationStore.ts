import { randomUUID } from "node:crypto";

import type { ActorId, SessionActor } from "../../domain/identity/session";
import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { Membership, Workspace, WorkspaceId } from "../../domain/workspace/workspace";
import type {
  CollaborationStore,
  CreateProjectInput,
  UpdateProjectInput,
} from "../application/CollaborationStore";
import { createDemoSeed, type DemoAccountFixture, type DemoSeed } from "../demo-fixtures";

export class InMemoryCollaborationStore implements CollaborationStore {
  readonly storageKind = "server-memory" as const;

  private readonly accounts: DemoAccountFixture[];
  private readonly workspaces: Workspace[];
  private readonly memberships: Membership[];
  private readonly projects = new Map<ProjectId, ProjectSummary>();
  private readonly sessions = new Map<string, ActorId>();

  constructor(
    seed: DemoSeed = createDemoSeed(),
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {
    this.accounts = seed.accounts.map((account) => ({ ...account }));
    this.workspaces = seed.workspaces.map((workspace) => ({ ...workspace }));
    this.memberships = seed.memberships.map((membership) => ({ ...membership }));
    seed.projects.forEach((project) => this.projects.set(project.id, { ...project }));
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
    const account = this.accounts.find((candidate) => candidate.actorId === actorId);
    if (!account) return null;

    return {
      id: actorId,
      displayName: account.displayName,
      workspaceIds: this.memberships
        .filter((membership) => membership.actorId === actorId)
        .map((membership) => membership.workspaceId),
    };
  }

  async listWorkspacesForActor(actorId: ActorId): Promise<Workspace[]> {
    const accessibleIds = new Set(
      this.memberships
        .filter((membership) => membership.actorId === actorId)
        .map((membership) => membership.workspaceId),
    );
    return this.workspaces.filter((workspace) => accessibleIds.has(workspace.id)).map((workspace) => ({ ...workspace }));
  }

  async canReadWorkspace(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean> {
    return this.memberships.some(
      (membership) => membership.actorId === actorId && membership.workspaceId === workspaceId,
    );
  }

  async canWriteWorkspaceProjects(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean> {
    return this.memberships.some(
      (membership) =>
        membership.actorId === actorId &&
        membership.workspaceId === workspaceId &&
        (membership.role === "owner" || membership.role === "editor"),
    );
  }

  async getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    const workspace = this.workspaces.find((candidate) => candidate.id === workspaceId);
    return workspace ? { ...workspace } : null;
  }

  async listProjects(workspaceId: WorkspaceId): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .filter((project) => project.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((project) => ({ ...project }));
  }

  async getProject(workspaceId: WorkspaceId, projectId: ProjectId): Promise<ProjectSummary | null> {
    const project = this.projects.get(projectId);
    if (!project || project.workspaceId !== workspaceId) return null;
    return { ...project };
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const project: ProjectSummary = {
      id: `project-${this.createId()}`,
      workspaceId: input.workspaceId,
      name: input.name,
      updatedAt: this.now().toISOString(),
      coverAssetId: input.coverAssetId ?? null,
    };
    this.projects.set(project.id, project);
    return { ...project };
  }

  async updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null> {
    const current = this.projects.get(projectId);
    if (!current || current.workspaceId !== workspaceId) return null;

    const project: ProjectSummary = {
      ...current,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.coverAssetId !== undefined ? { coverAssetId: input.coverAssetId } : {}),
      updatedAt: this.now().toISOString(),
    };
    this.projects.set(project.id, project);
    return { ...project };
  }
}
