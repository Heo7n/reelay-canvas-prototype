import { useEffect, useId, useRef, useState } from "react";
import type { PlatformContainerPage } from "../domain/generation/real-generation";
import { DialogCloseButton } from "../shared/ui/DialogCloseButton";
import { captureFocusReturn } from "../shared/ui/focus-return";
import styles from "./CanvasVideoProjectDialog.module.css";

export interface CanvasVideoProjectSelection {
  requestId: string;
  accountName: string;
  localProjectName: string;
  loadProjects(page?: number): Promise<PlatformContainerPage>;
  confirm(platformProjectId: string): Promise<void>;
  cancel(): void;
}

interface Props {
  selection: CanvasVideoProjectSelection | null;
}

export function CanvasVideoProjectDialog({ selection }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  useEffect(() => {
    if (!selection || !dialogRef.current) return;
    const element = dialogRef.current;
    const returnFocus = captureFocusReturn();
    element.showModal();
    return () => { element.close(); returnFocus(); };
  }, [selection?.requestId]);
  useEffect(() => {
    if (!selection) return;
    let active = true;
    setProjects([]); setSelectedId(""); setError(""); setBusy(false); setLoading(true);
    void (async () => {
      const items: { id: string; name: string }[] = [];
      let page = 1;
      while (true) {
        const result = await selection.loadProjects(page);
        if (!active) return;
        items.push(...result.items);
        if (!result.hasMore) break;
        if (page >= 100) throw new Error("官网项目过多，暂时无法完整读取。");
        page += 1;
      }
      if (active) setProjects([...new Map(items.map((project) => [project.id, project])).values()]);
    })().catch(() => { if (active) setError("官网项目读取失败，请重试。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection?.requestId, attempt]);
  if (!selection) return null;
  const submit = async () => {
    if (!selectedId || busy || loading) return;
    setBusy(true); setError("");
    try { await selection.confirm(selectedId); }
    catch { setError("项目关联未保存，请重试。"); setBusy(false); }
  };
  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={(event) => { event.preventDefault(); if (!busy) selection.cancel(); }}>
    <div className={styles.content}>
      <DialogCloseButton className={styles.close} aria-label="取消选择官网项目" disabled={busy} onClick={selection.cancel} />
      <h2 id={`${id}-title`}>选择官网项目</h2>
      <p id={`${id}-description`}>真实视频将使用 {selection.accountName}，保存到此官网项目。为“{selection.localProjectName}”选择一次后，后续发送沿用此关联。</p>
      <label htmlFor={`${id}-project`}>官网项目</label>
      <select id={`${id}-project`} value={selectedId} disabled={loading || busy || projects.length === 0}
        onChange={(event) => setSelectedId(event.target.value)}>
        <option value="">请选择官网项目</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      {loading ? <p className={styles.status} role="status">正在读取官网项目…</p> : null}
      {!loading && !error && projects.length === 0 ? <p className={styles.status}>此账号暂无官网项目，请先在官网创建项目。</p> : null}
      {error ? <div className={styles.error} role="alert">{error}<button type="button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>重新读取</button></div> : null}
      <p className={styles.note}>继续发送会产生真实费用，实际费用待确认。取消不会提交生成。</p>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={selection.cancel}>取消</button>
        <button className={styles.primary} type="button" disabled={!selectedId || loading || busy} onClick={() => { void submit(); }}>{busy ? "正在关联…" : "关联并继续发送"}</button>
      </div>
    </div>
  </dialog>;
}
