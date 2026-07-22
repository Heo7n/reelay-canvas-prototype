import { Navigate, useLoaderData, useParams } from "react-router-dom";
import type { CanvasDocumentRepository } from "../../application/canvases/CanvasDocumentRepository";
import type { WorkspaceRouteData } from "../../app/route-data";
import type { ProjectSummary } from "../../domain/project/project";
import { CanvasHost } from "../../legacy-canvas/CanvasHost";
import { readTheme } from "../../shared/theme/theme";

interface LegacyCanvasRouteProps {
  canvasDocumentRepository: CanvasDocumentRepository;
}

type CanvasRouteData = WorkspaceRouteData & { project: ProjectSummary };

export function LegacyCanvasRoute({ canvasDocumentRepository }: LegacyCanvasRouteProps) {
  const { workspaceId, projectId, canvasId } = useParams();
  const { project } = useLoaderData() as CanvasRouteData;

  if (!workspaceId || !projectId || !canvasId) {
    return <Navigate to="/login" replace />;
  }

  return (
    <CanvasHost
      repository={canvasDocumentRepository}
      context={{
        protocolVersion: 1,
        workspaceId,
        projectId,
        projectName: project.name,
        canvasId,
        theme: readTheme(),
        writable: project.currentUserRole !== "view",
      }}
    />
  );
}
