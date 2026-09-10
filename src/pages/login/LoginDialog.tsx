import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { Form, useActionData, useNavigation } from "react-router-dom";

import type { LoginActionData } from "../../app/route-data";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { Brand } from "../../shared/ui/Brand";
import { LoginMediaCarousel } from "./LoginMediaCarousel";
import styles from "./LoginDialog.module.css";

interface LoginDialogProps {
  action: string;
  defaultAccount?: string;
  onClose: () => void;
  onBeforeSubmit?: () => void;
}

export function LoginDialog({ action, defaultAccount = "creator@reelay.test", onClose, onBeforeSubmit }: LoginDialogProps) {
  const actionData = useActionData<LoginActionData>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const signingIn = busy && navigation.formMethod?.toLowerCase() === "post";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLInputElement>(null);
  const backdropPress = useRef(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { notice, showNotice } = useTransientNotice(3800);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Native dialog focus selection reads autofocus before showModal opens it.
    // React's mount-time autoFocus alone cannot focus an input in a closed dialog.
    if (accountRef.current) accountRef.current.autofocus = true;
    dialog.showModal();
    showNotice("已填入演示账号，可直接登录。");
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [showNotice]);

  return (
    <dialog
      className={styles.dialog}
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget && !busy) onClose();
        backdropPress.current = false;
      }}
    >
      <div className={styles.layout}>
        <LoginMediaCarousel />
        <section className={styles.panel} aria-label="账户登录">
          <button className={styles.close} type="button" aria-label="关闭登录" disabled={busy} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
          <div className={styles.panelScroll}>
            <div className={styles.content}>
              <div className={styles.brandWrap} inert={busy}><Brand className={styles.brand} to="/" /></div>
              <h1 id={`${id}-title`}>欢迎登录</h1>
              <p className={styles.register}>
                还没有账户？
                <button type="button" disabled title="注册暂未开放">立即注册</button>
              </p>

              <p className={styles.mode}>密码登录</p>
              <Form
                className={styles.form}
                method="post"
                action={action}
                replace
                aria-busy={busy}
                onSubmit={(event) => {
                  if (busy) event.preventDefault();
                  else onBeforeSubmit?.();
                }}
              >
                <div className={styles.field}>
                  <label htmlFor={`${id}-account`}>账号</label>
                  <input
                    id={`${id}-account`}
                    ref={accountRef}
                    name="account"
                    type="text"
                    defaultValue={defaultAccount}
                    placeholder="请输入账号"
                    autoComplete="username"
                    spellCheck={false}
                    required
                    readOnly={busy}
                  />
                </div>
                <div className={styles.field}>
                  <div className={styles.passwordLabel}>
                    <label htmlFor={`${id}-password`}>密码</label>
                    <button className={styles.forgot} type="button" disabled title="找回密码暂未开放">忘记密码？</button>
                  </div>
                  <div className={styles.passwordField}>
                    <input
                      id={`${id}-password`}
                      name="password"
                      type={passwordVisible ? "text" : "password"}
                      defaultValue="reelay-demo"
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      required
                      readOnly={busy}
                    />
                    <button
                      type="button"
                      aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                      aria-pressed={passwordVisible}
                      disabled={busy}
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                {actionData?.error ? <p className={styles.error} role="alert">{actionData.error}</p> : null}
                <button className={styles.submit} type="submit" disabled={busy}>
                  {signingIn ? "正在登录…" : "登录"}
                </button>
              </Form>
              <p className={styles.legal}>
                继续即表示您同意{" "}
                <button type="button" disabled title="使用条款暂未开放">使用条款</button>
                {" 和 "}
                <button type="button" disabled title="隐私政策暂未开放">隐私政策</button>
              </p>
            </div>
          </div>
        </section>
      </div>
      <div className={`${styles.notice} ${notice ? styles.noticeVisible : ""}`} role="status" aria-live="polite">{notice}</div>
    </dialog>
  );
}
