import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { routePaths } from "../app/routes";

type NavigationRequest =
  | { kind: "route"; target: "home" | "projects" | "organization" | "logout" }
  | { kind: "project"; projectId: string }
  | { kind: "create-project" };

interface CanvasNavigationOptions {
  workspaceId: string;
  hasPendingWrites: () => boolean;
  requestFlush: () => void;
  onTimeout: () => void;
  onCreateProject?: () => void;
  onLogout?: () => void;
}

// Owns only navigation intent. The host remains the authority for dirty/save state
// and cancels pending intent whenever the document scope or iframe instance changes.
export function useCanvasNavigation({
  workspaceId, hasPendingWrites, requestFlush, onTimeout, onCreateProject, onLogout,
}: CanvasNavigationOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingRequestRef = useRef<NavigationRequest | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const cancelPendingNavigation = useCallback((): void => {
    pendingRequestRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => cancelPendingNavigation, [cancelPendingNavigation]);

  const finishPendingNavigation = useCallback((): void => {
    const request = pendingRequestRef.current;
    if (!request || hasPendingWrites()) return;
    cancelPendingNavigation();
    if (request.kind === "create-project") {
      onCreateProject?.();
      return;
    }
    if (request.kind === "project") {
      navigate(routePaths.canvas(workspaceId, request.projectId, "main"));
      return;
    }
    const { target } = request;
    if (target === "logout") {
      onLogout?.();
      return;
    }
    if (target === "organization") {
      navigate(routePaths.organization(workspaceId), {
        state: {
          organizationReturnTo: `${location.pathname}${location.search}${location.hash}`,
        },
      });
      return;
    }
    navigate(target === "home"
      ? routePaths.workspaceHome(workspaceId)
      : routePaths.projects(workspaceId));
  }, [cancelPendingNavigation, hasPendingWrites, location.hash, location.pathname, location.search, navigate, onCreateProject, onLogout, workspaceId]);

  const queueNavigation = useCallback((request: NavigationRequest): void => {
    pendingRequestRef.current = request;
    if (!hasPendingWrites()) {
      finishPendingNavigation();
      return;
    }
    requestFlush();
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      cancelPendingNavigation();
      onTimeout();
    }, 10_000);
  }, [cancelPendingNavigation, finishPendingNavigation, hasPendingWrites, onTimeout, requestFlush]);

  return { queueNavigation, finishPendingNavigation, cancelPendingNavigation };
}
