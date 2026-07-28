import { createBrowserRouter, Navigate, Outlet, type RouteObject } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LegacyCanvasRoute } from "../pages/canvas/LegacyCanvasRoute";
import { WorkspaceHomePage } from "../pages/home/WorkspaceHomePage";
import { LoginPage } from "../pages/login/LoginPage";
import { OrganizationCenterPage } from "../pages/organization/OrganizationCenterPage";
import { OrganizationSectionRoute } from "../pages/organization/OrganizationSectionRoute";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { NoWorkspacePage } from "../pages/system/NoWorkspacePage";
import { RouteErrorPage } from "../pages/system/RouteErrorPage";
import { RouteLoadingPage } from "../pages/system/RouteLoadingPage";
import { createRouteHandlers } from "./route-data";
import { routePaths } from "./routes";
import { applicationServices, type ApplicationServices } from "./services";
import { WORKSPACE_ROUTE_ID } from "./useWorkspaceRouteData";

export function createAppRouteObjects(services: ApplicationServices): RouteObject[] {
  const handlers = createRouteHandlers(services);
  return [
    {
      element: <AppShell />,
      errorElement: <RouteErrorPage />,
      HydrateFallback: RouteLoadingPage,
      children: [
        { index: true, loader: handlers.rootLoader },
        { path: "login", loader: handlers.loginLoader, action: handlers.loginAction, element: <LoginPage /> },
        { path: "account", action: handlers.accountAction },
        { path: "logout", action: handlers.logoutAction },
        { path: "no-workspace", loader: handlers.noWorkspaceLoader, element: <NoWorkspacePage /> },
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
            { index: true, action: handlers.workspaceAction, element: <WorkspaceHomePage /> },
            { path: "projects", action: handlers.workspaceAction, element: <ProjectsPage /> },
            {
              path: "projects/:projectId/canvases/:canvasId",
              element: <LegacyCanvasRoute canvasDocumentRepository={services.canvasDocumentRepository} />,
            },
            {
              path: "organization",
              loader: handlers.organizationLoader,
              element: <OrganizationCenterPage />,
              children: [
                { index: true, element: <OrganizationSectionRoute section="management" /> },
                { path: "credits", element: <OrganizationSectionRoute section="credits" /> },
                { path: "usage", element: <OrganizationSectionRoute section="usage" /> },
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
