import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { Form, useActionData, useNavigation } from "react-router-dom";

import loginStudioUrl from "../../../assets/auth/login-studio.webp";
import { routePaths } from "../../app/routes";
import type { LoginActionData } from "../../app/route-data";
import { Brand } from "../../shared/ui/Brand";
import styles from "./LoginPage.module.css";

const DEMO_ACCOUNT = "tianmaochao@reelay.test";
const DEMO_PASSWORD = "reelay-demo";

export function LoginPage() {
  const actionData = useActionData() as LoginActionData | undefined;
  const navigation = useNavigation();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [notice, setNotice] = useState("已填入本地演示账号，可直接登录。请勿输入真实账号密码。");
  const noticeTimer = useRef<number | null>(null);
  const submitting = navigation.state === "submitting";

  function showNotice(message: string): void {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3600);
  }

  useEffect(() => {
    noticeTimer.current = window.setTimeout(() => setNotice(""), 3600);
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  return (
    <main className={styles.shell}>
      <section className={styles.visual} aria-label="Reelay AI 视频创作空间">
        <img className={styles.visualImage} src={loginStudioUrl} alt="" />
        <span className={styles.visualShade} aria-hidden="true" />
        <Brand className={styles.brand} to={routePaths.login()} />
      </section>

      <section className={styles.panel} aria-labelledby="login-title">
        <button
          className={styles.close}
          type="button"
          aria-label="关闭登录页"
          onClick={() => showNotice("营销首页将在后续开放。")}
        >
          <X aria-hidden="true" />
        </button>

        <div className={styles.formWrap}>
          <h1 id="login-title">登录或注册</h1>

          <Form className={styles.form} method="post" replace>
            <label htmlFor="login-account">账号</label>
            <input
              id="login-account"
              name="account"
              type="text"
              defaultValue={DEMO_ACCOUNT}
              placeholder="请输入账号"
              autoComplete="username"
              spellCheck={false}
              required
              disabled={submitting}
            />

            <label htmlFor="login-password">密码</label>
            <div className={styles.passwordField}>
              <input
                id="login-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                defaultValue={DEMO_PASSWORD}
                placeholder="请输入密码"
                autoComplete="current-password"
                required
                disabled={submitting}
              />
              <button
                type="button"
                aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>

            <button className={styles.textAction} type="button" onClick={() => showNotice("忘记密码流程将在正式账户系统阶段接入。")}>忘记密码？</button>

            {actionData?.error ? <p className={styles.error} role="alert">{actionData.error}</p> : null}

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? "正在登录…" : "登录"}
            </button>
          </Form>

          <div className={styles.divider} aria-hidden="true"><span>或</span></div>

          <button className={styles.google} type="button" onClick={() => showNotice("Google 登录目前是界面演示，将在正式账户系统阶段接入。")}>
            <span className={styles.googleMark} aria-hidden="true">G</span>
            <span>使用 Google 继续</span>
          </button>

          <p className={styles.agreement}>
            继续即表示你同意
            <button type="button" onClick={() => showNotice("用户协议页面将在正式应用阶段提供。")}>用户协议</button>
            与
            <button type="button" onClick={() => showNotice("隐私政策页面将在正式应用阶段提供。")}>隐私政策</button>
          </p>

          <p className={styles.register}>
            还没有账号？
            <button type="button" onClick={() => showNotice("注册流程将在正式账户系统阶段接入。")}>立即注册</button>
          </p>
        </div>

        <div className={`${styles.notice} ${notice ? styles.noticeVisible : ""}`} role="status" aria-live="polite">{notice}</div>
      </section>
    </main>
  );
}
