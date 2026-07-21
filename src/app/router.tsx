import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LegacyCanvasRoute } from "../pages/canvas/LegacyCanvasRoute";
import { LegacyRedirectPage } from "../pages/legacy/LegacyRedirectPage";

export const router = createBrowserRouter(
  [
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="login" replace /> },
        { path: "login", element: <LegacyRedirectPage to="/login.html" label="登录页" /> },
        { path: "w/:workspaceId", element: <LegacyRedirectPage to="/home.html" label="创作主页" /> },
        { path: "w/:workspaceId/projects", element: <LegacyRedirectPage to="/home.html#all-projects" label="全部项目" /> },
        { path: "w/:workspaceId/projects/:projectId/canvases/:canvasId", element: <LegacyCanvasRoute /> },
        { path: "*", element: <Navigate to="login" replace /> },
      ],
    },
  ],
  { basename: "/app" },
);
