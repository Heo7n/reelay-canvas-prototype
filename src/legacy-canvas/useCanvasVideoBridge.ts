import { useEffect, useRef, useState, type RefObject } from "react";
import { z } from "zod";
import type { CanvasVideoGateway, CanvasVideoScope } from "../application/generation/CanvasVideoGateway";
import { ApplicationError, isApplicationError } from "../application/shared/ApplicationError";
import { PrepareCanvasVideoTaskSchema } from "../contracts/canvas-video-generation";
import { SeedanceVideoParametersSchema } from "../contracts/seedance-video";
import type { CanvasVideoGenerationContext, CanvasVideoTask, CanvasVideoTaskProjection } from "../domain/generation/canvas-video-task";
import type { CanvasVideoProjectSelection } from "./CanvasVideoProjectDialog";
import { hostVideoGenerationBindSchema, hostVideoGenerationContextSchema, hostVideoGenerationErrorSchema, hostVideoGenerationResultSchema, parseCanvasMessage, type CanvasVideoGenerationCommand, type LegacyCanvasContext } from "./bridge-protocol";

interface Options {
  gateway?: CanvasVideoGateway;
  context: LegacyCanvasContext;
  actorId?: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  activeInstanceRef: RefObject<string | null>;
  readyGeneration: number;
  post(message: unknown): void;
}

function assertScope<T extends CanvasVideoTask | CanvasVideoTaskProjection>(task: T, scope: CanvasVideoScope, taskId?: string): T {
  if (task.projectId !== scope.projectId || task.canvasDocumentId !== scope.canvasDocumentId
    || (taskId !== undefined && task.id !== taskId)
    || (task.result && (task.result.taskId !== task.id || task.result.projectId !== scope.projectId
      || task.result.url !== `/api/projects/${encodeURIComponent(scope.projectId)}/generation-results/${task.result.id}/video`))) {
    throw new ApplicationError("forbidden", "生成任务不属于当前画布。");
  }
  return task;
}

function errorFeedback(error: unknown): { code: string; message: string } {
  if (error instanceof z.ZodError) return { code: "unsupported", message: error.issues[0]?.path[0] === "references"
    ? "参考素材暂未接入真实生成。" : error.issues[0]?.message.slice(0, 500) || "当前参数暂不支持真实生成。" };
  if (isApplicationError(error)) return { code: error.serviceCode || error.code, message: error.message.slice(0, 500) || "真实生成请求失败，请重试读取状态。" };
  return { code: "request_failed", message: "真实生成请求失败，请重试读取状态。" };
}

/** The instance and route scope remain the authority throughout prepare → durable bind → activate. */
export function useCanvasVideoBridge({ gateway, context, actorId, frameRef, activeInstanceRef, readyGeneration, post }: Options) {
  const [selection, setSelection] = useState<CanvasVideoProjectSelection | null>(null);
  const currentRef = useRef({ context, actorId });
  currentRef.current = { context, actorId };
  useEffect(() => {
    if (!gateway || !actorId || readyGeneration === 0) return;
    let active = true;
    const scope = { projectId: context.projectId, canvasDocumentId: context.canvasId, expectedActorId: actorId };
    const instanceId = activeInstanceRef.current;
    if (!instanceId) return;
    const frameWindow = frameRef.current?.contentWindow;
    const pending = new Map<string, { taskId: string; finish(bound: boolean): void }>();
    const commands = new Map<string, { fingerprint: string; response?: unknown; submissionState?: "not-submitted" | "unknown" }>();
    let cancelSelection: (() => void) | null = null;
    let submitQueue: Promise<void> = Promise.resolve();
    let contextReadVersion = 0;
    const current = (writable = false) => active && frameWindow === frameRef.current?.contentWindow
      && instanceId === activeInstanceRef.current && currentRef.current.actorId === actorId
      && currentRef.current.context.projectId === scope.projectId
      && currentRef.current.context.canvasId === scope.canvasDocumentId
      && (!writable || currentRef.current.context.writable);
    const base = { source: "reelay-shell", protocolVersion: 1, instanceId };
    const sendError = (requestId: string, operation: CanvasVideoGenerationCommand["operation"], error: unknown,
      submissionState?: "not-submitted" | "unknown") => {
      const response = hostVideoGenerationErrorSchema.parse({ ...base, type: "host:video-generation-error", requestId, operation,
        ...errorFeedback(error), ...(operation === "submit" ? { submissionState: submissionState || "not-submitted" } : {}) });
      const record = commands.get(requestId);
      if (record && operation === "submit") record.response = response;
      else commands.delete(requestId);
      if (current()) post(response);
    };
    const publishContext = (value: CanvasVideoGenerationContext) => {
      if (value.kind === "real" && value.binding && value.binding.projectId !== scope.projectId) {
        throw new ApplicationError("forbidden", "官网项目关联不属于当前项目。");
      }
      if (current()) post(hostVideoGenerationContextSchema.parse({ ...base, type: "host:video-generation-context", context: value }));
    };
    const readContext = async () => {
      const version = ++contextReadVersion;
      const value = await gateway.getContext(scope.projectId, actorId);
      if (value.kind === "real" && value.binding && value.binding.projectId !== scope.projectId) {
        throw new ApplicationError("forbidden", "官网项目关联不属于当前项目。");
      }
      if (version === contextReadVersion) publishContext(value);
      return value;
    };
    const refreshContext = () => {
      const version = contextReadVersion + 1;
      void readContext().catch((error: unknown) => { if (version === contextReadVersion) sendError("context-initial", "context", error); });
    };
    refreshContext();

    const chooseProject = (requestId: string, generationContext: Extract<CanvasVideoGenerationContext, { kind: "real" }>) => new Promise<boolean>((resolve) => {
      const finish = (chosen: boolean) => {
        cancelSelection = null;
        if (current()) setSelection(null);
        resolve(chosen);
      };
      cancelSelection = () => finish(false);
      setSelection({
        requestId, accountName: generationContext.platformUser.displayName, localProjectName: context.projectName,
        loadProjects: (page) => {
          if (!current()) return Promise.reject(new ApplicationError("authentication_required", "本机账号已变化，请重新打开画布。"));
          return gateway.listProjects(actorId, page);
        },
        cancel: () => finish(false),
        confirm: async (platformProjectId) => {
          if (!current(true)) { finish(false); return; }
          const fresh = await readContext();
          if (!current(true)) { finish(false); return; }
          if (fresh.kind !== "real" || fresh.platformUser.id !== generationContext.platformUser.id) {
            throw new ApplicationError("conflict", "生成连接已变化，请取消并重新发送。");
          }
          const binding = await gateway.bindProject(scope.projectId, platformProjectId, actorId);
          if (!current(true)) { finish(false); return; }
          if (binding.projectId !== scope.projectId || binding.platformProjectId !== platformProjectId) {
            throw new ApplicationError("forbidden", "官网项目关联不属于当前项目。");
          }
          publishContext({ ...fresh, binding });
          finish(true);
        },
      });
    });

    const waitForBinding = (requestId: string, task: CanvasVideoTask) => new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => { pending.delete(requestId); resolve(false); }, 30_000);
      pending.set(requestId, { taskId: task.id, finish: (bound) => {
        window.clearTimeout(timer); pending.delete(requestId); resolve(bound);
      } });
      post(hostVideoGenerationBindSchema.parse({ ...base, type: "host:video-generation-bind", requestId, task }));
    });

    const execute = async (command: CanvasVideoGenerationCommand) => {
      let submissionState: "not-submitted" | "unknown" = "not-submitted";
      try {
        if (!current()) return;
        let result: CanvasVideoGenerationContext | CanvasVideoTask | CanvasVideoTaskProjection | { tasks: CanvasVideoTask[] };
        switch (command.operation) {
          case "context":
            result = await readContext();
            break;
          case "submit": {
            if (!current(true)) throw new ApplicationError("forbidden", "当前项目为只读，无法生成。");
            const fresh = await readContext();
            if (!current(true)) return;
            if (fresh.kind === "simulation") { result = fresh; break; }
            if (fresh.kind === "blocked") throw new ApplicationError("authentication_required", "生成连接已失效，请重新连接后再发送。");
            const input = PrepareCanvasVideoTaskSchema.parse({
              requestKey: command.requestKey, ...scope, canvasRecordId: command.canvasRecordId, nodeId: command.nodeId,
              sourceSurface: command.sourceSurface, ...(command.conversationId ? { conversationId: command.conversationId } : {}),
              prompt: command.prompt, parameters: command.parameters, references: command.references,
            });
            if (!fresh.binding && !await chooseProject(command.requestId, fresh)) {
              if (!current()) return;
              throw new ApplicationError("request_failed", "已取消此次真实生成。", { serviceCode: "cancelled" });
            }
            if (!current(true)) return;
            const prepared = assertScope(await gateway.prepare(input), scope);
            if (!current(true)) return;
            if (prepared.requestKey !== input.requestKey || prepared.canvasRecordId !== input.canvasRecordId
              || prepared.nodeId !== input.nodeId || prepared.sourceSurface !== input.sourceSurface
              || prepared.conversationId !== (input.conversationId || null) || prepared.prompt !== input.prompt
              || JSON.stringify(SeedanceVideoParametersSchema.parse(prepared.parameters)) !== JSON.stringify(input.parameters)) {
              throw new ApplicationError("conflict", "任务身份与当前发送不匹配。");
            }
            // A repeated request can observe an already activated task without charging again.
            if (prepared.status !== "prepared") { submissionState = "unknown"; result = prepared; break; }
            const bound = await waitForBinding(command.requestId, prepared);
            if (!current(true)) return;
            if (!bound) throw new ApplicationError("request_failed", "任务已准备，画布关联尚未保存；没有开始生成。", { serviceCode: "task_not_bound" });
            // From this point a failed transport cannot establish whether the server activated the task.
            submissionState = "unknown";
            const record = commands.get(command.requestId);
            if (record) record.submissionState = submissionState;
            result = assertScope(await gateway.activate(prepared.id, scope), scope, prepared.id);
            break;
          }
          case "get": result = assertScope(await gateway.get(command.taskId, scope), scope, command.taskId); break;
          case "projection": result = assertScope(await gateway.getProjection(command.taskId, scope), scope, command.taskId); break;
          case "list": {
            result = await gateway.list(scope);
            result.tasks.forEach((task) => assertScope(task, scope));
            break;
          }
          case "retry-save":
            if (!current(true)) throw new ApplicationError("forbidden", "当前项目为只读，无法保存生成结果。");
            result = assertScope(await gateway.retrySave(command.taskId, scope), scope, command.taskId);
            break;
        }
        if (!current()) return;
        const response = hostVideoGenerationResultSchema.parse({ ...base, type: "host:video-generation-result", requestId: command.requestId, operation: command.operation, result });
        const record = commands.get(command.requestId);
        if (record && command.operation === "submit") record.response = response;
        else commands.delete(command.requestId);
        post(response);
      } catch (error: unknown) { sendError(command.requestId, command.operation, error, submissionState); }
    };

    const receive = (event: MessageEvent<unknown>) => {
      if (!current() || event.origin !== window.location.origin || event.source !== frameWindow) return;
      const message = parseCanvasMessage(event.data);
      if (!message || message.instanceId !== instanceId) return;
      if (message.type === "canvas:video-generation-bound") {
        const binding = pending.get(message.requestId);
        if (binding?.taskId === message.taskId) binding.finish(message.bound);
        return;
      }
      if (message.type !== "canvas:video-generation-command") return;
      const fingerprint = JSON.stringify(message);
      const previous = commands.get(message.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          if (current()) post(hostVideoGenerationErrorSchema.parse({ ...base, type: "host:video-generation-error", requestId: message.requestId,
            operation: message.operation, code: "request_conflict", message: "同一请求编号不能用于不同操作。",
            ...(message.operation === "submit" ? { submissionState: previous.submissionState || "not-submitted" } : {}) }));
        } else if (previous.response) post(previous.response);
        return;
      }
      commands.set(message.requestId, { fingerprint });
      if (message.operation === "submit") submitQueue = submitQueue.then(() => execute(message));
      else void execute(message);
    };
    window.addEventListener("message", receive);
    window.addEventListener("reelay:generation-connection-changed", refreshContext);
    return () => {
      active = false;
      pending.forEach((binding) => binding.finish(false));
      cancelSelection?.();
      setSelection(null);
      window.removeEventListener("message", receive);
      window.removeEventListener("reelay:generation-connection-changed", refreshContext);
    };
  }, [gateway, actorId, context.projectId, context.canvasId, context.projectName, context.writable, frameRef, activeInstanceRef, readyGeneration, post]);
  return selection;
}
