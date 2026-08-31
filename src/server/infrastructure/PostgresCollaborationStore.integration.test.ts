import { randomBytes } from "node:crypto";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { canonicalizeLegacyCanvasDocumentV1 } from "../../contracts/canvas-document-v1";
import { buildServer } from "../app";
import { CanvasDocumentProjectUnavailableError } from "../application/CanvasDocumentStore";
import { DEFAULT_LOCAL_DATABASE_URL } from "../db/config";
import { runMigrations } from "../db/migrate";
import { seedDemoDatabase } from "../db/seed";
import { createDemoSeed, DEMO_PASSWORD } from "../demo-fixtures";
import { PostgresCollaborationStore } from "./PostgresCollaborationStore";

const databaseName = `reelay_test_${process.pid}_${randomBytes(4).toString("hex")}`;
const configuredAdminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const adminUrl = new URL(configuredAdminUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;

let adminPool: Pool;

function createPool(): Pool {
  return new Pool({ connectionString: databaseUrl.toString(), max: 4, application_name: "reelay-integration-test" });
}

function getCookie(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected session cookie.");
  return value.split(";", 1)[0];
}

function canvasContent(
  nodeIds: string[] = [],
  viewport: { tx: number; ty: number; scale: number } = { tx: 0, ty: 0, scale: 1 },
) {
  const content = canonicalizeLegacyCanvasDocumentV1({
    kind: "reelay-legacy-canvas",
    version: 1,
    activeCanvasId: "canvas-main",
    canvases: [{
      id: "canvas-main",
      name: "Main canvas",
      nodes: nodeIds.map((id) => ({ id, kind: "generator" })),
      viewport,
    }],
  });
  if (!content) throw new Error("Expected a canonical CanvasDocument v1 fixture.");
  return content;
}

async function login(app: FastifyInstance, account: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/demo/session",
    payload: { account, password: DEMO_PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return getCookie(response);
}

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1, application_name: "reelay-test-admin" });
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Unsafe test database name.");
  await adminPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END
    $$
  `);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);

  const setupPool = createPool();
  try {
    await expect(runMigrations(setupPool)).resolves.toEqual([
      "0001_collaboration.sql",
      "0002_password_identities.sql",
      "0003_project_access.sql",
      "0004_canvas_documents.sql",
      "0005_rename_organization.sql",
      "0006_account_roles.sql",
      "0007_project_soft_delete.sql",
      "0008_account_contacts.sql",
      "0009_server_only_data_access.sql",
      "0010_workspace_media_assets.sql",
      "0011_asset_membership_lifecycle.sql",
    ]);
    await expect(runMigrations(setupPool)).resolves.toEqual([]);
    await seedDemoDatabase(setupPool);
    await seedDemoDatabase(setupPool);
  } finally {
    await setupPool.end();
  }
});

afterAll(async () => {
  if (!adminPool) return;
  await adminPool.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await adminPool.end();
});

describe("PostgreSQL collaboration persistence", () => {
  it("enforces workspace and canvas actor scope when adapters are called directly", async () => {
    const setupPool = createPool();
    try {
      await setupPool.query(
        "INSERT INTO workspaces (id, kind, name) VALUES ($1, 'organization', $2)",
        ["workspace-outside-actor-scope", "未加入的组织"],
      );
    } finally {
      await setupPool.end();
    }

    const store = new PostgresCollaborationStore(createPool());
    try {
      await expect(store.createProject({
        workspaceId: "workspace-outside-actor-scope",
        createdByActorId: "actor-tianmaochao",
        name: "不应创建",
      })).rejects.toMatchObject({
        name: "ProjectWorkspaceUnavailableError",
        reason: "forbidden",
      });

      const project = await store.createProject({
        workspaceId: "workspace-organization-reelay",
        createdByActorId: "actor-tianmaochao",
        name: "adapter scope test",
      });
      await store.saveCanvasDocument({
        actorId: "actor-tianmaochao",
        projectId: project.id,
        canvasId: "main",
        schemaVersion: 1,
        expectedRevision: 0,
        content: { nodes: [{ id: "authorized" }] },
      });

      await expect(store.getCanvasDocument({
        actorId: "actor-tianmaochao",
        projectId: project.id,
        canvasId: "main",
      })).resolves.toEqual(expect.objectContaining({ revision: 1 }));
      await expect(store.getCanvasDocument({
        actorId: "actor-chenxi",
        projectId: project.id,
        canvasId: "main",
      })).rejects.toBeInstanceOf(CanvasDocumentProjectUnavailableError);

      await expect(store.moveProjectToTrash(
        "workspace-organization-reelay",
        project.id,
        "actor-tianmaochao",
      )).resolves.toBe(true);
      await expect(store.getCanvasDocument({
        actorId: "actor-tianmaochao",
        projectId: project.id,
        canvasId: "main",
      })).rejects.toBeInstanceOf(CanvasDocumentProjectUnavailableError);
    } finally {
      await store.close();
    }
  });

  it("reads organization members from memberships, users, and password identities", async () => {
    const app = await buildServer({ store: new PostgresCollaborationStore(createPool()) });

    try {
      const ownerCookie = await login(app, "creator@reelay.test");
      const response = await app.inject({
        method: "GET",
        url: "/api/workspaces/workspace-organization-reelay/members",
        headers: { cookie: ownerCookie },
      });

      expect(response.statusCode).toBe(200);
      const members = response.json().members;
      expect(members).toHaveLength(10);
      expect(members.map((member: { role: string }) => member.role)).toEqual([
        "owner",
        "admin",
        "admin",
        "member",
        "member",
        "member",
        "member",
        "member",
        "member",
        "member",
      ]);
      expect(members).toEqual(expect.arrayContaining([
        {
          userId: "actor-tianmaochao",
          displayName: "Hoo",
          loginIdentifier: "creator@reelay.test",
          role: "owner",
        },
        {
          userId: "actor-linjing",
          displayName: "林静",
          loginIdentifier: "linjing@reelay.test",
          role: "admin",
        },
        {
          userId: "actor-liran",
          displayName: "李然",
          loginIdentifier: "liran@reelay.test",
          role: "admin",
        },
        expect.objectContaining({ userId: "actor-chenxi", role: "member" }),
        expect.objectContaining({ userId: "actor-shenan", role: "member" }),
        expect.objectContaining({ userId: "actor-suhe", role: "member" }),
        expect.objectContaining({ userId: "actor-wangyin", role: "member" }),
        expect.objectContaining({ userId: "actor-xuzhe", role: "member" }),
        expect.objectContaining({ userId: "actor-yelan", role: "member" }),
        expect.objectContaining({ userId: "actor-zhouyu", role: "member" }),
      ]));
    } finally {
      await app.close();
    }
  });

  it("reconciles only fixed demo project memberships to the fixture", async () => {
    const pool = createPool();
    const seed = createDemoSeed();
    const externalActorId = "actor-seed-boundary-external";
    const userProjectId = "project-seed-boundary-user-created";

    try {
      await pool.query(
        `UPDATE project_memberships
         SET role = 'admin'
         WHERE project_id = 'project-scifi-trailer'
           AND user_id = 'actor-linjing'`,
      );
      await pool.query(
        `INSERT INTO project_memberships (project_id, user_id, role)
         VALUES ('project-brand-story', 'actor-linjing', 'edit')`,
      );

      await pool.query(
        `INSERT INTO users (id, display_name)
         VALUES ($1, '范围外成员')`,
        [externalActorId],
      );
      await pool.query(
        `INSERT INTO memberships (workspace_id, user_id, role)
         VALUES ('workspace-organization-reelay', $1, 'member')`,
        [externalActorId],
      );
      await pool.query(
        `INSERT INTO project_memberships (project_id, user_id, role)
         VALUES ('project-brand-story', $1, 'view')`,
        [externalActorId],
      );
      await pool.query(
        `INSERT INTO projects (
           id,
           workspace_id,
           created_by_user_id,
           updated_by_user_id,
           name,
           created_at,
           updated_at,
           access_kind
         )
         VALUES (
           $1,
           'workspace-organization-reelay',
           'actor-tianmaochao',
           'actor-tianmaochao',
           'Seed 范围外用户项目',
           now(),
           now(),
           'collaborative'
         )`,
        [userProjectId],
      );
      await pool.query(
        `INSERT INTO project_memberships (project_id, user_id, role)
         VALUES ($1, 'actor-linjing', 'view')`,
        [userProjectId],
      );

      await seedDemoDatabase(pool);

      const demoProjectIds = seed.projects.map((project) => project.id);
      const demoActorIds = seed.accounts.map((account) => account.actorId);
      const expectedMemberships = seed.projectMemberships
        .map(({ projectId, actorId, role }) => ({ project_id: projectId, user_id: actorId, role }))
        .sort((left, right) =>
          `${left.project_id}:${left.user_id}`.localeCompare(`${right.project_id}:${right.user_id}`),
        );
      const reconciled = await pool.query<{ project_id: string; user_id: string; role: string }>(
        `SELECT project_id, user_id, role
         FROM project_memberships
         WHERE project_id = ANY($1::text[])
           AND user_id = ANY($2::text[])
         ORDER BY project_id, user_id`,
        [demoProjectIds, demoActorIds],
      );
      expect(reconciled.rows).toEqual(expectedMemberships);

      const externalMembership = await pool.query(
        `SELECT role
         FROM project_memberships
         WHERE project_id = 'project-brand-story'
           AND user_id = $1`,
        [externalActorId],
      );
      expect(externalMembership.rows).toEqual([{ role: "view" }]);

      const userProjectMembership = await pool.query(
        `SELECT role
         FROM project_memberships
         WHERE project_id = $1
           AND user_id = 'actor-linjing'`,
        [userProjectId],
      );
      expect(userProjectMembership.rows).toEqual([{ role: "view" }]);
    } finally {
      await pool.query("DELETE FROM projects WHERE id = $1", [userProjectId]);
      await pool.query(
        `DELETE FROM project_memberships
         WHERE project_id = 'project-brand-story'
           AND user_id = $1`,
        [externalActorId],
      );
      await pool.query(
        `DELETE FROM memberships
         WHERE workspace_id = 'workspace-organization-reelay'
           AND user_id = $1`,
        [externalActorId],
      );
      await pool.query("DELETE FROM users WHERE id = $1", [externalActorId]);
      await pool.end();
    }
  });

  it("keeps a session and private project changes across server restarts", async () => {
    const appA = await buildServer({ store: new PostgresCollaborationStore(createPool()) });
    let appB: FastifyInstance | null = null;

    try {
      const health = await appA.inject({ method: "GET", url: "/api/health" });
      expect(health.json()).toEqual({ status: "ok", storage: "postgresql" });

      const ownerCookie = await login(appA, "creator@reelay.test");
      const created = await appA.inject({
        method: "POST",
        url: "/api/workspaces/workspace-organization-reelay/projects",
        headers: { cookie: ownerCookie },
        payload: { name: "跨重启持久化项目" },
      });
      expect(created.statusCode).toBe(201);
      const projectId = created.json().project.id as string;

      await appA.close();
      appB = await buildServer({ store: new PostgresCollaborationStore(createPool()) });

      const restoredSession = await appB.inject({
        method: "GET",
        url: "/api/session",
        headers: { cookie: ownerCookie },
      });
      expect(restoredSession.json().actor.id).toBe("actor-tianmaochao");

      const editorCookie = await login(appB, "linjing@reelay.test");
      const editorList = await appB.inject({
        method: "GET",
        url: "/api/workspaces/workspace-organization-reelay/projects",
        headers: { cookie: editorCookie },
      });
      expect(editorList.json().projects).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: projectId })]),
      );

      const renamed = await appB.inject({
        method: "PATCH",
        url: `/api/workspaces/workspace-organization-reelay/projects/${projectId}`,
        headers: { cookie: ownerCookie },
        payload: { name: "私人项目修改仍持久" },
      });
      expect(renamed.statusCode).toBe(200);

      const auditPool = createPool();
      try {
        const audit = await auditPool.query(
          `SELECT created_by_user_id, updated_by_user_id
           FROM projects
           WHERE id = $1`,
          [projectId],
        );
        expect(audit.rows[0]).toEqual({
          created_by_user_id: "actor-tianmaochao",
          updated_by_user_id: "actor-tianmaochao",
        });
        await seedDemoDatabase(auditPool);
        const preserved = await auditPool.query("SELECT name FROM projects WHERE id = $1", [projectId]);
        expect(preserved.rows[0].name).toBe("私人项目修改仍持久");
      } finally {
        await auditPool.end();
      }
    } finally {
      if (appB) await appB.close();
      else await appA.close();
    }
  });

  it("persists explicit collaborative project roles", async () => {
    const app = await buildServer({ store: new PostgresCollaborationStore(createPool()) });
    try {
      const editorCookie = await login(app, "linjing@reelay.test");
      const viewerCookie = await login(app, "zhouyu@reelay.test");
      const outsiderCookie = await login(app, "chenxi@reelay.test");
      const projectUrl = "/api/workspaces/workspace-organization-reelay/projects/project-scifi-trailer";

      const edited = await app.inject({
        method: "PATCH",
        url: projectUrl,
        headers: { cookie: editorCookie },
        payload: { name: "数据库协作权限演示" },
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json().project.currentUserRole).toBe("edit");

      const viewAttempt = await app.inject({
        method: "PATCH",
        url: projectUrl,
        headers: { cookie: viewerCookie },
        payload: { name: "只读成员不能修改" },
      });
      expect(viewAttempt.statusCode).toBe(403);

      const hidden = await app.inject({ method: "GET", url: projectUrl, headers: { cookie: outsiderCookie } });
      expect(hidden.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("allows only a collaborative project admin to move that project to trash", async () => {
    const app = await buildServer({ store: new PostgresCollaborationStore(createPool()) });
    const projectUrl = "/api/workspaces/workspace-organization-reelay/projects/project-education-video";
    try {
      const editorCookie = await login(app, "suhe@reelay.test");
      const adminCookie = await login(app, "linjing@reelay.test");

      const editorAttempt = await app.inject({
        method: "DELETE",
        url: projectUrl,
        headers: { cookie: editorCookie },
      });
      expect(editorAttempt.statusCode).toBe(403);
      expect(editorAttempt.json().error.code).toBe("project_forbidden");

      const removed = await app.inject({
        method: "DELETE",
        url: projectUrl,
        headers: { cookie: adminCookie },
      });
      expect(removed.statusCode).toBe(204);

      const auditPool = createPool();
      try {
        const audit = await auditPool.query(
          `SELECT access_kind, deleted_at IS NOT NULL AS deleted, deleted_by_user_id
           FROM projects
           WHERE id = 'project-education-video'`,
        );
        expect(audit.rows[0]).toEqual({
          access_kind: "collaborative",
          deleted: true,
          deleted_by_user_id: "actor-linjing",
        });
      } finally {
        await auditPool.end();
      }
    } finally {
      await app.close();
    }
  });

  it("persists revisioned canvas documents and enforces project roles across restarts", async () => {
    const appA = await buildServer({ store: new PostgresCollaborationStore(createPool()) });
    let appB: FastifyInstance | null = null;
    const url = "/api/projects/project-scifi-trailer/canvases/persistence-test/document";

    try {
      const adminCookie = await login(appA, "creator@reelay.test");
      const created = await appA.inject({
        method: "PUT",
        url,
        headers: { cookie: adminCookie },
        payload: {
          schemaVersion: 1,
          expectedRevision: 0,
          content: canvasContent(["persisted"], { tx: 3, ty: 5, scale: 1.25 }),
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().document.revision).toBe(1);

      await appA.close();
      appB = await buildServer({ store: new PostgresCollaborationStore(createPool()) });

      const viewCookie = await login(appB, "zhouyu@reelay.test");
      const restored = await appB.inject({ method: "GET", url, headers: { cookie: viewCookie } });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().document).toEqual(
        expect.objectContaining({
          projectId: "project-scifi-trailer",
          id: "persistence-test",
          schemaVersion: 1,
          revision: 1,
          content: canvasContent(["persisted"], { tx: 3, ty: 5, scale: 1.25 }),
        }),
      );

      const viewWrite = await appB.inject({
        method: "PUT",
        url,
        headers: { cookie: viewCookie },
        payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent() },
      });
      expect(viewWrite.statusCode).toBe(403);

      const editorCookie = await login(appB, "linjing@reelay.test");
      const edited = await appB.inject({
        method: "PUT",
        url,
        headers: { cookie: editorCookie },
        payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent(["edited"]) },
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json().document).toEqual(
        expect.objectContaining({ schemaVersion: 1, revision: 2, content: canvasContent(["edited"]) }),
      );

      const stale = await appB.inject({
        method: "PUT",
        url,
        headers: { cookie: editorCookie },
        payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent() },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.currentRevision).toBe(2);

      const outsiderCookie = await login(appB, "chenxi@reelay.test");
      const hidden = await appB.inject({ method: "GET", url, headers: { cookie: outsiderCookie } });
      expect(hidden.statusCode).toBe(404);

      const auditPool = createPool();
      try {
        const row = await auditPool.query(
          `SELECT schema_version, revision, content, created_by_user_id, updated_by_user_id
           FROM canvas_documents
           WHERE project_id = $1 AND canvas_id = $2`,
          ["project-scifi-trailer", "persistence-test"],
        );
        expect(row.rows[0]).toEqual({
          schema_version: 1,
          revision: 2,
          content: canvasContent(["edited"]),
          created_by_user_id: "actor-tianmaochao",
          updated_by_user_id: "actor-linjing",
        });
      } finally {
        await auditPool.end();
      }
    } finally {
      if (appB) await appB.close();
      else await appA.close();
    }
  });

  it("persists account contacts and recoverable project deletion across restarts", async () => {
    const appA = await buildServer({ store: new PostgresCollaborationStore(createPool()) });
    let appB: FastifyInstance | null = null;

    try {
      const ownerCookie = await login(appA, "creator@reelay.test");
      const contacts = await appA.inject({
        method: "PATCH",
        url: "/api/account",
        headers: { cookie: ownerCookie },
        payload: { contactEmail: "owner@example.com", contactPhone: "+86 138 0000 0000" },
      });
      expect(contacts.statusCode).toBe(200);

      const created = await appA.inject({
        method: "POST",
        url: "/api/workspaces/workspace-organization-reelay/projects",
        headers: { cookie: ownerCookie },
        payload: { name: "可恢复删除项目" },
      });
      expect(created.statusCode).toBe(201);
      const projectId = created.json().project.id as string;
      const canvasUrl = `/api/projects/${projectId}/canvases/main/document`;
      const canvas = await appA.inject({
        method: "PUT",
        url: canvasUrl,
        headers: { cookie: ownerCookie },
        payload: { schemaVersion: 1, expectedRevision: 0, content: canvasContent(["kept"]) },
      });
      expect(canvas.statusCode).toBe(201);

      const removed = await appA.inject({
        method: "DELETE",
        url: `/api/workspaces/workspace-organization-reelay/projects/${projectId}`,
        headers: { cookie: ownerCookie },
      });
      expect(removed.statusCode).toBe(204);

      await appA.close();
      appB = await buildServer({ store: new PostgresCollaborationStore(createPool()) });

      const restoredSession = await appB.inject({
        method: "GET",
        url: "/api/session",
        headers: { cookie: ownerCookie },
      });
      expect(restoredSession.json().actor).toEqual(
        expect.objectContaining({
          contactEmail: "owner@example.com",
          contactPhone: "+86 138 0000 0000",
        }),
      );
      const hiddenProject = await appB.inject({
        method: "GET",
        url: `/api/workspaces/workspace-organization-reelay/projects/${projectId}`,
        headers: { cookie: ownerCookie },
      });
      expect(hiddenProject.statusCode).toBe(404);
      const hiddenCanvas = await appB.inject({ method: "GET", url: canvasUrl, headers: { cookie: ownerCookie } });
      expect(hiddenCanvas.statusCode).toBe(404);

      const auditPool = createPool();
      try {
        const projectAudit = await auditPool.query(
          `SELECT deleted_at IS NOT NULL AS deleted, deleted_by_user_id
           FROM projects
           WHERE id = $1`,
          [projectId],
        );
        expect(projectAudit.rows[0]).toEqual({
          deleted: true,
          deleted_by_user_id: "actor-tianmaochao",
        });
        const membershipAudit = await auditPool.query(
          "SELECT role FROM project_memberships WHERE project_id = $1 AND user_id = $2",
          [projectId, "actor-tianmaochao"],
        );
        expect(membershipAudit.rows[0]).toEqual({ role: "admin" });
        const canvasAudit = await auditPool.query(
          "SELECT revision, content FROM canvas_documents WHERE project_id = $1 AND canvas_id = 'main'",
          [projectId],
        );
        expect(canvasAudit.rows[0]).toEqual({ revision: 1, content: canvasContent(["kept"]) });

        await seedDemoDatabase(auditPool);
        const preservedDeletion = await auditPool.query(
          "SELECT deleted_at IS NOT NULL AS deleted FROM projects WHERE id = $1",
          [projectId],
        );
        expect(preservedDeletion.rows[0]).toEqual({ deleted: true });
      } finally {
        await auditPool.end();
      }
    } finally {
      if (appB) await appB.close();
      else await appA.close();
    }
  });

  it("rejects expired session tokens", async () => {
    const store = new PostgresCollaborationStore(createPool(), () => new Date("2020-01-01T00:00:00.000Z"));
    try {
      const token = await store.createSession("actor-tianmaochao");
      await expect(store.getSessionActor(token)).resolves.toBeNull();
    } finally {
      await store.close();
    }
  });
});
