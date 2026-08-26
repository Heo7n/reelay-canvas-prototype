import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { CanvasDocumentRepository } from "../application/canvases/CanvasDocumentRepository";
import { isApplicationError } from "../application/shared/ApplicationError";
import { routePaths } from "../app/routes";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import {
  hostDocumentMessageSchema,
  hostFlushMessageSchema,
  hostMessageSchema,
  hostSaveErrorMessageSchema,
  hostSaveResultMessageSchema,
  legacyCanvasContextSchema,
  parseCanvasMessage,
  type LegacyCanvasContext,
} from "./bridge-protocol";

interface CanvasHostProps {
  context: LegacyCanvasContext;
  onLogout?: () => void;
  onOpenAccountSettings?: () => void;
  repository: CanvasDocumentRepository;
}

type DocumentLoadState =
  | { status: "loading" }
  | { status: "ready"; document: CanvasDocument | null }
  | { status: "error"; reason: "load" | "unavailable" };

type PersistenceStatus = "loading" | "saved" | "dirty" | "saving" | "error";
type NavigationTarget = "home" | "projects" | "organization" | "logout";

export function CanvasHost({ context, onLogout, onOpenAccountSettings, repository }: CanvasHostProps) {
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
  const pendingNavigationRef = useRef<NavigationTarget | null>(null);
  const navigationTimeoutRef = useRef<number | null>(null);
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [sameScopeInFlightSaveCount, setSameScopeInFlightSaveCount] = useState(0);
  const [refreshingAuthoritativeDocument, setRefreshingAuthoritativeDocument] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [documentState, setDocumentState] = useState<DocumentLoadState>({ status: "loading" });
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const safeContext = legacyCanvasContextSchema.parse(context);
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
    const target = pendingNavigationRef.current;
    if (!target || dirtyRef.current || savingRef.current > 0) return;
    pendingNavigationRef.current = null;
    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
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
  }, [location.hash, location.pathname, location.search, navigate, onLogout, safeContext.workspaceId]);

  const queueNavigation = useCallback((target: NavigationTarget): void => {
    pendingNavigationRef.current = target;
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
      context: safeContext,
    });
    postToCanvas(message);
    postToCanvas(hostDocumentMessageSchema.parse({
      source: "reelay-shell",
      type: "host:document",
      protocolVersion: 1,
      document: documentState.document,
      writable: safeContext.writable,
    }));
    setPersistenceStatus(savingRef.current > 0
      ? "saving"
      : (dirtyRef.current ? "dirty" : "saved"));
  }, [documentState, postToCanvas, safeContext]);

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
    if (navigationTimeoutRef.current !== null) {
      window.clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    setDocumentState({ status: "loading" });
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
    return () => {
      active = false;
      if (navigationTimeoutRef.current !== null) window.clearTimeout(navigationTimeoutRef.current);
    };
  }, [loadAttempt, repository, safeContext.canvasId, safeContext.projectId]);

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
      initializedReadyGenerationRef.current === readyGeneration
    ) return;
    const instanceId = activeCanvasInstanceIdRef.current;
    if (!instanceId) return;
    initializedReadyGenerationRef.current = readyGeneration;
    sendInit(instanceId);
  }, [documentState.status, readyGeneration, refreshingAuthoritativeDocument, sameScopeInFlightSaveCount, sendInit]);

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
      if (message.type === "canvas:dirty") {
        dirtyRef.current = message.dirty;
        setPersistenceStatus(message.dirty
          ? (savingRef.current > 0 ? "saving" : "dirty")
          : (savingRef.current > 0 ? "saving" : "saved"));
        if (!message.dirty) finishPendingNavigation();
        return;
      }
      if (message.type === "canvas:navigate") {
        queueNavigation(message.target);
        return;
      }
      if (message.type === "canvas:open-account") {
        onOpenAccountSettings?.();
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
  }, [finishPendingNavigation, onOpenAccountSettings, postToCanvas, queueNavigation, refreshAuthoritativeDocument, repository, safeContext.canvasId, safeContext.projectId, safeContext.writable]);

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
