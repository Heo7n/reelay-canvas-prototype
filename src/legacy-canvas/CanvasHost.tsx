import { useEffect, useMemo, useRef } from "react";
import { hostMessageSchema, legacyCanvasContextSchema, parseCanvasMessage, type LegacyCanvasContext } from "./bridge-protocol";

interface CanvasHostProps {
  context: LegacyCanvasContext;
}

export function CanvasHost({ context }: CanvasHostProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const safeContext = legacyCanvasContextSchema.parse(context);
  const frameSource = useMemo(() => {
    const query = new URLSearchParams({
      workspaceId: safeContext.workspaceId,
      projectId: safeContext.projectId,
      canvasId: safeContext.canvasId,
    });
    return `/index.html?${query.toString()}`;
  }, [safeContext.canvasId, safeContext.projectId, safeContext.workspaceId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      parseCanvasMessage(event.data);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const sendContext = () => {
    const message = hostMessageSchema.parse({
      source: "reelay-shell",
      type: "host:init",
      context: safeContext,
    });
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  };

  return (
    <section className="legacy-canvas-host" aria-label="Reelay 项目画布">
      <iframe ref={frameRef} className="legacy-canvas-frame" src={frameSource} title="Reelay 项目画布" onLoad={sendContext} />
    </section>
  );
}
