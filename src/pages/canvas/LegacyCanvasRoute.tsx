import { Navigate, useParams } from "react-router-dom";
import { CanvasHost } from "../../legacy-canvas/CanvasHost";
import { readTheme } from "../../shared/theme/theme";

export function LegacyCanvasRoute() {
  const { workspaceId, projectId, canvasId } = useParams();

  if (!workspaceId || !projectId || !canvasId) {
    return <Navigate to="/login" replace />;
  }

  return (
    <CanvasHost
      context={{
        protocolVersion: 1,
        workspaceId,
        projectId,
        canvasId,
        theme: readTheme(),
      }}
    />
  );
}
