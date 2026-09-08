import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router-dom";

import type { WorkspaceActionData } from "../../app/route-data";
import type { ProjectSummary } from "../../domain/project/project";
import styles from "./ProjectCard.module.css";

interface ProjectNameEditorProps {
  project: ProjectSummary;
  onClose: (restoreFocus: boolean) => void;
}

export function ProjectNameEditor({ project, onClose }: ProjectNameEditorProps) {
  const fetcher = useFetcher<WorkspaceActionData>();
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const closing = useRef(false);
  const composing = useRef(false);
  const errorId = useId();
  const [error, setError] = useState("");
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!pending.current || fetcher.state !== "idle") return;
    pending.current = false;
    if (fetcher.data?.ok) {
      closing.current = true;
      onClose(document.activeElement === inputRef.current);
    } else {
      setError(fetcher.data?.error ?? "项目名称保存失败，请重试。");
    }
  }, [fetcher.state, fetcher.data, onClose]);

  function save(): void {
    if (pending.current || closing.current || composing.current) return;
    const name = inputRef.current?.value.trim() ?? "";
    if (!name) {
      setError("项目名称不能为空。");
      return;
    }
    if (name === project.name) {
      closing.current = true;
      onClose(document.activeElement === inputRef.current);
      return;
    }
    pending.current = true;
    setError("");
    void fetcher.submit({ intent: "rename", projectId: project.id, name }, { method: "post" });
  }

  return (
    <form className={styles.renameForm} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); save(); }}>
      <input
        ref={inputRef}
        name="name"
        defaultValue={project.name}
        maxLength={100}
        readOnly={busy}
        aria-label="项目名称"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={() => setError("")}
        onBlur={() => { if (!error) save(); }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) save();
          }
          if (event.key === "Escape" && !pending.current && !composing.current && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            closing.current = true;
            onClose(true);
          }
        }}
      />
      {error ? <span id={errorId} className={styles.renameError} role="alert">{error}</span> : null}
    </form>
  );
}
