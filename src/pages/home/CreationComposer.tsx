import { ArrowUp, Box, Image, Plus, Sparkles } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { useFetcher, useNavigate, useParams } from "react-router-dom";

import { routePaths } from "../../app/routes";
import type { WorkspaceActionData } from "../../app/route-data";
import styles from "./WorkspacePages.module.css";

interface CreationComposerProps {
  disabled?: boolean;
  onNotice: (message: string) => void;
  onPromptChange: (prompt: string) => void;
  prompt: string;
}

const launchIntentKey = "reelay-home-launch-intent";

export function CreationComposer({ disabled = false, onNotice, onPromptChange, prompt }: CreationComposerProps) {
  const fetcher = useFetcher<WorkspaceActionData>();
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const submittedPromptRef = useRef("");
  const handledProjectIdRef = useRef<string | null>(null);
  const isSubmitting = fetcher.state !== "idle";
  const creationBusy = disabled || isSubmitting;

  function clearLaunchIntent(): void {
    try {
      window.sessionStorage.removeItem(launchIntentKey);
    } catch {
      // The prompt launch can still be retried if session storage is unavailable.
    }
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>): void {
    const submittedPrompt = prompt.trim();
    clearLaunchIntent();
    if (!submittedPrompt || creationBusy) {
      event.preventDefault();
      if (!submittedPrompt) onNotice("请先输入创作需求。");
      return;
    }

    submittedPromptRef.current = submittedPrompt;
    handledProjectIdRef.current = null;
  }

  useEffect(() => {
    const actionData = fetcher.data;
    if (!actionData) return;

    if (actionData.error) {
      submittedPromptRef.current = "";
      clearLaunchIntent();
      onNotice(actionData.error);
      return;
    }

    const projectId = actionData.projectId;
    if (!projectId || handledProjectIdRef.current === projectId) return;

    const submittedPrompt = submittedPromptRef.current;
    if (!workspaceId || !submittedPrompt) {
      clearLaunchIntent();
      onNotice("项目已创建，但创作需求交接失败，请从项目列表重新进入。");
      return;
    }

    handledProjectIdRef.current = projectId;
    try {
      window.sessionStorage.setItem(launchIntentKey, JSON.stringify({
        version: 1,
        workspaceId,
        projectId,
        prompt: submittedPrompt,
      }));
    } catch {
      // The newly created project can still open if session storage is unavailable.
    }
    navigate(routePaths.canvas(workspaceId, projectId, "main"));
  }, [fetcher.data, navigate, onNotice, workspaceId]);

  return (
    <fetcher.Form className={styles.composer} method="post" aria-busy={creationBusy} onSubmit={submitPrompt}>
      <input type="hidden" name="intent" value="launch-from-prompt" />
      <label className={styles.srOnly} htmlFor="creation-prompt">描述你的创作需求</label>
      <textarea
        id="creation-prompt"
        name="prompt"
        rows={2}
        maxLength={600}
        value={prompt}
        placeholder="输入你的创作需求，或选择下方能力开始"
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!prompt.trim()) {
              clearLaunchIntent();
              onNotice("请先输入创作需求。");
              return;
            }
            if (!creationBusy) event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className={styles.composerToolbar}>
        <div className={styles.composerTools} aria-label="添加创作输入">
          <button type="button" aria-label="添加素材" onClick={() => onNotice("主页素材添加尚未接入，请进入画布后添加。") }><Plus aria-hidden="true" /></button>
          <button type="button" aria-label="从模板开始" onClick={() => onNotice("模板中心尚未接入，当前可直接描述创作需求。") }><Box aria-hidden="true" /></button>
          <button type="button" aria-label="添加图片" onClick={() => onNotice("图片上传将在资产持久化阶段接入。") }><Image aria-hidden="true" /></button>
          <button type="button" aria-label="使用 Reelay Agent" onClick={() => onNotice("Reelay Agent 主页入口将在后续接入。") }><Sparkles aria-hidden="true" /></button>
        </div>
        <button className={styles.composerSubmit} type="submit" aria-label="带着创作需求创建项目" disabled={!prompt.trim() || creationBusy}>
          <ArrowUp aria-hidden="true" />
        </button>
      </div>
    </fetcher.Form>
  );
}
