import { ArrowUp, Box, Image, Plus, Sparkles } from "lucide-react";
import { Form } from "react-router-dom";

import styles from "./WorkspacePages.module.css";

interface CreationComposerProps {
  onNotice: (message: string) => void;
  onPromptChange: (prompt: string) => void;
  prompt: string;
  workspaceId: string;
}

const launchIntentKey = "reelay-home-launch-intent";

export function CreationComposer({ onNotice, onPromptChange, prompt, workspaceId }: CreationComposerProps) {
  function preservePrompt(): void {
    try {
      window.sessionStorage.setItem(launchIntentKey, prompt.trim());
    } catch {
      // The project can still open if session storage is unavailable.
    }
  }

  return (
    <Form className={styles.composer} method="post" onSubmit={preservePrompt}>
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="workspaceId" value={workspaceId} />
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
            event.currentTarget.form?.requestSubmit();
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
        <button className={styles.composerSubmit} type="submit" aria-label="带着创作需求创建项目" disabled={!prompt.trim()}>
          <ArrowUp aria-hidden="true" />
        </button>
      </div>
    </Form>
  );
}
