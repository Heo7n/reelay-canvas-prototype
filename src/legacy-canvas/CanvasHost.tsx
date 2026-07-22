import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CanvasDocumentRepository } from "../application/canvases/CanvasDocumentRepository";
import { routePaths } from "../app/routes";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import { HttpRequestError } from "../infrastructure/http/HttpApiClient";
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
  repository: CanvasDocumentRepository;
}

type DocumentLoadState =
  | { status: "loading" }
  | { status: "ready"; document: CanvasDocument | null }
  | { status: "error" };

type PersistenceStatus = "loading" | "saved" | "dirty" | "saving" | "error";
type NavigationTarget = "home" | "projects" | "logout";

export function CanvasHost({ context, onLogout, repository }: CanvasHostProps) {
  const navigate = useNavigate();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const initializedReadyGenerationRef = useRef(0);
  const dirtyRef = useRef(false);
  const savingRef = useRef(0);
  const pendingNavigationRef = useRef<NavigationTarget | null>(null);
  const navigationTimeoutRef = useRef<number | null>(null);
  const [readyGeneration, setReadyGeneration] = useState(0);
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
    navigate(target === "home"
      ? routePaths.workspaceHome(safeContext.workspaceId)
      : routePaths.projects(safeContext.workspaceId));
  }, [navigate, onLogout, safeContext.workspaceId]);

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

  const sendInit = useCallback((): void => {
    if (documentState.status !== "ready") return;
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
  }, [documentState, postToCanvas, safeContext]);

  useEffect(() => {
    let active = true;
    initializedReadyGenerationRef.current = 0;
    setReadyGeneration(0);
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
          setDocumentState({ status: "ready", document });
          setPersistenceStatus("saved");
        }
      },
      () => {
        if (active) {
          setDocumentState({ status: "error" });
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
      documentState.status !== "ready" ||
      initializedReadyGenerationRef.current === readyGeneration
    ) return;
    initializedReadyGenerationRef.current = readyGeneration;
    sendInit();
  }, [documentState.status, readyGeneration, sendInit]);

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
    const sendSaveError = (requestId: string, code: "conflict" | "forbidden" | "network"): void => {
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
        setReadyGeneration((generation) => generation + 1);
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
        queueNavigation(message.target);
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
      setPersistenceStatus("saving");
      void repository.save({
        projectId: safeContext.projectId,
        canvasId: safeContext.canvasId,
        schemaVersion: message.schemaVersion,
        expectedRevision: message.expectedRevision,
        content: message.content,
      }).then(
        (savedDocument) => {
          savingRef.current = Math.max(0, savingRef.current - 1);
          setDocumentState({ status: "ready", document: savedDocument });
          setPersistenceStatus(dirtyRef.current ? "dirty" : "saved");
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
          savingRef.current = Math.max(0, savingRef.current - 1);
          setPersistenceStatus("error");
          pendingNavigationRef.current = null;
          if (navigationTimeoutRef.current !== null) {
            window.clearTimeout(navigationTimeoutRef.current);
            navigationTimeoutRef.current = null;
          }
          if (error instanceof HttpRequestError && error.status === 409) {
            sendSaveError(message.requestId, "conflict");
            return;
          }
          if (error instanceof HttpRequestError && error.status === 403) {
            sendSaveError(message.requestId, "forbidden");
            return;
          }
          sendSaveError(message.requestId, "network");
        },
      );
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [finishPendingNavigation, postToCanvas, queueNavigation, repository, safeContext.canvasId, safeContext.projectId, safeContext.writable]);

  return (
    <section
      className="legacy-canvas-host"
      aria-label="Reelay 项目画布"
      data-persistence-status={persistenceStatus}
    >
      {documentState.status === "ready" ? (
        <iframe
          ref={frameRef}
          className="legacy-canvas-frame"
          src={frameSource}
          title="Reelay 项目画布"
        />
      ) : (
        <div className="legacy-canvas-state" role={documentState.status === "error" ? "alert" : "status"}>
          {documentState.status === "error" ? (
            <div className="legacy-canvas-state-card">
              <strong>暂时无法加载此项目画布</strong>
              <span>画布已停止交互，重试成功前不会写入任何内容。</span>
              <button type="button" onClick={retryDocumentLoad}>重试加载</button>
            </div>
          ) : (
            <span>正在加载项目画布…</span>
          )}
        </div>
      )}
    </section>
  );
}
