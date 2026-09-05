import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, QueryResultRow } from "pg";

import {
  CanvasDocumentProjectUnavailableError,
  CanvasDocumentRevisionConflictError,
  type ReadCanvasDocumentInput,
  type SaveCanvasDocumentInput,
} from "../application/CanvasDocumentStore";
import type { CanvasDocument } from "../../domain/canvas/canvas-document";
import type { ActorId, SessionActor } from "../../domain/identity/session";
import type {
  ProjectAccessKind,
  ProjectId,
  ProjectSummary,
  ProjectUserRole,
} from "../../domain/project/project";
import type {
  MembershipRole,
  OrganizationMember,
  Workspace,
  WorkspaceId,
  WorkspaceKind,
} from "../../domain/workspace/workspace";
import type { CollaborationStore } from "../application/CollaborationStore";
import {
  ProjectWorkspaceUnavailableError,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "../application/ProjectStore";
import { verifyPassword } from "../db/passwords";

interface CredentialRow extends QueryResultRow {
  user_id: string;
  password_hash: string;
}

interface SessionActorRow extends QueryResultRow {
  account: string;
  contact_email: string | null;
  contact_phone: string | null;
  id: string;
  display_name: string;
  workspace_ids: string[];
}

interface WorkspaceRow extends QueryResultRow {
  current_user_role?: MembershipRole;
  id: string;
  kind: WorkspaceKind;
  name: string;
}

interface OrganizationMemberRow extends QueryResultRow {
  user_id: string;
  display_name: string;
  login_identifier: string | null;
  role: MembershipRole;
}

interface ProjectRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  name: string;
  updated_at: Date;
  cover_asset_id: string | null;
  access_kind: ProjectAccessKind;
  current_user_role: ProjectUserRole;
}

interface CanvasDocumentRow extends QueryResultRow {
  project_id: string;
  canvas_id: string;
  schema_version: number;
  revision: number;
  content: unknown;
}

interface CanvasDocumentRevisionRow extends QueryResultRow {
  revision: number;
}

interface ScopedCanvasDocumentRow extends QueryResultRow {
  authorized_project_id: string;
  project_id: string | null;
  canvas_id: string | null;
  schema_version: number | null;
  revision: number | null;
  content: unknown;
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, kind: row.kind, name: row.name, currentUserRole: row.current_user_role };
}

function mapOrganizationMember(row: OrganizationMemberRow): OrganizationMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    loginIdentifier: row.login_identifier,
    role: row.role,
  };
}

function mapProject(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    accessKind: row.access_kind,
    currentUserRole: row.current_user_role,
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
    coverAssetId: row.cover_asset_id,
  };
}

function mapCanvasDocument(row: CanvasDocumentRow): CanvasDocument {
  return {
    id: row.canvas_id,
    projectId: row.project_id,
    schemaVersion: row.schema_version,
    revision: row.revision,
    content: row.content,
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
         users.contact_email,
         users.contact_phone,
         password_identities.identifier AS account,
         COALESCE(
           array_agg(memberships.workspace_id ORDER BY memberships.workspace_id)
             FILTER (WHERE memberships.workspace_id IS NOT NULL),
           ARRAY[]::text[]
         ) AS workspace_ids
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       JOIN password_identities ON password_identities.user_id = users.id
       LEFT JOIN memberships ON memberships.user_id = users.id
       WHERE sessions.token_hash = $1
         AND sessions.revoked_at IS NULL
         AND sessions.expires_at > now()
       GROUP BY
         users.id,
         users.display_name,
         users.contact_email,
         users.contact_phone,
         password_identities.identifier`,
      [this.hashSessionToken(sessionId)],
    );
    const actor = result.rows[0];
    if (!actor) return null;
    return {
      account: actor.account,
      contactEmail: actor.contact_email,
      contactPhone: actor.contact_phone,
      id: actor.id,
      displayName: actor.display_name,
      workspaceIds: actor.workspace_ids,
    };
  }

  async updateAccountContacts(
    actorId: ActorId,
    contacts: { contactEmail: string | null; contactPhone: string | null },
  ): Promise<SessionActor | null> {
    const result = await this.pool.query(
      `UPDATE users
       SET contact_email = $2, contact_phone = $3
       WHERE id = $1
       RETURNING id`,
      [actorId, contacts.contactEmail, contacts.contactPhone],
    );
    if (result.rowCount !== 1) return null;
    const actorResult = await this.pool.query<SessionActorRow>(
      `SELECT
         users.id,
         users.display_name,
         users.contact_email,
         users.contact_phone,
         password_identities.identifier AS account,
         COALESCE(
           array_agg(memberships.workspace_id ORDER BY memberships.workspace_id)
             FILTER (WHERE memberships.workspace_id IS NOT NULL),
           ARRAY[]::text[]
         ) AS workspace_ids
       FROM users
       JOIN password_identities ON password_identities.user_id = users.id
       LEFT JOIN memberships ON memberships.user_id = users.id
       WHERE users.id = $1
       GROUP BY
         users.id,
         users.display_name,
         users.contact_email,
         users.contact_phone,
         password_identities.identifier`,
      [actorId],
    );
    const actor = actorResult.rows[0];
    if (!actor) return null;
    return {
      account: actor.account,
      contactEmail: actor.contact_email,
      contactPhone: actor.contact_phone,
      id: actor.id,
      displayName: actor.display_name,
      workspaceIds: actor.workspace_ids,
    };
  }

  async listWorkspacesForActor(actorId: ActorId): Promise<Workspace[]> {
    const result = await this.pool.query<WorkspaceRow>(
      `SELECT workspaces.id, workspaces.kind, workspaces.name, memberships.role AS current_user_role
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

  async getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
    const result = await this.pool.query<WorkspaceRow>(
      "SELECT id, kind, name FROM workspaces WHERE id = $1",
      [workspaceId],
    );
    return result.rows[0] ? mapWorkspace(result.rows[0]) : null;
  }

  async listOrganizationMembers(workspaceId: WorkspaceId): Promise<OrganizationMember[]> {
    const result = await this.pool.query<OrganizationMemberRow>(
      `SELECT
         membership.user_id,
         users.display_name,
         login_identity.identifier AS login_identifier,
         membership.role
       FROM memberships AS membership
       JOIN users ON users.id = membership.user_id
       LEFT JOIN LATERAL (
         SELECT identifier
         FROM password_identities
         WHERE password_identities.user_id = users.id
         ORDER BY password_identities.created_at, password_identities.id
         LIMIT 1
       ) AS login_identity ON true
       WHERE membership.workspace_id = $1
       ORDER BY
         CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
         membership.user_id`,
      [workspaceId],
    );
    return result.rows.map(mapOrganizationMember);
  }

  async listProjects(actorId: ActorId, workspaceId: WorkspaceId): Promise<ProjectSummary[]> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT
         project.id,
         project.workspace_id,
         project.name,
         project.updated_at,
         project.cover_asset_id,
         project.access_kind,
         project_membership.role AS current_user_role
       FROM projects AS project
       JOIN project_memberships AS project_membership
         ON project_membership.project_id = project.id
        AND project_membership.user_id = $1
       WHERE project.workspace_id = $2
         AND project.deleted_at IS NULL
         AND (
           (project.access_kind = 'private' AND project.created_by_user_id = $1)
           OR project.access_kind = 'collaborative'
         )
       ORDER BY project.updated_at DESC, project.id`,
      [actorId, workspaceId],
    );
    return result.rows.map(mapProject);
  }

  async getProject(
    actorId: ActorId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
  ): Promise<ProjectSummary | null> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT
         project.id,
         project.workspace_id,
         project.name,
         project.updated_at,
         project.cover_asset_id,
         project.access_kind,
         project_membership.role AS current_user_role
       FROM projects AS project
       JOIN project_memberships AS project_membership
         ON project_membership.project_id = project.id
        AND project_membership.user_id = $1
       WHERE project.workspace_id = $2
         AND project.id = $3
         AND project.deleted_at IS NULL
         AND (
           (project.access_kind = 'private' AND project.created_by_user_id = $1)
           OR project.access_kind = 'collaborative'
         )`,
      [actorId, workspaceId, projectId],
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async getProjectById(actorId: ActorId, projectId: ProjectId): Promise<ProjectSummary | null> {
    const result = await this.pool.query<ProjectRow>(
      `SELECT
         project.id,
         project.workspace_id,
         project.name,
         project.updated_at,
         project.cover_asset_id,
         project.access_kind,
         project_membership.role AS current_user_role
       FROM projects AS project
       JOIN project_memberships AS project_membership
         ON project_membership.project_id = project.id
        AND project_membership.user_id = $1
       WHERE project.id = $2
         AND project.deleted_at IS NULL
         AND (
           (project.access_kind = 'private' AND project.created_by_user_id = $1)
           OR project.access_kind = 'collaborative'
         )`,
      [actorId, projectId],
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const membership = await client.query(
        `SELECT 1
         FROM workspaces AS workspace
         JOIN memberships AS membership
           ON membership.workspace_id = workspace.id
          AND membership.user_id = $2
         WHERE workspace.id = $1
         FOR KEY SHARE OF workspace, membership`,
        [input.workspaceId, input.createdByActorId],
      );
      if (membership.rowCount !== 1) {
        const workspace = await client.query("SELECT 1 FROM workspaces WHERE id = $1", [input.workspaceId]);
        throw new ProjectWorkspaceUnavailableError(workspace.rowCount === 1 ? "forbidden" : "not_found");
      }
      const result = await client.query<ProjectRow>(
        `INSERT INTO projects (
           id,
           workspace_id,
           created_by_user_id,
           updated_by_user_id,
           name,
           created_at,
           updated_at,
           cover_asset_id,
           access_kind
         )
         VALUES ($1, $2, $3, $3, $4, $5, $5, $6, 'private')
         RETURNING
           id,
           workspace_id,
           name,
           updated_at,
           cover_asset_id,
           access_kind,
           'admin'::text AS current_user_role`,
        [
          `project-${this.createId()}`,
          input.workspaceId,
          input.createdByActorId,
          input.name,
          this.now().toISOString(),
          input.coverAssetId ?? null,
        ],
      );
      await client.query(
        `INSERT INTO project_memberships (project_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [result.rows[0].id, input.createdByActorId],
      );
      await client.query("COMMIT");
      return mapProject(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null> {
    const result = await this.pool.query<ProjectRow>(
      `UPDATE projects AS project
       SET
         name = CASE WHEN $3::boolean THEN $4::text ELSE project.name END,
         cover_asset_id = CASE WHEN $5::boolean THEN $6::text ELSE project.cover_asset_id END,
         updated_by_user_id = $7,
         updated_at = $8
       FROM project_memberships AS project_membership
       WHERE project.workspace_id = $1
         AND project.id = $2
         AND project.deleted_at IS NULL
         AND project_membership.project_id = project.id
         AND project_membership.user_id = $7
         AND project_membership.role IN ('admin', 'edit')
         AND (
           (project.access_kind = 'private' AND project.created_by_user_id = $7)
           OR project.access_kind = 'collaborative'
         )
       RETURNING
         project.id,
         project.workspace_id,
         project.name,
         project.updated_at,
         project.cover_asset_id,
         project.access_kind,
         project_membership.role AS current_user_role`,
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

  async moveProjectToTrash(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    actorId: ActorId,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE projects AS project
       SET deleted_at = $4, deleted_by_user_id = $3
       WHERE project.workspace_id = $1
         AND project.id = $2
         AND project.deleted_at IS NULL
         AND (
           (project.access_kind = 'private' AND project.created_by_user_id = $3)
           OR (
             project.access_kind = 'collaborative'
             AND EXISTS (
               SELECT 1
               FROM project_memberships AS project_membership
               WHERE project_membership.project_id = project.id
                 AND project_membership.user_id = $3
                 AND project_membership.role = 'admin'
             )
           )
         )`,
      [workspaceId, projectId, actorId, this.now().toISOString()],
    );
    return result.rowCount === 1;
  }

  async getCanvasDocument(input: ReadCanvasDocumentInput): Promise<CanvasDocument | null> {
    const result = await this.pool.query<ScopedCanvasDocumentRow>(
      `SELECT
         project.id AS authorized_project_id,
         document.project_id,
         document.canvas_id,
         document.schema_version,
         document.revision,
         document.content
       FROM projects AS project
       JOIN project_memberships AS project_membership
         ON project_membership.project_id = project.id
        AND project_membership.user_id = $1
       LEFT JOIN canvas_documents AS document
         ON document.project_id = project.id
        AND document.canvas_id = $3
       WHERE project.id = $2
         AND project.deleted_at IS NULL
         AND (
           (project.access_kind = 'private' AND project.created_by_user_id = $1)
           OR project.access_kind = 'collaborative'
         )`,
      [input.actorId, input.projectId, input.canvasId],
    );
    const row = result.rows[0];
    if (!row) throw new CanvasDocumentProjectUnavailableError();
    if (
      row.project_id === null ||
      row.canvas_id === null ||
      row.schema_version === null ||
      row.revision === null
    ) return null;
    return mapCanvasDocument({
      project_id: row.project_id,
      canvas_id: row.canvas_id,
      schema_version: row.schema_version,
      revision: row.revision,
      content: row.content,
    });
  }

  async saveCanvasDocument(input: SaveCanvasDocumentInput): Promise<CanvasDocument> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const authorization = await client.query(
        `SELECT 1
         FROM projects AS project
         JOIN project_memberships AS project_membership
           ON project_membership.project_id = project.id
          AND project_membership.user_id = $2
         WHERE project.id = $1
           AND project.deleted_at IS NULL
           AND project_membership.role IN ('admin', 'edit')
           AND (
             (project.access_kind = 'private' AND project.created_by_user_id = $2)
             OR project.access_kind = 'collaborative'
           )
         FOR UPDATE OF project`,
        [input.projectId, input.actorId],
      );
      if (authorization.rowCount !== 1) {
        await client.query("ROLLBACK");
        throw new CanvasDocumentProjectUnavailableError();
      }

      const savedAt = this.now().toISOString();
      const result = await client.query<CanvasDocumentRow>(
        `INSERT INTO canvas_documents (
           project_id,
           canvas_id,
           schema_version,
           revision,
           content,
           created_by_user_id,
           updated_by_user_id,
           created_at,
           updated_at
         )
         SELECT $1, $2, $3, 1, $4::jsonb, $5, $5, $7, $7
         WHERE $6 = 0
            OR EXISTS (
              SELECT 1
              FROM canvas_documents AS existing
              WHERE existing.project_id = $1 AND existing.canvas_id = $2
            )
         ON CONFLICT (project_id, canvas_id) DO UPDATE
         SET
           schema_version = EXCLUDED.schema_version,
           revision = canvas_documents.revision + 1,
           content = EXCLUDED.content,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = EXCLUDED.updated_at
         WHERE canvas_documents.revision = $6
         RETURNING project_id, canvas_id, schema_version, revision, content`,
        [
          input.projectId,
          input.canvasId,
          input.schemaVersion,
          JSON.stringify(input.content),
          input.actorId,
          input.expectedRevision,
          savedAt,
        ],
      );
      if (result.rows[0]) {
        await client.query("COMMIT");
        return mapCanvasDocument(result.rows[0]);
      }

      const current = await client.query<CanvasDocumentRevisionRow>(
        `SELECT revision
         FROM canvas_documents
         WHERE project_id = $1 AND canvas_id = $2`,
        [input.projectId, input.canvasId],
      );
      await client.query("ROLLBACK");
      throw new CanvasDocumentRevisionConflictError(current.rows[0]?.revision ?? 0);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private hashSessionToken(token: string): Buffer {
    return createHash("sha256").update(token).digest();
  }
}
