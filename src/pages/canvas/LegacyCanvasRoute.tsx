import { useCallback, useState } from "react";
import { Navigate, useParams, useSubmit } from "react-router-dom";
import type { CanvasDocumentRepository } from "../../application/canvases/CanvasDocumentRepository";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { CanvasHost } from "../../legacy-canvas/CanvasHost";
import {
  AccountSettingsDialog,
  type AccountSection,
} from "../../features/account/AccountSettingsDialog";
import { resolveProjectCoverUrl } from "../../shared/projects/project-cover";
import { readTheme } from "../../shared/theme/theme";

interface LegacyCanvasRouteProps {
  canvasDocumentRepository: CanvasDocumentRepository;
}

export function LegacyCanvasRoute({ canvasDocumentRepository }: LegacyCanvasRouteProps) {
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountSettingsSection, setAccountSettingsSection] = useState<AccountSection>("profile");
  const { workspaceId, projectId, canvasId } = useParams();
  const { actor, currentWorkspace, projects } = useWorkspaceRouteData();
  const project = projects.find((candidate) => candidate.id === projectId);
  const submit = useSubmit();
  const logout = useCallback(() => {
    submit(null, { action: routePaths.logout(), method: "post" });
  }, [submit]);
  const createProject = useCallback(() => {
    if (!workspaceId) return;
    const formData = new FormData();
    formData.set("intent", "create");
    submit(formData, { action: routePaths.projects(workspaceId), method: "post" });
  }, [submit, workspaceId]);
  const openAccountSettings = useCallback((section: AccountSection) => {
    setAccountSettingsSection(section);
    setAccountSettingsOpen(true);
  }, []);

  if (!workspaceId || !projectId || !canvasId) {
    return <Navigate to="/login" replace />;
  }
  if (!project) return <Navigate to={routePaths.projects(workspaceId)} replace />;

  return (
    <>
      <CanvasHost
        repository={canvasDocumentRepository}
        onLogout={logout}
        onCreateProject={createProject}
        onOpenAccountSettings={openAccountSettings}
        context={{
          protocolVersion: 1,
          capabilities: { accountSections: true, projectSwitcher: true },
          workspaceId,
          projectId,
          projectName: project.name,
          projects: projects.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            coverUrl: resolveProjectCoverUrl(candidate.coverAssetId),
          })),
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
        initialSection={accountSettingsSection}
        open={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
      />
    </>
  );
}
