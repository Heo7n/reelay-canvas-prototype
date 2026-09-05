import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  Form,
  useActionData,
  useNavigation,
  useSearchParams,
} from "react-router-dom";

import loginStudioUrl from "../../../assets/auth/login-studio.webp";
import { routePaths } from "../../app/routes";
import type { LoginActionData } from "../../app/route-data";
import { Brand } from "../../shared/ui/Brand";
import styles from "./LoginPage.module.css";

const DEMO_PASSWORD = "reelay-demo";

const DEMO_IDENTITIES = [
  {
    account: "creator@reelay.test",
    displayName: "Hoo",
    roleLabel: "主账户",
  },
  {
    account: "linjing@reelay.test",
    displayName: "林静",
    roleLabel: "管理员",
  },
  {
    account: "chenxi@reelay.test",
    displayName: "陈曦",
    roleLabel: "成员",
  },
] as const;

const DEFAULT_IDENTITY = DEMO_IDENTITIES[0];

export function LoginPage() {
  const actionData = useActionData() as LoginActionData | undefined;
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [account, setAccount] = useState<string>(DEFAULT_IDENTITY.account);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const registerMode = searchParams.get("mode") === "register";
  const submitting = navigation.state === "submitting";
  const selectedIdentity = DEMO_IDENTITIES.find((identity) => identity.account === account);
  const inputDescription = actionData?.error
    ? "demo-credentials-note login-error"
    : "demo-credentials-note";

  function selectIdentity(identity: (typeof DEMO_IDENTITIES)[number]): void {
    setAccount(identity.account);
    setPassword(DEMO_PASSWORD);
  }

  function setMode(mode: "login" | "register"): void {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (mode === "register") nextParams.set("mode", "register");
      else nextParams.delete("mode");
      return nextParams;
    }, { replace: true });
  }

  return (
    <main className={styles.shell}>
      <section className={styles.visual} aria-label="Reelay AI 视频创作空间">
        <img className={styles.visualImage} src={loginStudioUrl} alt="" />
        <span className={styles.visualShade} aria-hidden="true" />
        <Brand className={styles.brand} to={routePaths.login()} />
      </section>

      <section className={styles.panel} aria-labelledby="auth-title">
        <div className={styles.formWrap}>
          {registerMode ? (
            <>
              <p className={styles.eyebrow}>受邀演示环境</p>
              <h1 id="auth-title">注册暂未开放</h1>

              <div className={styles.registrationCard}>
                <strong>当前仅向受邀评审者提供固定演示账号</strong>
                <p>
                  这里是产品原型的访问说明，不是注册表单。继续操作不会创建账号、发送验证码或收集联系方式。
                </p>
                <ul>
                  <li>演示身份只用于体验不同组织角色和项目权限。</li>
                  <li>正式账号标识、验证与密码生命周期尚未接入。</li>
                  <li>请勿在此页面输入任何真实账号或密码。</li>
                </ul>
              </div>

              <button className={styles.primaryAction} type="button" onClick={() => setMode("login")}>
                返回演示登录
              </button>
              <p className={styles.registrationNote}>
                用户协议、隐私政策与第三方登录将在正式账户系统开放后提供。
              </p>
            </>
          ) : (
            <>
              <p className={styles.eyebrow}>受邀演示环境</p>
              <h1 id="auth-title">登录 Reelay</h1>
              <p className={styles.lede}>选择一个演示身份，进入同一工作空间体验不同权限。</p>

              <fieldset className={styles.identityPicker} disabled={submitting}>
                <legend>选择演示身份</legend>
                <div className={styles.identityGrid}>
                  {DEMO_IDENTITIES.map((identity) => {
                    const selected = identity.account === account;
                    return (
                      <button
                        key={identity.account}
                        className={`${styles.identityButton} ${selected ? styles.identityButtonSelected : ""}`}
                        type="button"
                        aria-label={`${identity.roleLabel}演示身份：${identity.displayName}（${identity.account}）`}
                        aria-pressed={selected}
                        title={identity.account}
                        onClick={() => selectIdentity(identity)}
                      >
                        <span>{identity.roleLabel}</span>
                        <strong>{identity.displayName}</strong>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <p className={styles.identityStatus} aria-live="polite">
                {selectedIdentity
                  ? `${selectedIdentity.roleLabel} · ${selectedIdentity.displayName} · ${selectedIdentity.account}`
                  : "自定义演示账号"}
              </p>
              <p id="demo-credentials-note" className={styles.demoGuardrail}>
                <strong>仅供原型评审：</strong>选择身份会填入固定演示密码，请勿输入真实凭据。
              </p>

              <Form className={styles.form} method="post" replace>
                <label htmlFor="login-account">账号</label>
                <input
                  id="login-account"
                  name="account"
                  type="text"
                  value={account}
                  placeholder="请输入演示账号"
                  autoComplete="username"
                  spellCheck={false}
                  required
                  disabled={submitting}
                  aria-describedby={inputDescription}
                  aria-invalid={Boolean(actionData?.error)}
                  onChange={(event) => setAccount(event.target.value)}
                />

                <label htmlFor="login-password">密码</label>
                <div className={styles.passwordField}>
                  <input
                    id="login-password"
                    name="password"
                    type={passwordVisible ? "text" : "password"}
                    value={password}
                    placeholder="请输入演示密码"
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                    aria-describedby={inputDescription}
                    aria-invalid={Boolean(actionData?.error)}
                    onChange={(event) => setPassword(event.target.value)}
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

                <p className={styles.unavailableLine} aria-label="忘记密码暂未开放">
                  <span>忘记密码</span>
                  <small>暂未开放</small>
                </p>

                {actionData?.error ? (
                  <p id="login-error" className={styles.error} role="alert">
                    {actionData.error}
                  </p>
                ) : null}

                <button className={styles.primaryAction} type="submit" disabled={submitting}>
                  {submitting ? "正在登录…" : "登录"}
                </button>
              </Form>

              <div className={styles.divider} aria-hidden="true"><span>其他方式</span></div>

              <button className={styles.google} type="button" disabled aria-disabled="true">
                <span className={styles.googleMark} aria-hidden="true">G</span>
                <span>Google 登录</span>
                <small>暂未开放</small>
              </button>

              <p className={styles.agreement}>
                用户协议与隐私政策 <span>暂未开放</span>
              </p>

              <p className={styles.register}>
                还没有演示账号？
                <button type="button" onClick={() => setMode("register")}>查看注册说明</button>
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
