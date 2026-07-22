import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LegacyCanvasRoute } from "../pages/canvas/LegacyCanvasRoute";
import { WorkspaceHomePage } from "../pages/home/WorkspaceHomePage";
import { LoginPage } from "../pages/login/LoginPage";
import { ProjectsPage } from "../pages/projects/ProjectsPage";
import { NoWorkspacePage } from "../pages/system/NoWorkspacePage";
import { RouteErrorPage } from "../pages/system/RouteErrorPage";
import { RouteLoadingPage } from "../pages/system/RouteLoadingPage";
import { createRouteHandlers } from "./route-data";
import { routePaths } from "./routes";
import { applicationServices, type ApplicationServices } from "./services";

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
        { path: "logout", action: handlers.logoutAction },
        { path: "no-workspace", loader: handlers.noWorkspaceLoader, element: <NoWorkspacePage /> },
        { path: "w/:workspaceId", loader: handlers.workspaceLoader, action: handlers.workspaceAction, element: <WorkspaceHomePage /> },
        { path: "w/:workspaceId/projects", loader: handlers.workspaceLoader, action: handlers.workspaceAction, element: <ProjectsPage /> },
        { path: "w/:workspaceId/projects/:projectId/canvases/:canvasId", loader: handlers.canvasLoader, element: <LegacyCanvasRoute /> },
        { path: "*", element: <Navigate to={routePaths.login()} replace /> },
      ],
    },
  ];
}

export function createAppRouter(services: ApplicationServices = applicationServices) {
  return createBrowserRouter(createAppRouteObjects(services), { basename: "/app" });
}

export const router = createAppRouter();
