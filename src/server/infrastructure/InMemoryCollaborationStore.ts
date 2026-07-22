import { randomUUID } from "node:crypto";

import type { ActorId, SessionActor } from "../../domain/identity/session";
import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { Membership, Workspace, WorkspaceId } from "../../domain/workspace/workspace";
import { createDemoSeed, type DemoAccountFixture, type DemoSeed } from "../demo-fixtures";

export interface CreateProjectInput {
  workspaceId: WorkspaceId;
  name: string;
  coverAssetId?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  coverAssetId?: string | null;
}

export class InMemoryCollaborationStore {
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

  authenticate(account: string, password: string): ActorId | null {
    const normalizedAccount = account.trim().toLocaleLowerCase("en-US");
    const match = this.accounts.find(
      (candidate) =>
        candidate.account.toLocaleLowerCase("en-US") === normalizedAccount && candidate.password === password,
    );
    return match?.actorId ?? null;
  }

  createSession(actorId: ActorId): string {
    const sessionId = this.createId();
    this.sessions.set(sessionId, actorId);
    return sessionId;
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getSessionActor(sessionId: string | undefined): SessionActor | null {
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

  listWorkspacesForActor(actorId: ActorId): Workspace[] {
    const accessibleIds = new Set(
      this.memberships
        .filter((membership) => membership.actorId === actorId)
        .map((membership) => membership.workspaceId),
    );
    return this.workspaces.filter((workspace) => accessibleIds.has(workspace.id)).map((workspace) => ({ ...workspace }));
  }

  hasWorkspaceAccess(actorId: ActorId, workspaceId: WorkspaceId): boolean {
    return this.memberships.some(
      (membership) => membership.actorId === actorId && membership.workspaceId === workspaceId,
    );
  }

  getWorkspace(workspaceId: WorkspaceId): Workspace | null {
    const workspace = this.workspaces.find((candidate) => candidate.id === workspaceId);
    return workspace ? { ...workspace } : null;
  }

  listProjects(workspaceId: WorkspaceId): ProjectSummary[] {
    return [...this.projects.values()]
      .filter((project) => project.workspaceId === workspaceId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((project) => ({ ...project }));
  }

  getProject(workspaceId: WorkspaceId, projectId: ProjectId): ProjectSummary | null {
    const project = this.projects.get(projectId);
    if (!project || project.workspaceId !== workspaceId) return null;
    return { ...project };
  }

  createProject(input: CreateProjectInput): ProjectSummary {
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

  updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): ProjectSummary | null {
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
