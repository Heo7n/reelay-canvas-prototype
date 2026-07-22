import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CanvasDocumentRepository } from "../application/canvases/CanvasDocumentRepository";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import { HttpRequestError } from "../infrastructure/http/HttpApiClient";
import {
  hostDocumentMessageSchema,
  hostMessageSchema,
  hostSaveErrorMessageSchema,
  hostSaveResultMessageSchema,
  legacyCanvasContextSchema,
  parseCanvasMessage,
  type LegacyCanvasContext,
} from "./bridge-protocol";

interface CanvasHostProps {
  context: LegacyCanvasContext;
  repository: CanvasDocumentRepository;
}

type DocumentLoadState =
  | { status: "loading" }
  | { status: "ready"; document: CanvasDocument | null }
  | { status: "error" };

export function CanvasHost({ context, repository }: CanvasHostProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const initSentForLoadRef = useRef(0);
  const [frameLoad, setFrameLoad] = useState(0);
  const [documentState, setDocumentState] = useState<DocumentLoadState>({ status: "loading" });
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
    setDocumentState({ status: "loading" });
    void repository.getCanvasDocument(safeContext.projectId, safeContext.canvasId).then(
      (document) => {
        if (active) setDocumentState({ status: "ready", document });
      },
      () => {
        if (active) setDocumentState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [repository, safeContext.canvasId, safeContext.projectId]);

  useEffect(() => {
    if (frameLoad === 0 || documentState.status !== "ready" || initSentForLoadRef.current === frameLoad) return;
    initSentForLoadRef.current = frameLoad;
    sendInit();
  }, [documentState.status, frameLoad, sendInit]);

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
        sendInit();
        return;
      }
      if (message.type !== "canvas:save") return;

      if (!safeContext.writable) {
        sendSaveError(message.requestId, "forbidden");
        return;
      }

      void repository.save({
        projectId: safeContext.projectId,
        canvasId: safeContext.canvasId,
        schemaVersion: message.schemaVersion,
        expectedRevision: message.expectedRevision,
        content: message.content,
      }).then(
        (savedDocument) => {
          setDocumentState({ status: "ready", document: savedDocument });
          postToCanvas(hostSaveResultMessageSchema.parse({
            source: "reelay-shell",
            type: "host:save-result",
            protocolVersion: 1,
            requestId: message.requestId,
            document: savedDocument,
          }));
        },
        (error: unknown) => {
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
  }, [postToCanvas, repository, safeContext.canvasId, safeContext.projectId, safeContext.writable, sendInit]);

  return (
    <section className="legacy-canvas-host" aria-label="Reelay 项目画布">
      <iframe
        ref={frameRef}
        className="legacy-canvas-frame"
        src={frameSource}
        title="Reelay 项目画布"
        onLoad={() => setFrameLoad((value) => value + 1)}
      />
      {documentState.status === "error" ? (
        <p className="legacy-canvas-error" role="alert">暂时无法加载此项目画布，请稍后重试。</p>
      ) : null}
    </section>
  );
}
