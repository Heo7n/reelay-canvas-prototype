import { useState } from "react";
import { Navigate, useParams, useSubmit } from "react-router-dom";
import type { CanvasDocumentRepository } from "../../application/canvases/CanvasDocumentRepository";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { CanvasHost } from "../../legacy-canvas/CanvasHost";
import { AccountSettingsDialog } from "../../features/account/AccountSettingsDialog";
import { readTheme } from "../../shared/theme/theme";

interface LegacyCanvasRouteProps {
  canvasDocumentRepository: CanvasDocumentRepository;
}

export function LegacyCanvasRoute({ canvasDocumentRepository }: LegacyCanvasRouteProps) {
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const { workspaceId, projectId, canvasId } = useParams();
  const { actor, currentWorkspace, projects } = useWorkspaceRouteData();
  const project = projects.find((candidate) => candidate.id === projectId);
  const submit = useSubmit();

  if (!workspaceId || !projectId || !canvasId) {
    return <Navigate to="/login" replace />;
  }
  if (!project) return <Navigate to={routePaths.projects(workspaceId)} replace />;

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
