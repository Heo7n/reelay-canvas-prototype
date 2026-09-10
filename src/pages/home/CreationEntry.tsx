import { ArrowUp, LoaderCircle } from "lucide-react";
import { Form, useNavigation } from "react-router-dom";
import { useState, type FormEvent } from "react";

import { PromptExamples } from "./PromptExamples";
import styles from "./CreationEntry.module.css";

interface CreationEntryProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onRequestLogin?: () => void;
  paused?: boolean;
}

export function CreationEntry(props: CreationEntryProps) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const creating = navigation.formData?.get("intent") === "create";
  const [focused, setFocused] = useState(false);
  const { onRequestLogin } = props;

  function submit(event: FormEvent<HTMLFormElement>): void {
    if (busy) {
      event.preventDefault();
      return;
    }
    if (onRequestLogin) {
      event.preventDefault();
      onRequestLogin();
    }
  }

  return (
    <Form method="post" onSubmit={submit} className={styles.composer} aria-busy={busy}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <input type="hidden" name="intent" value="create" />
        <div className={styles.field}>
          <label className={styles.srOnly} htmlFor="creation-prompt">描述你的创作需求</label>
          <textarea id="creation-prompt" name="prompt" rows={3} maxLength={600} value={props.prompt} readOnly={busy}
            aria-describedby="creation-prompt-help"
            placeholder={focused ? "描述你想生成的画面、角色或镜头…" : ""}
            onChange={(event) => props.onPromptChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} />
          {!props.prompt && !focused ? <div className={styles.examples}><PromptExamples active={!busy && !props.paused} /></div> : null}
        </div>
        <span className={styles.srOnly} id="creation-prompt-help">可留空新建项目。输入的描述会带入新项目，不会自动开始生成。Enter 新建项目，Shift + Enter 换行。</span>
      <div className={styles.toolbar}>
        {props.prompt.length > 480 ? <span className={styles.count}>{props.prompt.length}/600</span> : null}
        <button type="submit" className={styles.submit} disabled={busy} aria-label={onRequestLogin ? "登录后新建项目" : "新建项目"}>
          <span>{busy ? creating ? "正在创建…" : "正在打开…" : "新建项目"}</span>
          {busy ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </button>
      </div>
    </Form>
  );
}
