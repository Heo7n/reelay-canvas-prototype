import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionGateway } from "../application/session/SessionGateway";
import type { ProjectRepository } from "../application/projects/ProjectRepository";
import type { CanvasDocumentRepository } from "../application/canvases/CanvasDocumentRepository";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import { ApplicationError, isApplicationError } from "../application/shared/ApplicationError";
import { appendRecoveryCopies, createRecoveryCopies } from "./canvas-recovery-copy";
import { hostRecoveryMessageSchema, type CanvasMessage, type LegacyCanvasContext } from "./bridge-protocol";

export interface CanvasRecoveryServices {
  sessionGateway: SessionGateway;
  projectRepository: ProjectRepository;
}
type Snapshot = Extract<CanvasMessage, { type: "canvas:recovery-snapshot" }>;
type RecoveryReason = "authentication" | "conflict";
interface Recovery {
  reason: RecoveryReason;
  requestId: string;
  instanceId: string;
  snapshot: Snapshot | null;
  busy: boolean;
  error: string;
  copies: ReturnType<typeof createRecoveryCopies> | null;
}
interface Options {
  context: LegacyCanvasContext;
  actorId?: string;
  services?: CanvasRecoveryServices;
  repository: CanvasDocumentRepository;
  post: (message: unknown) => void;
  onRecovered: (document: CanvasDocument | null, writable: boolean, resumed: boolean) => void;
}

export function useCanvasSaveRecovery(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<Recovery | null>(null);
  const [state, setState] = useState<Recovery | null>(null);
  const operation = useRef(0);
  const pendingApply = useRef<{ recovery: Recovery; document: CanvasDocument | null; writable: boolean; resumed: boolean } | null>(null);
  const publish = useCallback((value: Recovery | null) => { current.current = value; setState(value); }, []);
  const reset = useCallback(() => { operation.current += 1; pendingApply.current = null; publish(null); }, [publish]);
  const { projectId, canvasId, workspaceId } = options.context;
  useEffect(() => { reset(); return () => { operation.current += 1; current.current = null; }; }, [projectId, canvasId, workspaceId, options.actorId, reset]);

  const begin = useCallback((reason: RecoveryReason, requestId: string, instanceId: string) => {
    operation.current += 1;
    pendingApply.current = null;
    publish({ reason, requestId, instanceId, snapshot: null, copies: null, busy: false, error: "" });
  }, [publish]);

  const accept = useCallback((message: CanvasMessage): boolean => {
    if (message.type !== "canvas:recovery-snapshot" && message.type !== "canvas:recovery-applied") return false;
    const recovery = current.current;
    const scope = latest.current.context;
    if (!recovery || message.requestId !== recovery.requestId || message.instanceId !== recovery.instanceId
      || message.projectId !== scope.projectId || message.canvasId !== scope.canvasId) return true;
    if (message.type === "canvas:recovery-snapshot") {
      if (recovery.snapshot) return true;
      try { publish({ ...recovery, snapshot: message, copies: createRecoveryCopies(message.content) }); }
      catch (error) { publish({ ...recovery, error: error instanceof Error ? error.message : "无法读取恢复副本。" }); }
    } else {
      const applied = pendingApply.current;
      if (!applied || applied.recovery.requestId !== recovery.requestId) return true;
      pendingApply.current = null;
      if (message.applied) {
        latest.current.onRecovered(applied.document, applied.writable, applied.resumed);
        reset();
      } else publish({ ...recovery, busy: false, error: "画布未能恢复，当前修改仍保留在此页面，请重试。" });
    }
    return true;
  }, [publish, reset]);

  const run = useCallback(async (action: "authenticate" | "copy" | "latest", password = "") => {
    const recovery = current.current;
    if (!recovery?.snapshot || recovery.busy) return;
    const token = ++operation.current;
    const { services, actorId, context, repository, post } = latest.current;
    const active = () => token === operation.current && current.current?.requestId === recovery.requestId;
    const checkActive = () => { if (!active()) throw new Error("恢复作用域已变更。"); };
    publish({ ...recovery, busy: true, error: "" });
    try {
      if (!services || !actorId) throw new Error("当前入口无法验证账号，请保留此页面并联系管理员。");
      if (action === "authenticate" && password) {
        const session = await services.sessionGateway.signInWithPassword({ account: context.actor.account, password });
        checkActive();
        if (session.actor?.id !== actorId) throw new ApplicationError("authentication_required", "请使用原账号继续；不会将当前修改保存到其他账号。");
      }
      const verifyActor = async () => {
        const session = await services.sessionGateway.getCurrent();
        checkActive();
        if (!session.actor) throw new ApplicationError("authentication_required", "登录已失效，请重新登录原账号。");
        if (session.actor.id !== actorId || !session.actor.workspaceIds.includes(context.workspaceId)) {
          throw new ApplicationError("authentication_required", "请使用原账号继续；不会将当前修改保存到其他账号。");
        }
      };
      await verifyActor();
      const project = await services.projectRepository.getById(context.workspaceId, context.projectId);
      checkActive();
      if (!project || project.workspaceId !== context.workspaceId) throw new Error("当前项目已删除或不可访问。修改仍保留在此页面。");
      const writable = project.currentUserRole === "admin" || project.currentUserRole === "edit";
      if (action !== "latest" && !writable) throw new Error("当前账号已无编辑权限。可以保留此页面，或确认放弃后加载最新只读版本。");
      const document = await repository.getCanvasDocument(context.projectId, context.canvasId);
      checkActive();
      if (document && (document.projectId !== context.projectId || document.id !== context.canvasId)) throw new Error("恢复文档的归属不匹配。");
      await verifyActor();
      let result = document;
      let resumed = false;
      if (action === "authenticate") {
        if ((document?.revision || 0) !== recovery.snapshot.expectedRevision) {
          publish({ ...recovery, reason: "conflict", busy: false, error: "登录已恢复，但画布已有新版本。请保存为副本或加载最新版本。" });
          return;
        }
        resumed = true;
      } else if (action === "copy") {
        if (!document || !recovery.copies) throw new Error("当前画布无法安全建立副本，修改仍保留在此页面。");
        const copy = appendRecoveryCopies(document.content, recovery.copies);
        if (!copy.alreadySaved) {
          result = await repository.save({ expectedActorId: actorId, projectId: context.projectId, canvasId: context.canvasId,
            schemaVersion: document.schemaVersion, expectedRevision: document.revision, content: copy.content });
          checkActive();
          await verifyActor();
        } else result = document;
      } else if (!document) throw new Error("线上尚无已保存画布，当前修改仍保留在此页面。");
      checkActive();
      pendingApply.current = { recovery, document: result, writable, resumed };
      post(hostRecoveryMessageSchema.parse({ source: "reelay-shell", type: "host:recovery", protocolVersion: 1,
        instanceId: recovery.instanceId, requestId: recovery.requestId, projectId: context.projectId, canvasId: context.canvasId,
        action: resumed ? "resume" : "replace", document: result, writable }));
    } catch (error) {
      if (!active()) return;
      const authentication = isApplicationError(error, "authentication_required");
      const conflict = isApplicationError(error, "conflict");
      publish({ ...recovery, reason: authentication ? "authentication" : recovery.reason, busy: false,
        error: conflict ? "画布又有新版本，当前修改仍保留。请再次保存为副本。"
          : error instanceof Error ? error.message : "恢复暂未完成，当前修改仍保留，请重试。" });
    }
  }, [publish]);

  return { state, begin, accept, reset, run };
}
