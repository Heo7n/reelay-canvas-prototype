import path from "node:path";

import { buildServer } from "../../src/server/app";
import { createDemoSeed } from "../../src/server/demo-fixtures";
import { InMemoryAssetStore } from "../../src/server/infrastructure/InMemoryAssetStore";
import { InMemoryCollaborationStore } from "../../src/server/infrastructure/InMemoryCollaborationStore";
import { InMemoryEntityStore } from "../../src/server/infrastructure/InMemoryEntityStore";
import { InMemoryObjectStore } from "../../src/server/infrastructure/InMemoryObjectStore";

// Explicit in-memory dependencies: never read local/cloud environment files or
// start.ts defaults. Browser writes live only until this test process exits.
export async function startBrowserTestServer() {
  const seed = createDemoSeed();
  const workspaceMemberships = seed.memberships.map(({ workspaceId, actorId }) => ({ workspaceId, actorId }));
  const app = await buildServer({
    store: new InMemoryCollaborationStore(seed),
    assetStore: new InMemoryAssetStore({
      workspaceMemberships,
      projects: seed.projects.map((project) => ({
        id: project.id,
        workspaceId: project.workspaceId,
        members: seed.projectMemberships.filter(({ projectId }) => projectId === project.id)
          .map(({ actorId, role }) => ({ actorId, role })),
      })),
    }),
    entityStore: new InMemoryEntityStore({ workspaceMemberships, assets: [], personalAssetPlacements: [] }),
    objectStore: new InMemoryObjectStore(),
    secureCookies: false,
    staticRoot: path.resolve("dist/shell"),
  });
  app.get("/__e2e/health", async () => ({ runtime: "isolated-browser-test" }));
  // Bind once to an OS-assigned port; no probe/release race or shared dev server.
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  return { origin, close: () => app.close() };
}
