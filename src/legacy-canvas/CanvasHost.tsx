import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { CanvasDocumentRepository } from "../application/canvases/CanvasDocumentRepository";
import type { MediaAssetRepository, ProjectMediaAsset } from "../application/assets/MediaAssetRepository";
import { isApplicationError } from "../application/shared/ApplicationError";
import { routePaths } from "../app/routes";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import {
  hostDocumentMessageSchema,
  hostAssetCommandErrorMessageSchema,
  hostFlushMessageSchema,
  hostMediaUploadGrantMessageSchema,
  hostMediaUploadResultMessageSchema,
  hostMessageSchema,
  hostProjectAssetsMessageSchema,
  hostSaveErrorMessageSchema,
  hostSaveResultMessageSchema,
  legacyCanvasContextSchema,
  parseCanvasMessage,
  type LegacyAccountSection,
  type LegacyCanvasContext,
} from "./bridge-protocol";

interface CanvasHostProps {
  context: LegacyCanvasContext;
  onCreateProject?: () => void;
  onLogout?: () => void;
  onOpenAccountSettings?: (section: LegacyAccountSection) => void;
  repository: CanvasDocumentRepository;
  mediaAssetRepository?: MediaAssetRepository;
}

type DocumentLoadState =
  | { status: "loading" }
  | { status: "ready"; document: CanvasDocument | null }
  | { status: "error"; reason: "load" | "unavailable" };

type PersistenceStatus = "loading" | "saved" | "dirty" | "saving" | "error";
type NavigationTarget = "home" | "projects" | "organization" | "logout";
type NavigationRequest =
  | { kind: "route"; target: NavigationTarget }
  | { kind: "project"; projectId: string }
  | { kind: "create-project" };

export function CanvasHost({ context, mediaAssetRepository, onCreateProject, onLogout, onOpenAccountSettings, repository }: CanvasHostProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const initializedReadyGenerationRef = useRef(0);
  const activeCanvasInstanceIdRef = useRef<string | null>(null);
  const seenCanvasInstanceIdsRef = useRef(new Set<string>());
  const dirtyRef = useRef(false);
  const savingRef = useRef(0);
  const sameScopeInFlightSaveCountRef = useRef(0);
  const authoritativeDocumentNeedsRefreshRef = useRef(false);
  const authoritativeRefreshTokenRef = useRef(0);
  const authoritativeRefreshInFlightRef = useRef(false);
  const pendingNavigationRef = useRef<NavigationRequest | null>(null);
  const navigationTimeoutRef = useRef<number | null>(null);
  const pendingAssetUploadsRef = useRef(new Map<string, { instanceId: string; uploadId: string }>());
  const pendingAssetCommandIdsRef = useRef(new Set<string>());
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [sameScopeInFlightSaveCount, setSameScopeInFlightSaveCount] = useState(0);
  const [refreshingAuthoritativeDocument, setRefreshingAuthoritativeDocument] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [documentState, setDocumentState] = useState<DocumentLoadState>({ status: "loading" });
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [projectAssets, setProjectAssets] = useState<ProjectMediaAsset[]>([]);
  const [projectAssetsLoaded, setProjectAssetsLoaded] = useState(false);
  const [assetPersistenceAvailable, setAssetPersistenceAvailable] = useState(false);
  const safeContext = useMemo(() => legacyCanvasContextSchema.parse(context), [context]);
  const projectAuthorizationKey = JSON.stringify((safeContext.projects ?? []).map((project) => project.id));
  const authorizedProjectIds = useMemo(
    () => new Set(JSON.parse(projectAuthorizationKey) as string[]),
    [projectAuthorizationKey],
  );
  const frameSource = useMemo(() => {
    const query = new URLSearchParams({
      workspaceId: safeContext.workspaceId,
      projectId: safeContext.projectId,
      canvasId: safeContext.canvasId,
    });
    return `/index.html?${query.toString()}`;
  }, [safeContext.canvasId, safeContext.projectId, safeContext.workspaceId]);

  const postToCanvas = useCallback((message: unknown): void => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const requestFlush = useCallback((): void => {
    postToCanvas(hostFlushMessageSchema.parse({
      source: "reelay-shell",
      type: "host:flush",
      protocolVersion: 1,
    }));
  }, [postToCanvas]);

  const finishPendingNavigation = useCallback((): void => {
    const request = pendingNavigationRef.current;
    if (!request || dirtyRef.current || savingRef.current > 0) return;
    pendingNavigationRef.current = null;
    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    if (request.kind === "create-project") {
      onCreateProject?.();
      return;
    }
    if (request.kind === "project") {
      navigate(routePaths.canvas(safeContext.workspaceId, request.projectId, "main"));
      return;
    }
    const { target } = request;
    if (target === "logout") {
      onLogout?.();
      return;
    }
    if (target === "organization") {
      navigate(routePaths.organization(safeContext.workspaceId), {
        state: {
          organizationReturnTo: `${location.pathname}${location.search}${location.hash}`,
        },
      });
      return;
    }
    navigate(target === "home"
      ? routePaths.workspaceHome(safeContext.workspaceId)
      : routePaths.projects(safeContext.workspaceId));
  }, [location.hash, location.pathname, location.search, navigate, onCreateProject, onLogout, safeContext.workspaceId]);

  const queueNavigation = useCallback((request: NavigationRequest): void => {
    pendingNavigationRef.current = request;
    if (!dirtyRef.current && savingRef.current === 0) {
      finishPendingNavigation();
      return;
    }
    requestFlush();
    if (navigationTimeoutRef.current !== null) window.clearTimeout(navigationTimeoutRef.current);
    navigationTimeoutRef.current = window.setTimeout(() => {
      pendingNavigationRef.current = null;
      navigationTimeoutRef.current = null;
      setPersistenceStatus("error");
    }, 10_000);
  }, [finishPendingNavigation, requestFlush]);

  const sendInit = useCallback((instanceId: string): void => {
    if (
      documentState.status !== "ready"
      || activeCanvasInstanceIdRef.current !== instanceId
    ) return;
    const message = hostMessageSchema.parse({
      source: "reelay-shell",
      type: "host:init",
      context: {
        ...safeContext,
        capabilities: {
          accountSections: safeContext.capabilities?.accountSections === true,
          projectSwitcher: safeContext.capabilities?.projectSwitcher,
          ...(safeContext.capabilities?.assetPersistence === undefined
            ? {}
            : { assetPersistence: assetPersistenceAvailable }),
        },
      },
    });
    postToCanvas(message);
    postToCanvas(hostDocumentMessageSchema.parse({
      source: "reelay-shell",
      type: "host:document",
      protocolVersion: 1,
      document: documentState.document,
      writable: safeContext.writable,
    }));
    if (assetPersistenceAvailable) {
      postToCanvas(hostProjectAssetsMessageSchema.parse({
        source: "reelay-shell",
        type: "host:project-assets",
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        instanceId,
        projectAssets,
      }));
    }
    setPersistenceStatus(savingRef.current > 0
      ? "saving"
      : (dirtyRef.current ? "dirty" : "saved"));
  }, [assetPersistenceAvailable, documentState, postToCanvas, projectAssets, safeContext]);

  const refreshAuthoritativeDocument = useCallback((): void => {
    if (authoritativeRefreshInFlightRef.current) return;
    const refreshToken = authoritativeRefreshTokenRef.current + 1;
    authoritativeRefreshTokenRef.current = refreshToken;
    authoritativeRefreshInFlightRef.current = true;
    setRefreshingAuthoritativeDocument(true);
    setDocumentState({ status: "loading" });
    setPersistenceStatus("loading");
    void repository.getCanvasDocument(safeContext.projectId, safeContext.canvasId).then(
      (document) => {
        if (authoritativeRefreshTokenRef.current !== refreshToken) return;
        authoritativeDocumentNeedsRefreshRef.current = false;
        setDocumentState({ status: "ready", document });
      },
      (error: unknown) => {
        if (authoritativeRefreshTokenRef.current !== refreshToken) return;
        setDocumentState({
          status: "error",
          reason: isApplicationError(error, "not_found") ? "unavailable" : "load",
        });
        setPersistenceStatus("error");
      },
    ).finally(() => {
      if (authoritativeRefreshTokenRef.current !== refreshToken) return;
      authoritativeRefreshInFlightRef.current = false;
      setRefreshingAuthoritativeDocument(false);
    });
  }, [repository, safeContext.canvasId, safeContext.projectId]);

  useEffect(() => {
    let active = true;
    initializedReadyGenerationRef.current = 0;
    activeCanvasInstanceIdRef.current = null;
    seenCanvasInstanceIdsRef.current.clear();
    sameScopeInFlightSaveCountRef.current = 0;
    authoritativeDocumentNeedsRefreshRef.current = false;
    authoritativeRefreshTokenRef.current += 1;
    authoritativeRefreshInFlightRef.current = false;
    setReadyGeneration(0);
    setSameScopeInFlightSaveCount(0);
    setRefreshingAuthoritativeDocument(false);
    dirtyRef.current = false;
    savingRef.current = 0;
    pendingNavigationRef.current = null;
    pendingAssetUploadsRef.current.clear();
    pendingAssetCommandIdsRef.current.clear();
    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    setDocumentState({ status: "loading" });
    setProjectAssets([]);
    setProjectAssetsLoaded(false);
    setAssetPersistenceAvailable(false);
    setPersistenceStatus("loading");
    void repository.getCanvasDocument(safeContext.projectId, safeContext.canvasId).then(
      (document) => {
        if (active) {
          authoritativeDocumentNeedsRefreshRef.current = false;
          setDocumentState({ status: "ready", document });
          setPersistenceStatus("saved");
        }
      },
      (error: unknown) => {
        if (active) {
          setDocumentState({
            status: "error",
            reason: isApplicationError(error, "not_found") ? "unavailable" : "load",
          });
          setPersistenceStatus("error");
        }
      },
    );
    if (safeContext.capabilities?.assetPersistence && mediaAssetRepository) {
      void mediaAssetRepository.listProjectAssets(safeContext.projectId).then(
        (assets) => {
          if (!active) return;
          setProjectAssets(assets);
          setAssetPersistenceAvailable(true);
          setProjectAssetsLoaded(true);
        },
        () => {
          if (!active) return;
          setProjectAssets([]);
          setAssetPersistenceAvailable(false);
          setProjectAssetsLoaded(true);
        },
      );
    } else {
      setProjectAssetsLoaded(true);
    }
    return () => {
      active = false;
      if (navigationTimeoutRef.current !== null) window.clearTimeout(navigationTimeoutRef.current);
    };
  }, [loadAttempt, mediaAssetRepository, repository, safeContext.canvasId, safeContext.projectId]);

  const retryDocumentLoad = useCallback((): void => {
    setDocumentState({ status: "loading" });
    setPersistenceStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (
      readyGeneration === 0 ||
      sameScopeInFlightSaveCount > 0 ||
      refreshingAuthoritativeDocument ||
      authoritativeDocumentNeedsRefreshRef.current ||
      documentState.status !== "ready" ||
      !projectAssetsLoaded ||
      initializedReadyGenerationRef.current === readyGeneration
    ) return;
    const instanceId = activeCanvasInstanceIdRef.current;
    if (!instanceId) return;
    initializedReadyGenerationRef.current = readyGeneration;
    sendInit(instanceId);
  }, [documentState.status, projectAssetsLoaded, readyGeneration, refreshingAuthoritativeDocument, sameScopeInFlightSaveCount, sendInit]);

  useEffect(() => {
    const flushIfNeeded = (): void => {
      if (dirtyRef.current || savingRef.current > 0) requestFlush();
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") flushIfNeeded();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!dirtyRef.current && savingRef.current === 0) return;
      flushIfNeeded();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("pagehide", flushIfNeeded);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushIfNeeded);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestFlush]);

  useEffect(() => {
    let active = true;
    const sendSaveError = (
      requestId: string,
      code: "conflict" | "forbidden" | "missing" | "network",
    ): void => {
      postToCanvas(hostSaveErrorMessageSchema.parse({
        source: "reelay-shell",
        type: "host:save-error",
        protocolVersion: 1,
        requestId,
        code,
      }));
    };
    const sendAssetError = (
      requestId: string,
      instanceId: string,
      code: "invalid" | "forbidden" | "missing" | "network" | "unsupported",
    ): void => {
      postToCanvas(hostAssetCommandErrorMessageSchema.parse({
        source: "reelay-shell",
        type: "host:asset-command-error",
        protocolVersion: 1,
        requestId,
        instanceId,
        code,
      }));
    };
    const assetErrorCode = (error: unknown): "forbidden" | "missing" | "network" => {
      if (isApplicationError(error, "forbidden")) return "forbidden";
      if (isApplicationError(error, "not_found")) return "missing";
      return "network";
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = parseCanvasMessage(event.data);
      if (!message) return;

      if (message.type === "canvas:ready") {
        if (seenCanvasInstanceIdsRef.current.has(message.instanceId)) return;
        seenCanvasInstanceIdsRef.current.add(message.instanceId);
        activeCanvasInstanceIdRef.current = message.instanceId;
        dirtyRef.current = false;
        savingRef.current = 0;
        pendingNavigationRef.current = null;
        if (navigationTimeoutRef.current !== null) {
          window.clearTimeout(navigationTimeoutRef.current);
          navigationTimeoutRef.current = null;
        }
        setPersistenceStatus("loading");
        setReadyGeneration((generation) => generation + 1);
        if (
          sameScopeInFlightSaveCountRef.current === 0
          && authoritativeDocumentNeedsRefreshRef.current
        ) {
          refreshAuthoritativeDocument();
        }
        return;
      }
      if (message.instanceId !== activeCanvasInstanceIdRef.current) return;
      if (message.type === "canvas:create-media-upload") {
        if (!assetPersistenceAvailable || !mediaAssetRepository) {
          sendAssetError(message.requestId, message.instanceId, "unsupported");
          return;
        }
        if (!safeContext.writable) {
          sendAssetError(message.requestId, message.instanceId, "forbidden");
          return;
        }
        if (
          pendingAssetCommandIdsRef.current.has(message.requestId)
          || pendingAssetUploadsRef.current.has(message.requestId)
        ) {
          sendAssetError(message.requestId, message.instanceId, "invalid");
          return;
        }
        pendingAssetCommandIdsRef.current.add(message.requestId);
        const sourceFrame = event.source;
        void mediaAssetRepository.createUploadIntent({
          workspaceId: safeContext.workspaceId,
          idempotencyKey: message.idempotencyKey,
          mediaKind: message.mediaKind,
          displayName: message.displayName,
          contentType: message.contentType,
          byteSize: message.byteSize,
          checksumSha256: message.checksumSha256,
        }).then(
          (grant) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            const stillActive = active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current;
            if (!stillActive) return;
            pendingAssetUploadsRef.current.set(message.requestId, {
              instanceId: message.instanceId,
              uploadId: grant.uploadIntent.id,
            });
            postToCanvas(hostMediaUploadGrantMessageSchema.parse({
              source: "reelay-shell",
              type: "host:media-upload-grant",
              protocolVersion: 1,
              requestId: message.requestId,
              instanceId: message.instanceId,
              ...grant,
            }));
          },
          (error: unknown) => {
            pendingAssetCommandIdsRef.current.delete(message.requestId);
            if (
              active
              && sourceFrame === frameRef.current?.contentWindow
              && message.instanceId === activeCanvasInstanceIdRef.current
            ) sendAssetError(message.requestId, message.instanceId, assetErrorCode(error));
          },
        );
        return;
      }
      if (message.type === "canvas:finalize-media-upload") {
        const pending = pendingAssetUploadsRef.current.get(message.requestId);
        if (
          !assetPersistenceAvailable
          || !mediaAssetRepository
          || !pending
          || pending.instanceId !== message.instanceId
          || pending.uploadId !== message.uploadId
          || pendingAssetCommandIdsRef.current.has(message.requestId)
        ) {
          sendAssetError(message.requestId, message.instanceId, "invalid");
          return;
        }
        pendingAssetCommandIdsRef.current.add(message.requestId);
        const sourceFrame = event.source;
        void mediaAssetRepository.finalizeUpload(safeContext.workspaceId, pending.uploadId)
          .then((asset) => mediaAssetRepository.attachToProject(safeContext.projectId, asset.id))
          .then(
            (projectAsset) => {
              pendingAssetCommandIdsRef.current.delete(message.requestId);
              pendingAssetUploadsRef.current.delete(message.requestId);
              const stillActive = active
                && sourceFrame === frameRef.current?.contentWindow
                && message.instanceId === activeCanvasInstanceIdRef.current;
              if (!stillActive) return;
              setProjectAssets((current) => [
                ...current.filter((asset) => asset.referenceId !== projectAsset.referenceId),
                projectAsset,
              ]);
              postToCanvas(hostMediaUploadResultMessageSchema.parse({
                source: "reelay-shell",
                type: "host:media-upload-result",
                protocolVersion: 1,
                requestId: message.requestId,
                instanceId: message.instanceId,
                uploadId: message.uploadId,
                projectAsset,
              }));
            },
            (error: unknown) => {
              pendingAssetCommandIdsRef.current.delete(message.requestId);
              pendingAssetUploadsRef.current.delete(message.requestId);
              if (
                active
                && sourceFrame === frameRef.current?.contentWindow
                && message.instanceId === activeCanvasInstanceIdRef.current
              ) sendAssetError(message.requestId, message.instanceId, assetErrorCode(error));
            },
          );
        return;
      }
      if (message.type === "canvas:dirty") {
        dirtyRef.current = message.dirty;
        setPersistenceStatus(message.dirty
          ? (savingRef.current > 0 ? "saving" : "dirty")
          : (savingRef.current > 0 ? "saving" : "saved"));
        if (!message.dirty) finishPendingNavigation();
        return;
      }
      if (message.type === "canvas:navigate") {
        queueNavigation({ kind: "route", target: message.target });
        return;
      }
      if (message.type === "canvas:open-project") {
        const canOpenProject = safeContext.capabilities?.projectSwitcher === true
          && authorizedProjectIds.has(message.projectId);
        if (canOpenProject && message.projectId !== safeContext.projectId) {
          queueNavigation({ kind: "project", projectId: message.projectId });
        }
        return;
      }
      if (message.type === "canvas:create-project") {
        if (safeContext.capabilities?.projectSwitcher === true && onCreateProject) {
          queueNavigation({ kind: "create-project" });
        }
        return;
      }
      if (message.type === "canvas:open-account") {
        onOpenAccountSettings?.(message.section);
        return;
      }
      if (message.type !== "canvas:save") return;

      if (!safeContext.writable) {
        setPersistenceStatus("error");
        pendingNavigationRef.current = null;
        sendSaveError(message.requestId, "forbidden");
        return;
      }

      savingRef.current += 1;
      sameScopeInFlightSaveCountRef.current += 1;
      setSameScopeInFlightSaveCount(sameScopeInFlightSaveCountRef.current);
      setPersistenceStatus("saving");
      const sourceFrame = event.source;
      const sourceInstanceId = message.instanceId;
      void repository.save({
        projectId: safeContext.projectId,
        canvasId: safeContext.canvasId,
        schemaVersion: message.schemaVersion,
        expectedRevision: message.expectedRevision,
        content: message.content,
      }).then(
        (savedDocument) => {
          if (!active) return;
          sameScopeInFlightSaveCountRef.current = Math.max(
            0,
            sameScopeInFlightSaveCountRef.current - 1,
          );
          setSameScopeInFlightSaveCount(sameScopeInFlightSaveCountRef.current);
          setDocumentState((current) => {
            if (
              current.status === "ready"
              && current.document
              && current.document.projectId === savedDocument.projectId
              && current.document.id === savedDocument.id
              && current.document.revision > savedDocument.revision
            ) return current;
            return { status: "ready", document: savedDocument };
          });
          authoritativeDocumentNeedsRefreshRef.current = false;
          const isActiveSource = sourceFrame === frameRef.current?.contentWindow
            && sourceInstanceId === activeCanvasInstanceIdRef.current;
          if (!isActiveSource) return;
          savingRef.current = Math.max(0, savingRef.current - 1);
          setPersistenceStatus(savingRef.current > 0
            ? "saving"
            : (dirtyRef.current ? "dirty" : "saved"));
          postToCanvas(hostSaveResultMessageSchema.parse({
            source: "reelay-shell",
            type: "host:save-result",
            protocolVersion: 1,
            requestId: message.requestId,
            document: savedDocument,
          }));
          finishPendingNavigation();
        },
        (error: unknown) => {
          if (!active) return;
          sameScopeInFlightSaveCountRef.current = Math.max(
            0,
            sameScopeInFlightSaveCountRef.current - 1,
          );
          setSameScopeInFlightSaveCount(sameScopeInFlightSaveCountRef.current);
          authoritativeDocumentNeedsRefreshRef.current = true;
          const isActiveSource = sourceFrame === frameRef.current?.contentWindow
            && sourceInstanceId === activeCanvasInstanceIdRef.current;
          if (!isActiveSource) {
            if (sameScopeInFlightSaveCountRef.current === 0) refreshAuthoritativeDocument();
            return;
          }
          savingRef.current = Math.max(0, savingRef.current - 1);
          setPersistenceStatus("error");
          pendingNavigationRef.current = null;
          if (navigationTimeoutRef.current !== null) {
            window.clearTimeout(navigationTimeoutRef.current);
            navigationTimeoutRef.current = null;
          }
          if (isApplicationError(error, "conflict")) {
            sendSaveError(message.requestId, "conflict");
            return;
          }
          if (isApplicationError(error, "forbidden")) {
            sendSaveError(message.requestId, "forbidden");
            return;
          }
          if (isApplicationError(error, "not_found")) {
            sendSaveError(message.requestId, "missing");
            setDocumentState({ status: "error", reason: "unavailable" });
            return;
          }
          sendSaveError(message.requestId, "network");
        },
      );
    };
    window.addEventListener("message", handleMessage);
    return () => {
      active = false;
      window.removeEventListener("message", handleMessage);
    };
  }, [assetPersistenceAvailable, authorizedProjectIds, finishPendingNavigation, mediaAssetRepository, onCreateProject, onOpenAccountSettings, postToCanvas, queueNavigation, refreshAuthoritativeDocument, repository, safeContext.canvasId, safeContext.capabilities?.projectSwitcher, safeContext.projectId, safeContext.workspaceId, safeContext.writable]);

  return (
    <section
      className="legacy-canvas-host"
      aria-label="Reelay 项目画布"
      data-persistence-status={persistenceStatus}
    >
      {documentState.status !== "error" || documentState.reason !== "unavailable" ? (
        <iframe
          ref={frameRef}
          key={frameSource}
          className="legacy-canvas-frame"
          src={frameSource}
          title="Reelay 项目画布"
        />
      ) : null}
      {documentState.status !== "ready" ? (
        <div className="legacy-canvas-state" role={documentState.status === "error" ? "alert" : "status"}>
          {documentState.status === "error" ? (
            <div className="legacy-canvas-state-card">
              <strong>
                {documentState.reason === "unavailable" ? "项目已删除或无法访问" : "暂时无法加载此项目画布"}
              </strong>
              <span>
                {documentState.reason === "unavailable"
                  ? "画布已停止交互，当前窗口不会继续保存任何内容。"
                  : "画布已停止交互，重试成功前不会写入任何内容。"}
              </span>
              <button type="button" onClick={retryDocumentLoad}>重试加载</button>
            </div>
          ) : (
            <span>正在加载项目画布…</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
