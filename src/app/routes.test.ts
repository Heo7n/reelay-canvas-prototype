import { describe, expect, it } from "vitest";
import { appRoutes, routePaths } from "./routes";

describe("application route contract", () => {
  it("keeps workspace, project, and canvas identity in the URL", () => {
    expect(appRoutes.canvas("org alpha", "project/7", "main canvas")).toBe(
      "/app/w/org%20alpha/projects/project%2F7/canvases/main%20canvas",
    );
  });

  it("keeps personal and organization workspaces on the same route shape", () => {
    expect(appRoutes.projects("personal-user-1")).toBe("/app/w/personal-user-1/projects");
    expect(appRoutes.projects("organization-1")).toBe("/app/w/organization-1/projects");
    expect(appRoutes.organization("organization-1")).toBe("/app/w/organization-1/organization");
  });

  it("separates browser-facing app URLs from basename-relative navigation paths", () => {
    expect(appRoutes.login()).toBe("/app/login");
    expect(routePaths.login()).toBe("/login");
    expect(routePaths.projects("workspace one")).toBe("/w/workspace%20one/projects");
    expect(routePaths.organizationUsage("workspace one")).toBe(
      "/w/workspace%20one/organization/usage",
    );
  });
});
