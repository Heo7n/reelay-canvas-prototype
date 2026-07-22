import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, QueryResultRow } from "pg";

import type { ActorId, SessionActor } from "../../domain/identity/session";
import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { Workspace, WorkspaceId, WorkspaceKind } from "../../domain/workspace/workspace";
import type {
  CollaborationStore,
  CreateProjectInput,
  UpdateProjectInput,
} from "../application/CollaborationStore";
import { verifyPassword } from "../db/passwords";

interface CredentialRow extends QueryResultRow {
  user_id: string;
  password_hash: string;
}

interface SessionActorRow extends QueryResultRow {
  id: string;
  display_name: string;
  workspace_ids: string[];
}

interface WorkspaceRow extends QueryResultRow {
  id: string;
  kind: WorkspaceKind;
  name: string;
}

interface ProjectRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  name: string;
  updated_at: Date;
  cover_asset_id: string | null;
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, kind: row.kind, name: row.name };
}

function mapProject(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
    coverAssetId: row.cover_asset_id,
  };
}

export class PostgresCollaborationStore implements CollaborationStore {
  readonly storageKind = "postgresql" as const;
  private closePromise: Promise<void> | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async close(): Promise<void> {
    this.closePromise ??= this.pool.end();
    await this.closePromise;
  }

  async authenticate(account: string, password: string): Promise<ActorId | null> {
    const result = await this.pool.query<CredentialRow>(
      `SELECT user_id, password_hash
       FROM password_identities
       WHERE normalized_identifier = $1
       LIMIT 1`,
      [account.trim().toLocaleLowerCase("en-US")],
    );
    const credential = result.rows[0];
    if (!credential || !(await verifyPassword(password, credential.password_hash))) return null;
    return credential.user_id;
  }

  async createSession(actorId: ActorId): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await this.pool.query(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
      [this.hashSessionToken(token), actorId, createdAt.toISOString(), expiresAt.toISOString()],
    );
    return token;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1", [
      this.hashSessionToken(sessionId),
    ]);
  }

  async getSessionActor(sessionId: string | undefined): Promise<SessionActor | null> {
    if (!sessionId) return null;
    const result = await this.pool.query<SessionActorRow>(
      `SELECT
         users.id,
         users.display_name,
         COALESCE(
           array_agg(memberships.workspace_id ORDER BY memberships.workspace_id)
             FILTER (WHERE memberships.workspace_id IS NOT NULL),
           ARRAY[]::text[]
         ) AS workspace_ids
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       LEFT JOIN memberships ON memberships.user_id = users.id
       WHERE sessions.token_hash = $1
         AND sessions.revoked_at IS NULL
         AND sessions.expires_at > now()
       GROUP BY users.id, users.display_name`,
      [this.hashSessionToken(sessionId)],
    );
    const actor = result.rows[0];
    if (!actor) return null;
    return { id: actor.id, displayName: actor.display_name, workspaceIds: actor.workspace_ids };
  }

  async listWorkspacesForActor(actorId: ActorId): Promise<Workspace[]> {
    const result = await this.pool.query<WorkspaceRow>(
      `SELECT workspaces.id, workspaces.kind, workspaces.name
       FROM workspaces
       JOIN memberships ON memberships.workspace_id = workspaces.id
       WHERE memberships.user_id = $1
       ORDER BY CASE workspaces.kind WHEN 'personal' THEN 0 ELSE 1 END, workspaces.name, workspaces.id`,
      [actorId],
    );
    return result.rows.map(mapWorkspace);
  }

  async canReadWorkspace(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM memberships WHERE user_id = $1 AND workspace_id = $2",
      [actorId, workspaceId],
    );
    return result.rowCount === 1;
  }

  async canWriteWorkspaceProjects(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
       FROM memberships
       WHERE user_id = $1 AND workspace_id = $2 AND role IN ('owner', 'editor')`,
      [actorId, workspaceId],
    );
    return result.rowCount === 1;
  }

  async getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    const result = await this.pool.query<WorkspaceRow>(
      "SELECT id, kind, name FROM workspaces WHERE id = $1",
      [workspaceId],
    );
    return result.rows[0] ? mapWorkspace(result.rows[0]) : null;
  }

  async listProjects(workspaceId: WorkspaceId): Promise<ProjectSummary[]> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT id, workspace_id, name, updated_at, cover_asset_id
       FROM projects
       WHERE workspace_id = $1
       ORDER BY updated_at DESC, id`,
      [workspaceId],
    );
    return result.rows.map(mapProject);
  }

  async getProject(workspaceId: WorkspaceId, projectId: ProjectId): Promise<ProjectSummary | null> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT id, workspace_id, name, updated_at, cover_asset_id
       FROM projects
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, projectId],
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const result = await this.pool.query<ProjectRow>(
      `INSERT INTO projects (
         id, workspace_id, created_by_user_id, updated_by_user_id, name, created_at, updated_at, cover_asset_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       RETURNING id, workspace_id, name, updated_at, cover_asset_id`,
      [
        `project-${this.createId()}`,
        input.workspaceId,
        input.createdByActorId,
        input.createdByActorId,
        input.name,
        this.now().toISOString(),
        input.coverAssetId ?? null,
      ],
    );
    return mapProject(result.rows[0]);
  }

  async updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null> {
    const result = await this.pool.query<ProjectRow>(
      `UPDATE projects
       SET
         name = CASE WHEN $3::boolean THEN $4::text ELSE name END,
         cover_asset_id = CASE WHEN $5::boolean THEN $6::text ELSE cover_asset_id END,
         updated_by_user_id = $7,
         updated_at = $8
       WHERE workspace_id = $1 AND id = $2
       RETURNING id, workspace_id, name, updated_at, cover_asset_id`,
      [
        workspaceId,
        projectId,
        input.name !== undefined,
        input.name ?? null,
        input.coverAssetId !== undefined,
        input.coverAssetId ?? null,
        input.updatedByActorId,
        this.now().toISOString(),
      ],
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  private hashSessionToken(token: string): Buffer {
    return createHash("sha256").update(token).digest();
  }
}
