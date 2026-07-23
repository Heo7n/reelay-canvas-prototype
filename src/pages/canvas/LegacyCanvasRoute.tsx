import { useState } from "react";
import { Navigate, useLoaderData, useParams, useSubmit } from "react-router-dom";
import type { CanvasDocumentRepository } from "../../application/canvases/CanvasDocumentRepository";
import type { WorkspaceRouteData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import type { ProjectSummary } from "../../domain/project/project";
import { CanvasHost } from "../../legacy-canvas/CanvasHost";
import { AccountSettingsDialog } from "../../features/account/AccountSettingsDialog";
import { readTheme } from "../../shared/theme/theme";

interface LegacyCanvasRouteProps {
  canvasDocumentRepository: CanvasDocumentRepository;
}

type CanvasRouteData = WorkspaceRouteData & { project: ProjectSummary };

export function LegacyCanvasRoute({ canvasDocumentRepository }: LegacyCanvasRouteProps) {
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const { workspaceId, projectId, canvasId } = useParams();
  const { actor, currentWorkspace, project } = useLoaderData() as CanvasRouteData;
  const submit = useSubmit();

  if (!workspaceId || !projectId || !canvasId) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <CanvasHost
        repository={canvasDocumentRepository}
        onLogout={() => submit(null, { action: routePaths.logout(), method: "post" })}
        onOpenAccountSettings={() => setAccountSettingsOpen(true)}
        context={{
        protocolVersion: 1,
        workspaceId,
        projectId,
        projectName: project.name,
        canvasId,
        theme: readTheme(),
        writable: project.currentUserRole !== "view",
        actor: {
          account: actor.account,
          displayName: actor.displayName,
        },
        workspace: {
          name: currentWorkspace.name,
          role: currentWorkspace.currentUserRole ?? "member",
        },
        }}
      />
      <AccountSettingsDialog
        actor={actor}
        workspace={currentWorkspace}
        open={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
      />
    </>
  );
}
