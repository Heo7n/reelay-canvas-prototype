import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildServer } from "./app";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";

describe("production static hosting", () => {
  let app: FastifyInstance;
  let staticRoot: string;

  beforeEach(async () => {
    staticRoot = await mkdtemp(path.join(tmpdir(), "reelay-static-"));
    await writeFile(path.join(staticRoot, "app-shell.html"), "<main>application shell</main>");
    await writeFile(path.join(staticRoot, "index.html"), "<main>legacy canvas</main>");
    app = await buildServer({
      staticRoot,
      store: new InMemoryCollaborationStore(),
    });
  });

  afterEach(async () => {
    await app.close();
    await rm(staticRoot, { force: true, recursive: true });
  });

  it("redirects the root and serves application history routes", async () => {
    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(302);
    expect(root.headers.location).toBe("/app/login");

    const deepLink = await app.inject({
      method: "GET",
      url: "/app/w/workspace-organization-reelay/projects",
    });
    expect(deepLink.statusCode).toBe(200);
    expect(deepLink.headers["content-type"]).toContain("text/html");
    expect(deepLink.body).toContain("application shell");
  });

  it("serves the legacy canvas without turning missing APIs into the application shell", async () => {
    const canvas = await app.inject({ method: "GET", url: "/index.html" });
    expect(canvas.statusCode).toBe(200);
    expect(canvas.body).toContain("legacy canvas");

    const missingApi = await app.inject({ method: "GET", url: "/api/does-not-exist" });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.json()).toEqual({
      error: { code: "not_found", message: "The requested resource was not found." },
    });
  });
});
