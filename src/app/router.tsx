import { createBrowserRouter, Navigate, Outlet, type RouteObject } from "react-router-dom";
import { AppShell } from "./AppShell";
import { RouteErrorPage } from "../pages/system/RouteErrorPage";
import { RouteLoadingPage } from "../pages/system/RouteLoadingPage";
import { createRouteHandlers } from "./route-data";
import { routePaths } from "./routes";
import { applicationServices, type ApplicationServices } from "./services";
import { WORKSPACE_ROUTE_ID } from "./useWorkspaceRouteData";

type OrganizationSection = "management" | "credits" | "usage";

function lazyOrganizationSection(section: OrganizationSection): NonNullable<RouteObject["lazy"]> {
  return async () => {
    const { OrganizationSectionRoute } = await import("../pages/organization/OrganizationSectionRoute");

    function OrganizationSectionComponent() {
      return <OrganizationSectionRoute section={section} />;
    }

    return { Component: OrganizationSectionComponent };
  };
}

export function createAppRouteObjects(services: ApplicationServices): RouteObject[] {
  const handlers = createRouteHandlers(services);
  return [
    {
      element: <AppShell />,
      errorElement: <RouteErrorPage />,
      HydrateFallback: RouteLoadingPage,
      children: [
        { index: true, loader: handlers.rootLoader },
        {
          path: "login",
          loader: handlers.loginLoader,
          action: handlers.loginAction,
          lazy: async () => {
            const { LoginPage } = await import("../pages/login/LoginPage");
            return { Component: LoginPage };
          },
        },
        { path: "account", action: handlers.accountAction },
        { path: "logout", action: handlers.logoutAction },
        {
          path: "no-workspace",
          loader: handlers.noWorkspaceLoader,
          lazy: async () => {
            const { NoWorkspacePage } = await import("../pages/system/NoWorkspacePage");
            return { Component: NoWorkspacePage };
          },
        },
        {
          id: WORKSPACE_ROUTE_ID,
          path: "w/:workspaceId",
          loader: handlers.workspaceLoader,
          shouldRevalidate: ({ currentParams, nextParams, formMethod }) => (
            currentParams.workspaceId !== nextParams.workspaceId
            || Boolean(formMethod && formMethod !== "GET")
          ),
          element: <Outlet />,
          children: [
            {
              index: true,
              action: handlers.workspaceAction,
              lazy: async () => {
                const { WorkspaceHomePage } = await import("../pages/home/WorkspaceHomePage");
                return { Component: WorkspaceHomePage };
              },
            },
            {
              path: "projects",
              action: handlers.workspaceAction,
              lazy: async () => {
                const { ProjectsPage } = await import("../pages/projects/ProjectsPage");
                return { Component: ProjectsPage };
              },
            },
            {
              path: "projects/:projectId/canvases/:canvasId",
              lazy: async () => {
                const { LegacyCanvasRoute } = await import("../pages/canvas/LegacyCanvasRoute");

                function LegacyCanvasComponent() {
                  return (
                    <LegacyCanvasRoute
                      canvasDocumentRepository={services.canvasDocumentRepository}
                      entityRepository={services.entityRepository}
                      mediaAssetRepository={services.mediaAssetRepository}
                    />
                  );
                }

                return { Component: LegacyCanvasComponent };
              },
            },
            {
              path: "organization",
              loader: handlers.organizationLoader,
              lazy: async () => {
                const { OrganizationCenterPage } = await import("../pages/organization/OrganizationCenterPage");
                return { Component: OrganizationCenterPage };
              },
              children: [
                { index: true, lazy: lazyOrganizationSection("management") },
                { path: "credits", lazy: lazyOrganizationSection("credits") },
                { path: "usage", lazy: lazyOrganizationSection("usage") },
              ],
            },
          ],
        },
        { path: "*", element: <Navigate to={routePaths.login()} replace /> },
      ],
    },
  ];
}

export function createAppRouter(services: ApplicationServices = applicationServices) {
  return createBrowserRouter(createAppRouteObjects(services), { basename: "/app" });
}

export const router = createAppRouter();
