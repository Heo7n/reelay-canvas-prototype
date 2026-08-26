// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { RouteLoadingPage } from "../pages/system/RouteLoadingPage";
import { createAppRouteObjects } from "./router";
import { applicationServices } from "./services";

describe("application router", () => {
  it("keeps data handlers eager while loading routed page components on demand", () => {
    const [rootRoute] = createAppRouteObjects(applicationServices);
    const rootChildren = rootRoute?.children ?? [];
    const loginRoute = rootChildren.find((route) => route.path === "login");
    const noWorkspaceRoute = rootChildren.find((route) => route.path === "no-workspace");
    const workspaceRoute = rootChildren.find((route) => route.path === "w/:workspaceId");
    const workspaceChildren = workspaceRoute?.children ?? [];
    const homeRoute = workspaceChildren.find((route) => route.index);
    const projectsRoute = workspaceChildren.find((route) => route.path === "projects");
    const canvasRoute = workspaceChildren.find(
      (route) => route.path === "projects/:projectId/canvases/:canvasId",
    );
    const organizationRoute = workspaceChildren.find((route) => route.path === "organization");

    expect(rootRoute?.HydrateFallback).toBe(RouteLoadingPage);
    expect(loginRoute).toMatchObject({
      action: expect.any(Function),
      loader: expect.any(Function),
      lazy: expect.any(Function),
    });
    expect(noWorkspaceRoute).toMatchObject({
      loader: expect.any(Function),
      lazy: expect.any(Function),
    });
    expect(workspaceRoute?.loader).toEqual(expect.any(Function));
    expect(homeRoute).toMatchObject({ action: expect.any(Function), lazy: expect.any(Function) });
    expect(projectsRoute).toMatchObject({ action: expect.any(Function), lazy: expect.any(Function) });
    expect(canvasRoute?.lazy).toEqual(expect.any(Function));
    expect(organizationRoute).toMatchObject({
      loader: expect.any(Function),
      lazy: expect.any(Function),
    });
    expect(organizationRoute?.children).toHaveLength(3);
    expect(organizationRoute?.children?.every((route) => typeof route.lazy === "function")).toBe(true);

    for (const route of [loginRoute, noWorkspaceRoute, homeRoute, projectsRoute, canvasRoute, organizationRoute]) {
      expect(route?.element).toBeUndefined();
    }
  });
});
