import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams, useSubmit } from "react-router-dom";
import type { CanvasDocumentRepository } from "../../application/canvases/CanvasDocumentRepository";
import type { EntityRepository } from "../../application/assets/EntityRepository";
import type { MediaAssetRepository } from "../../application/assets/MediaAssetRepository";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { CanvasHost } from "../../legacy-canvas/CanvasHost";
import {
  AccountSettingsDialog,
  type AccountSection,
} from "../../features/account/AccountSettingsDialog";
import { resolveProjectCoverUrl } from "../../shared/projects/project-cover";
import { readTheme } from "../../shared/theme/theme";
import type { TransientMediaRepository } from "../../application/assets/TransientMediaRepository";
import { takeExperienceLaunchIntent } from "../home/launch-intent";

interface LegacyCanvasRouteProps {
  transientMediaRepository?: TransientMediaRepository;
  canvasDocumentRepository: CanvasDocumentRepository;
  entityRepository: EntityRepository;
  mediaAssetRepository: MediaAssetRepository;
}

export function LegacyCanvasRoute({ canvasDocumentRepository, entityRepository, mediaAssetRepository, transientMediaRepository }: LegacyCanvasRouteProps) {
  const launchScopeRef = useRef<string | undefined>(undefined);
  const [launchIntent, setLaunchIntent] = useState<{ scope: string; prompt: string } | null>(null);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountSettingsSection, setAccountSettingsSection] = useState<AccountSection>("profile");
  const { workspaceId, projectId, canvasId } = useParams();
  const launchScope = workspaceId && projectId && canvasId
    ? JSON.stringify([workspaceId, projectId, canvasId])
    : undefined;
  useEffect(() => {
    if (transientMediaRepository && launchScope && launchScopeRef.current !== launchScope) {
      launchScopeRef.current = launchScope;
      setLaunchIntent({ scope: launchScope, prompt: takeExperienceLaunchIntent() });
    }
  }, [launchScope, transientMediaRepository]);
  const consumeLaunchPrompt = useCallback(() => {
    setLaunchIntent((current) => current && current.scope === launchScope && current.prompt
      ? { ...current, prompt: "" }
      : current);
  }, [launchScope]);
  const launchPrompt = launchIntent && launchIntent.scope === launchScope ? launchIntent.prompt : "";
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
        entityRepository={entityRepository}
        mediaAssetRepository={mediaAssetRepository}
        transientMediaRepository={transientMediaRepository}
        onLogout={logout}
        onCreateProject={createProject}
        onOpenAccountSettings={openAccountSettings}
        onLaunchPromptConsumed={consumeLaunchPrompt}
        context={{
          protocolVersion: 1,
          ...(transientMediaRepository ? { launchPrompt } : {}),
          capabilities: { accountSections: true, projectSwitcher: true, assetPersistence: true, entityPersistence: true,
            ...(transientMediaRepository ? { transientMediaUpload: true } : {}),
          },
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
