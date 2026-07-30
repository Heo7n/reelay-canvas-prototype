import { useLoaderData, useRouteLoaderData } from "react-router-dom";

import type { WorkspaceRouteData } from "./route-data";

export const WORKSPACE_ROUTE_ID = "workspace";

export function useWorkspaceRouteData(): WorkspaceRouteData {
  const parentData = useRouteLoaderData(WORKSPACE_ROUTE_ID);
  const currentRouteData = useLoaderData();
  return (parentData ?? currentRouteData) as WorkspaceRouteData;
}
