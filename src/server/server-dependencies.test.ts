import { describe, expect, it } from "vitest";

import { buildServer } from "./app";
import { createServerDependencies } from "./server-dependencies";

describe("server dependency composition", () => {
  it("does not advertise process-local asset persistence in memory mode", async () => {
    const dependencies = createServerDependencies({ REELAY_STORAGE: "memory" });
    expect(dependencies.assetStore).toBeUndefined();
    expect(dependencies.entityStore).toBeUndefined();
    expect(dependencies.objectStore).toBeUndefined();

    const app = await buildServer(dependencies);
    try {
      await expect(app.inject({ method: "GET", url: "/api/health" }).then((response) => response.json()))
        .resolves.toEqual({ status: "ok", storage: "server-memory" });
      const capabilityProbe = await app.inject({
        method: "GET",
        url: "/api/workspaces/workspace-organization-reelay/media-assets",
      });
      expect(capabilityProbe.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
