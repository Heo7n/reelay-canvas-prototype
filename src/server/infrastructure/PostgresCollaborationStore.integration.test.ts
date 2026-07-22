import { randomBytes } from "node:crypto";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../app";
import { DEFAULT_LOCAL_DATABASE_URL } from "../db/config";
import { runMigrations } from "../db/migrate";
import { seedDemoDatabase } from "../db/seed";
import { DEMO_PASSWORD } from "../demo-fixtures";
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
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);

  const setupPool = createPool();
  try {
    await expect(runMigrations(setupPool)).resolves.toEqual([
      "0001_collaboration.sql",
      "0002_password_identities.sql",
      "0003_project_access.sql",
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
  it("keeps a session and private project changes across server restarts", async () => {
    const appA = await buildServer({ store: new PostgresCollaborationStore(createPool()) });
    let appB: FastifyInstance | null = null;

    try {
      const health = await appA.inject({ method: "GET", url: "/api/health" });
      expect(health.json()).toEqual({ status: "ok", storage: "postgresql" });

      const ownerCookie = await login(appA, "tianmaochao@reelay.test");
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
