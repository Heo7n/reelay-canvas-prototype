import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Download, Link2, LoaderCircle, RefreshCw, Send } from "lucide-react";
import type { RealGenerationGateway } from "../../application/generation/RealGenerationGateway";
import { isApplicationError } from "../../application/shared/ApplicationError";
import { REAL_GENERATION_PLATFORM_ORIGIN, REAL_GENERATION_PROBE_SPEC, type GenerationConnection, type GenerationProbe, type PlatformContainerPage } from "../../contracts/real-generation";
import styles from "./RealGenerationConnectionSection.module.css";

const examplePrompt = "清晨的海岸，薄雾从远处的山峦缓缓散去，金色阳光照在平静的海面上。镜头低空沿岸平稳向前推进，掠过岸边的岩石和随风轻轻摆动的草地，远处海浪自然起伏。写实电影质感，色彩柔和，画面稳定，保持连续镜头，没有人物、文字或水印，配合轻柔的海浪和风声。";
const activeStatuses = new Set<GenerationProbe["status"]>(["submitting", "waiting", "saving"]);
const statusLabels: Record<GenerationProbe["status"], string> = {
  submitting: "正在提交", waiting: "等待平台结果", saving: "视频已生成，正在保存", succeeded: "生成成功",
  failed: "生成失败", unconfirmed: "结果待确认", save_failed: "视频已生成，保存未完成",
};
type ContainerList = { items: PlatformContainerPage["items"]; page: number; hasMore: boolean; loading: boolean; error: boolean };
const emptyList: ContainerList = { items: [], page: 0, hasMore: false, loading: false, error: false };
// These local API checks run before the chargeable upstream generation call.
const notSubmittedCodes = new Set(["expired", "disconnected", "container_unavailable", "invalid_request", "session_required", "local_only", "probe_busy"]);
const safeLoginCodes = new Set(["credentials_rejected", "account_mismatch", "probe_busy", "unavailable", "expired", "session_required", "local_only"]);

function useContainerList(reader: ((page: number) => Promise<PlatformContainerPage>) | null) {
  const [state, setState] = useState<ContainerList>(emptyList);
  const epoch = useRef(0);
  const busy = useRef(false);
  const read = useCallback(async (page: number) => {
    if (!reader || busy.current) return;
    const version = epoch.current;
    busy.current = true;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    try {
      const result = await reader(page);
      if (version !== epoch.current) return;
      setState((previous) => ({ items: page === 1 ? result.items : [...previous.items, ...result.items.filter((item) => !previous.items.some((existing) => existing.id === item.id))],
        page: result.page, hasMore: result.hasMore, loading: false, error: false }));
    } catch {
      if (version === epoch.current) setState((previous) => ({ ...previous, loading: false, error: true }));
    } finally { if (version === epoch.current) busy.current = false; }
  }, [reader]);
  useEffect(() => {
    epoch.current += 1;
    busy.current = false;
    setState(emptyList);
    if (reader) void read(1);
    return () => { epoch.current += 1; busy.current = false; };
  }, [reader, read]);
  return { ...state, read };
}

interface Confirmation {
  prompt: string;
  projectId: string;
  projectName: string;
  specification: GenerationConnection["specification"];
}

function specificationText(specification: GenerationConnection["specification"]) {
  return `${specification.modelName} · ${specification.resolution} · ${specification.aspectRatio} · ${specification.duration} 秒 · ${specification.generateAudio ? "含音频" : "无音频"} · 1 条`;
}

function localMediaUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? value : null;
  } catch { return null; }
}

export function RealGenerationConnectionSection({ gateway }: { gateway: RealGenerationGateway }) {
  const [connection, setConnection] = useState<GenerationConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [loginType, setLoginType] = useState<"phone" | "email">("phone");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState(examplePrompt);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [probe, setProbe] = useState<GenerationProbe | null>(null);
  const [readError, setReadError] = useState(false);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [dimensions, setDimensions] = useState("");
  const [mediaError, setMediaError] = useState(false);
  const scopeEpoch = useRef(0);
  const connectionRead = useRef(0);
  const probeRead = useRef(0);
  const actionBusy = useRef(false);
  const submitBusy = useRef(false);
  const unknownRequestKey = useRef<string | null>(null);
  const confirmationButton = useRef<HTMLButtonElement>(null);
  const preparationButton = useRef<HTMLButtonElement>(null);
  const active = probe ? activeStatuses.has(probe.status) : false;
  const locked = active || submissionUnknown || probe?.status === "unconfirmed";
  const connected = connection?.available && connection.state === "connected";
  const specification = connection?.specification ?? REAL_GENERATION_PROBE_SPEC;
  const resultUrl = localMediaUrl(probe?.result?.url);

  const refreshConnection = useCallback(async () => {
    const scope = scopeEpoch.current;
    const request = ++connectionRead.current;
    setLoading(true);
    setConnectionError(false);
    try {
      const result = await gateway.getConnection();
      if (scope !== scopeEpoch.current || request !== connectionRead.current) return;
      setConnection(result);
      const expectedKey = unknownRequestKey.current;
      if (result.probe && (!expectedKey || result.probe.requestKey === expectedKey)) {
        unknownRequestKey.current = null;
        setProbe(result.probe); setReadError(false); setSubmissionUnknown(false);
        if (expectedKey) setActionError("");
      }
    } catch {
      if (scope === scopeEpoch.current && request === connectionRead.current) setConnectionError(true);
    } finally {
      if (scope === scopeEpoch.current && request === connectionRead.current) setLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    scopeEpoch.current += 1;
    setConnection(null); setProbe(null); setConfirmation(null); setProjectId("");
    setPassword(""); setActionError(""); setSubmissionUnknown(false); setReadError(false);
    setBusy(false); actionBusy.current = false; submitBusy.current = false;
    unknownRequestKey.current = null;
    void refreshConnection();
    return () => { scopeEpoch.current += 1; connectionRead.current += 1; probeRead.current += 1; };
  }, [refreshConnection]);

  const userId = connected ? connection.platformUser?.id : undefined;
  const projectReader = useCallback((page: number) => gateway.listProjects(page), [gateway, userId]);
  const projects = useContainerList(userId ? projectReader : null);

  const readProbe = useCallback(async (id: string) => {
    const scope = scopeEpoch.current;
    const request = ++probeRead.current;
    try {
      const result = await gateway.getProbe(id);
      if (scope !== scopeEpoch.current || request !== probeRead.current) return;
      setProbe(result); setReadError(false);
    } catch {
      if (scope === scopeEpoch.current && request === probeRead.current) setReadError(true);
    }
  }, [gateway]);

  const probeId = probe?.id;
  useEffect(() => {
    if (!probeId || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await readProbe(probeId);
      if (!stopped) timer = setTimeout(() => { void poll(); }, 2500);
    };
    timer = setTimeout(() => { void poll(); }, 2500);
    return () => { stopped = true; clearTimeout(timer); probeRead.current += 1; };
  }, [probeId, active, readProbe]);

  useEffect(() => { if (confirmation) confirmationButton.current?.focus(); }, [confirmation]);
  useEffect(() => { setDimensions(""); setMediaError(false); }, [probe?.result?.url]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy.current || locked || !account.trim() || !password) return;
    const input = { type: loginType, target: account.trim(), password };
    const scope = scopeEpoch.current;
    actionBusy.current = true; setBusy(true); setActionError(""); setPassword("");
    try {
      const result = await gateway.connect(input);
      if (scope !== scopeEpoch.current) return;
      setConnection(result); setProjectId(""); setConfirmation(null);
      if (result.probe) setProbe(result.probe);
    } catch (error) {
      if (scope === scopeEpoch.current) setActionError(isApplicationError(error) && error.serviceCode && safeLoginCodes.has(error.serviceCode)
        ? error.message : "连接未成功，请检查真实平台账号、密码及本机 API 服务后重试。");
    } finally {
      if (scope === scopeEpoch.current) { actionBusy.current = false; setBusy(false); }
    }
  }

  async function disconnect() {
    if (actionBusy.current || locked) return;
    const scope = scopeEpoch.current;
    actionBusy.current = true; setBusy(true); setActionError(""); setConfirmation(null);
    try {
      await gateway.disconnect();
      if (scope !== scopeEpoch.current) return;
      setProjectId("");
      await refreshConnection();
    } catch { if (scope === scopeEpoch.current) setActionError("断开未成功，请重新读取连接状态。"); }
    finally { if (scope === scopeEpoch.current) { actionBusy.current = false; setBusy(false); } }
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const project = projects.items.find((item) => item.id === projectId);
    if (!connected || connectionError || loading || locked || busy || !project || !prompt.trim()) return;
    setConfirmation({ projectId, projectName: project.name || project.id,
      prompt: prompt.trim(), specification });
  }

  async function startProbe() {
    if (submitBusy.current || !confirmation || !connected || connectionError || loading || locked) return;
    const frozen = confirmation;
    const scope = scopeEpoch.current;
    const requestKey = crypto.randomUUID();
    unknownRequestKey.current = requestKey;
    submitBusy.current = true; setBusy(true); setActionError("");
    try {
      const task = await gateway.startProbe({ projectId: frozen.projectId, prompt: frozen.prompt,
        requestKey, paidConsent: true });
      if (scope !== scopeEpoch.current) return;
      if (task.requestKey !== requestKey) throw new Error("Submission response did not match the request.");
      unknownRequestKey.current = null;
      setProbe(task); setConfirmation(null); setReadError(false);
    } catch (error) {
      if (scope !== scopeEpoch.current) return;
      const notSubmitted = isApplicationError(error) && error.serviceCode && notSubmittedCodes.has(error.serviceCode);
      if (notSubmitted) unknownRequestKey.current = null;
      setSubmissionUnknown(!notSubmitted); setConfirmation(null);
      setActionError(notSubmitted ? `本次生成未提交。${error.message}` : "未能确认提交结果。任务可能已发出，请先读取本机记录并核对平台，避免重复付费。");
      await refreshConnection();
    } finally { if (scope === scopeEpoch.current) { submitBusy.current = false; setBusy(false); } }
  }

  async function retrySave() {
    if (actionBusy.current || !connected || connectionError || loading || probe?.status !== "save_failed") return;
    const scope = scopeEpoch.current;
    actionBusy.current = true; setBusy(true); setActionError("");
    try {
      const result = await gateway.retrySave(probe.id);
      if (scope === scopeEpoch.current) { setProbe(result); setReadError(false); }
    } catch { if (scope === scopeEpoch.current) setActionError("暂时无法重试保存，请读取状态后再试；不会重新生成视频。"); }
    finally { if (scope === scopeEpoch.current) { actionBusy.current = false; setBusy(false); } }
  }

  return (
    <section className={styles.section} aria-labelledby="real-generation-heading">
      <header className={styles.heading}>
        <div><h2 id="real-generation-heading">生成连接</h2><p>连接真实 Reelay 平台，单独验证一次普通视频生成。</p></div>
        <span className={styles.badge}>本机联调</span>
      </header>
      <p className={styles.boundary}>本项目演示账号与真实平台账号分别登录。连接后，画布与对话中的普通 Seedance 视频使用真实平台生成，费用由平台账号承担；未连接时使用模拟生成。真实任务不扣除本项目的演示积分。</p>
      <p className={styles.helper}>接口来源：{REAL_GENERATION_PLATFORM_ORIGIN} · 官网 Web 接口</p>
      {loading ? <p className={styles.status} role="status"><LoaderCircle className={styles.spinner} aria-hidden="true" />正在读取连接…</p> : null}
      {connectionError ? <div className={styles.notice} role="alert"><p>无法读取生成连接，请确认本机 API 服务已启动。</p><button className={styles.secondary} type="button" onClick={() => { void refreshConnection(); }} disabled={loading}><RefreshCw aria-hidden="true" />重试连接读取</button></div> : null}
      {connection && !connection.available ? <div className={styles.notice}><h3>本机尚未启用真实生成</h3><p>{connection.reason || "请在本机 API 配置中开启真实生成联调，并重启 API 服务后重试。"}</p><button className={styles.secondary} type="button" onClick={() => { void refreshConnection(); }} disabled={loading}>重新读取连接</button></div> : null}
      {connection?.available ? <>
        <section className={styles.card} aria-labelledby="platform-account-heading">
          <div className={styles.cardHeading}><h3 id="platform-account-heading"><Link2 aria-hidden="true" />真实平台账号</h3><div className={styles.connectionActions}><span className={styles.accountState}>{connectionError ? "状态暂不可读" : connected ? "已连接" : connection.state === "expired" ? "登录已过期" : "未连接"}</span><button className={styles.textButton} type="button" disabled={loading || busy} onClick={() => { void refreshConnection(); }}>重新读取连接</button></div></div>
          {connected ? <div className={styles.identity}><span><strong>{connection.platformUser?.displayName}</strong><small>平台用户 ID：{connection.platformUser?.id}</small></span><button className={styles.secondary} type="button" onClick={() => { void disconnect(); }} disabled={busy || locked}>断开连接</button></div>
            : <form className={styles.loginForm} onSubmit={(event) => { void connect(event); }} autoComplete="off">
              <label><span>登录方式</span><select value={loginType} onChange={(event) => setLoginType(event.target.value as "phone" | "email")} disabled={busy || locked}><option value="phone">手机号</option><option value="email">邮箱</option></select></label>
              <label><span>{loginType === "phone" ? "平台手机号" : "平台邮箱"}</span><input type={loginType === "phone" ? "tel" : "email"} value={account} onChange={(event) => setAccount(event.target.value)} required maxLength={254} disabled={busy || locked} autoComplete="off" /></label>
              <label><span>平台密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={256} disabled={busy || locked} autoComplete="off" /></label>
              <button className={styles.primary} type="submit" disabled={busy || locked || !account.trim() || !password}>{busy ? "正在连接…" : "连接平台"}</button>
            </form>}
          <p className={styles.helper}>密码提交后立即清空，不在本页面保存；连接仅保留至本机服务重启。</p>
        </section>
        {connected ? <section className={styles.card} aria-labelledby="generation-probe-heading">
          <div className={styles.cardHeading}><h3 id="generation-probe-heading">普通视频联调</h3><span className={styles.accountState}>纯文生 · 固定规格</span></div>
          <p className={styles.specification}>{specificationText(specification)}</p>
          <p className={styles.helper}>无参考素材。请选择真实官网的已有项目，再准备生成。</p>
          <form className={styles.probeForm} onSubmit={prepare}>
            <fieldset disabled={busy || locked || Boolean(confirmation)}>
              <div className={styles.projectField}>
                <label><span>平台项目</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={projects.loading || busy || locked || Boolean(confirmation)} required><option value="">{projects.loading && !projects.items.length ? "正在读取项目…" : "请选择已有项目"}</option>{projects.items.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>
                {projects.error ? <p className={styles.listError}>项目读取失败。<button className={styles.textButton} type="button" onClick={() => { void projects.read(projects.page || 1); }}>重试项目读取</button></p> : null}
                {!projects.loading && !projects.error && !projects.items.length ? <p className={styles.helper}>官网未返回可选项目，请核对当前连接的账号。</p> : null}
                {projects.hasMore ? <button className={styles.textButton} type="button" disabled={projects.loading} onClick={() => { void projects.read(projects.page + 1); }}>{projects.loading ? "正在读取…" : "加载更多项目"}</button> : null}
              </div>
              <label><span>提示词</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} required rows={5} /></label>
            </fieldset>
            <div className={styles.actions}><p className={styles.helper}>费用待确认，以平台实际扣费为准。</p><button ref={preparationButton} className={styles.primary} type="submit" disabled={busy || loading || connectionError || locked || Boolean(confirmation) || !projectId || !prompt.trim()}><Send aria-hidden="true" />准备真实生成</button></div>
          </form>
          {confirmation ? <section className={styles.confirmation} aria-labelledby="probe-confirm-heading">
            <h4 id="probe-confirm-heading">确认一次真实付费生成</h4>
            <p className={styles.helper}>以下内容已冻结。确认后将在所选官网项目新增一个视频生成块，再调用真实平台；不扣除本项目的演示积分，提交后暂不支持取消或退款。</p>
            <dl><div><dt>项目</dt><dd>{confirmation.projectName}</dd></div><div><dt>规格</dt><dd>{specificationText(confirmation.specification)}</dd></div><div><dt>提示词</dt><dd className={styles.frozenPrompt}>{confirmation.prompt}</dd></div></dl>
            <div className={styles.actions}><button className={styles.secondary} type="button" disabled={busy} onClick={() => { setConfirmation(null); preparationButton.current?.focus(); }}>返回修改</button><button ref={confirmationButton} className={styles.primary} type="button" disabled={busy} onClick={() => { void startProbe(); }}>{busy ? "正在提交…" : "确认付费并生成 1 条"}</button></div>
          </section> : null}
        </section> : null}
      </> : null}
      {actionError ? <p className={styles.error} role="alert">{actionError}</p> : null}
      {submissionUnknown ? <div className={styles.notice}><strong>提交结果待确认</strong><p>本机没有可确认的任务记录，请核对真实平台。不会自动重新提交。</p><button className={styles.secondary} type="button" disabled={loading} onClick={() => { void refreshConnection(); }}>读取本机记录</button></div> : null}
      {probe ? <section className={styles.card} aria-labelledby="probe-result-heading">
        <div className={styles.cardHeading}><h3 id="probe-result-heading">联调结果</h3><span className={styles.taskStatus} role="status">{active ? <LoaderCircle className={styles.spinner} aria-hidden="true" /> : probe.status === "succeeded" ? <Check aria-hidden="true" /> : null}{statusLabels[probe.status]}</span></div>
        <p className={styles.taskId}>本机任务 {probe.id}</p>
        {readError ? <div className={styles.notice} role="alert"><p>本机状态暂不可读，任务可能仍在进行。不会重新发送生成请求。</p><button className={styles.secondary} type="button" onClick={() => { void readProbe(probe.id); }}>重新读取状态</button></div> : <p className={styles.helper}>{probe.message || (active ? "请等待平台返回结果。当前通道没有百分比进度，也暂不支持取消。" : "")}</p>}
        {probe.status === "unconfirmed" ? <p className={styles.notice}>平台结果尚未确认，请在真实平台核对。本页面不会自动重试生成。</p> : null}
        {probe.status === "save_failed" ? <div className={styles.actions}><p className={styles.helper}>{connected ? "只重试已生成视频的保存，不调用模型、不重复生成。" : "请先重新连接原平台账号，再重试保存；不会重新生成视频。"}</p><button className={styles.secondary} type="button" disabled={busy || loading || connectionError || !connected} onClick={() => { void retrySave(); }}>重试保存视频</button></div> : null}
        {probe.status === "succeeded" && probe.result && resultUrl ? <div className={styles.media}><video key={resultUrl} src={resultUrl} controls preload="metadata" onLoadedMetadata={(event) => {
          const media = event.currentTarget;
          if (media.videoWidth > 0 && media.videoHeight > 0 && Number.isFinite(media.duration)) setDimensions(`实际视频 ${media.videoWidth} × ${media.videoHeight} · ${media.duration.toFixed(1)} 秒`);
        }} onError={() => setMediaError(true)} aria-label="真实生成视频" /><div className={styles.actions}><p className={styles.helper} role={mediaError ? "alert" : undefined}>{mediaError ? "视频已保存，播放失败，请检查本机服务后重新打开。" : dimensions || "正在读取视频实际规格…"}</p><a className={styles.secondary} href={resultUrl} download><Download aria-hidden="true" />下载视频</a></div></div> : null}
        {probe.status === "succeeded" && probe.result && !resultUrl ? <p className={styles.error} role="alert">视频已保存，但本机播放地址不可用，请重新读取连接。</p> : null}
        <details className={styles.diagnostics}><summary>脱敏协议概要</summary><dl><div><dt>事件数</dt><dd>{probe.diagnostics.eventCount}</dd></div><div><dt>事件类型</dt><dd>{probe.diagnostics.eventTypes.join("、") || "暂未收到"}</dd></div><div><dt>结构摘要</dt><dd>{probe.diagnostics.eventShapes.length ? <pre className={styles.structureSummary}><code>{probe.diagnostics.eventShapes.join("\n\n")}</code></pre> : "暂未采到事件结构"}</dd></div><div><dt>项目</dt><dd>{probe.projectId}</dd></div><div><dt>本次提示词</dt><dd className={styles.frozenPrompt}>{probe.prompt}</dd></div></dl></details>
        <p className={styles.helper}>联调记录保留至本机服务重启。关闭此窗口不会停止已提交的生成；此处结果尚不放入画布或对话。</p>
      </section> : null}
    </section>
  );
}
