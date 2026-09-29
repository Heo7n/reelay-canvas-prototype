import { useEffect, useId, useRef, useState } from "react";
import { captureFocusReturn } from "../shared/ui/focus-return";
import type { useCanvasSaveRecovery } from "./useCanvasSaveRecovery";
import styles from "./CanvasSaveRecoveryDialog.module.css";

interface Props {
  recovery: ReturnType<typeof useCanvasSaveRecovery>;
  account: string;
}

export function CanvasSaveRecoveryDialog({ recovery, account }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [open, setOpen] = useState(true);
  const id = useId();
  const state = recovery.state;
  useEffect(() => {
    if (!state || !open) return;
    const element = dialog.current;
    if (!element) return;
    const returnFocus = captureFocusReturn();
    if (password.current) password.current.autofocus = true;
    element.showModal();
    return () => { element.close(); returnFocus(); };
  }, [state?.requestId, open]);
  useEffect(() => { if (confirmDiscard) keep.current?.focus(); }, [confirmDiscard]);
  useEffect(() => { setConfirmDiscard(false); }, [state?.requestId, state?.reason]);
  useEffect(() => { setOpen(true); }, [state?.requestId]);
  if (!state) return null;
  const disabled = state.busy || !state.snapshot;
  return <>
    {!open ? <aside className={styles.banner} role="status"><span>保存已暂停，未保存修改仍在此页面</span>
      <button type="button" onClick={() => setOpen(true)}>恢复保存</button></aside> : null}
    <dialog ref={dialog} className={styles.dialog} aria-label="恢复画布保存" aria-describedby={`${id}-description`}
    onCancel={(event) => { event.preventDefault(); if (!state.busy) { if (confirmDiscard) setConfirmDiscard(false); else setOpen(false); } }}>
    <div className={styles.content}>
      <h2>{confirmDiscard ? "放弃未保存的修改？" : state.reason === "authentication" ? "登录已失效" : "画布已有新版本"}</h2>
      <p id={`${id}-description`}>{confirmDiscard
        ? "加载线上最新版本会放弃此窗口全部未保存修改。尚未保存的画布不会自动合并。"
        : state.reason === "authentication"
          ? "自动保存已暂停。此窗口的修改仍保留，请使用原账号继续，勿刷新或关闭页面。"
          : "此窗口的修改仍保留。保存为副本会在当前项目新增恢复画布，保留全部本地画布内容，线上已有画布不变。"}</p>
      {!state.snapshot && !state.error ? <p role="status">正在保护未保存的修改…</p> : null}
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      {confirmDiscard ? <div className={styles.actions}>
        <button ref={keep} type="button" disabled={state.busy} onClick={() => setConfirmDiscard(false)}>保留当前修改</button>
        <button type="button" disabled={disabled} onClick={() => { void recovery.run("latest"); }}>放弃修改并加载</button>
      </div> : <>
        {state.reason === "authentication" ? <form className={styles.form} onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          const value = password.current?.value || "";
          if (password.current) password.current.value = "";
          void recovery.run("authenticate", value);
        }}>
          <label htmlFor={`${id}-account`}>账号</label>
          <input id={`${id}-account`} value={account} readOnly autoComplete="username" />
          <label htmlFor={`${id}-password`}>密码</label>
          <input id={`${id}-password`} ref={password} type="password" autoComplete="current-password" required disabled={disabled} />
          <button className={styles.primary} type="submit" disabled={disabled}>{state.busy ? "正在恢复…" : "登录并恢复保存"}</button>
          <button type="button" disabled={disabled} onClick={() => { void recovery.run("authenticate"); }}>已在其他页面登录，重新检查</button>
        </form> : <div className={styles.actions}>
          <button className={styles.primary} type="button" disabled={disabled} onClick={() => { void recovery.run("copy"); }}>{state.busy ? "正在恢复…" : "保存为副本"}</button>
          <button type="button" disabled={disabled} onClick={() => setConfirmDiscard(true)}>加载最新版本</button>
        </div>}
        {state.reason === "authentication" && state.snapshot ? <button className={styles.secondary} type="button" disabled={disabled}
          onClick={() => setConfirmDiscard(true)}>加载最新版本</button> : null}
      </>}
      {!confirmDiscard ? <button className={styles.secondary} type="button" disabled={state.busy} onClick={() => setOpen(false)}>稍后处理</button> : null}
    </div>
  </dialog></>;
}
