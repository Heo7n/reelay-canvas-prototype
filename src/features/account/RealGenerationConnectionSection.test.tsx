// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealGenerationGateway } from "../../application/generation/RealGenerationGateway";
import { ApplicationError } from "../../application/shared/ApplicationError";
import { REAL_GENERATION_PLATFORM_ORIGIN, REAL_GENERATION_PROBE_SPEC, type GenerationConnection, type GenerationProbe, type PlatformContainerPage } from "../../contracts/real-generation";
import { RealGenerationConnectionSection } from "./RealGenerationConnectionSection";

function task(overrides: Partial<GenerationProbe> = {}): GenerationProbe {
  return { id: "probe-1", requestKey: "a5f3ad33-3b4e-4d81-9e03-b31130224c77", status: "waiting", createdAt: "2026-10-12T05:00:00.000Z", finishedAt: null,
    message: "等待平台生成结果", prompt: "海边日出", projectId: "project-1", diagnostics: { eventCount: 2, eventTypes: ["start", "status"], eventShapes: [] }, result: null, ...overrides };
}
function connection(overrides: Partial<GenerationConnection> = {}): GenerationConnection {
  return { available: true, channel: "web", state: "connected", reason: null, platformUser: { id: "real-user", displayName: "真实创作者" }, specification: REAL_GENERATION_PROBE_SPEC, probe: null, ...overrides };
}
function page(items: PlatformContainerPage["items"], pageNumber = 1, hasMore = false): PlatformContainerPage { return { items, page: pageNumber, hasMore }; }
function gateway(overrides: Partial<RealGenerationGateway> = {}) {
  return { getConnection: vi.fn(async () => connection()), connect: vi.fn(async () => connection()), disconnect: vi.fn(async () => {}),
    listProjects: vi.fn(async () => page([{ id: "project-1", name: "联调项目" }])),
    startProbe: vi.fn(async (input) => task({ requestKey: input.requestKey, prompt: input.prompt })), getProbe: vi.fn(async () => task()), retrySave: vi.fn(async () => task({ status: "saving" })),
    ...overrides } satisfies RealGenerationGateway;
}
async function ready(api = gateway()) {
  const view = render(<RealGenerationConnectionSection gateway={api} />);
  await screen.findByText("真实创作者");
  await screen.findByRole("option", { name: "联调项目" });
  return { api, ...view };
}
function selectProject() {
  fireEvent.change(screen.getByRole("combobox", { name: "平台项目" }), { target: { value: "project-1" } });
}
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("RealGenerationConnectionSection", () => {
  it("explains the isolated real channel and does not auto-select or submit", async () => {
    const { api } = await ready();
    expect(screen.getByText(/连接后，画布与对话中的普通 Seedance 视频使用真实平台生成/)).toBeInTheDocument();
    expect(screen.getByText(/接口来源：/)).toHaveTextContent(`${REAL_GENERATION_PLATFORM_ORIGIN} · 官网 Web 接口`);
    expect(screen.getByText(/真实任务不扣除本项目的演示积分/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "平台会话" })).toBeNull();
    expect(screen.getByText("费用待确认，以平台实际扣费为准。")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "平台项目" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "准备真实生成" })).toBeDisabled();
    expect(api.startProbe).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "提示词" }).getAttribute("maxlength")).toBe("4000");
  });

  it("shows an API read failure and offers a read-only retry", async () => {
    const getConnection = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(connection());
    const api = gateway({ getConnection });
    render(<RealGenerationConnectionSection gateway={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("请确认本机 API 服务已启动");
    expect(screen.queryByText("已连接")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试连接读取" }));
    expect(await screen.findByText("真实创作者")).toBeInTheDocument();
    expect(api.connect).not.toHaveBeenCalled();
    expect(api.startProbe).not.toHaveBeenCalled();
  });

  it("shows the server's enablement instructions instead of a fake connected state", async () => {
    const api = gateway({ getConnection: vi.fn(async () => connection({ available: false, state: "disconnected", platformUser: null, reason: "配置 REELAY_REAL_GENERATION=1 后重启本机 API" })) });
    render(<RealGenerationConnectionSection gateway={api} />);
    expect(await screen.findByText("本机尚未启用真实生成")).toBeInTheDocument();
    expect(screen.getByText("配置 REELAY_REAL_GENERATION=1 后重启本机 API")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "连接平台" })).toBeNull();
  });

  it("clears a submitted password immediately and connects only once", async () => {
    let finish!: (value: GenerationConnection) => void;
    const pending = new Promise<GenerationConnection>((resolve) => { finish = resolve; });
    const connect = vi.fn(() => pending);
    const api = gateway({ getConnection: vi.fn(async () => connection({ state: "disconnected", platformUser: null })), connect });
    render(<RealGenerationConnectionSection gateway={api} />);
    await screen.findByLabelText("平台密码");
    fireEvent.change(screen.getByLabelText("平台手机号"), { target: { value: "13800138000" } });
    fireEvent.change(screen.getByLabelText("平台密码"), { target: { value: "a-private-password" } });
    const form = screen.getByLabelText("平台密码").closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(screen.getByLabelText("平台密码")).toHaveValue("");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith({ type: "phone", target: "13800138000", password: "a-private-password" });
    await act(async () => { finish(connection()); });
    expect(screen.queryByLabelText("平台密码")).toBeNull();
  });

  it("reads further project pages only when requested and retains the chosen project", async () => {
    const listProjects = vi.fn(async (number = 1) => page([{ id: `project-${number}`, name: number === 1 ? "联调项目" : "另一项目" }], number, number === 1));
    await ready(gateway({ listProjects }));
    expect(listProjects).toHaveBeenCalledTimes(1);
    selectProject();
    fireEvent.click(screen.getByRole("button", { name: "加载更多项目" }));
    expect(await screen.findByRole("option", { name: "另一项目" })).toBeInTheDocument();
    expect(listProjects).toHaveBeenNthCalledWith(2, 2);
    expect(screen.getByLabelText("平台项目")).toHaveValue("project-1");
  });

  it("asks the user to check the connected account when the website has no projects", async () => {
    const api = gateway({ listProjects: vi.fn(async () => page([])) });
    render(<RealGenerationConnectionSection gateway={api} />);
    expect(await screen.findByText("官网未返回可选项目，请核对当前连接的账号。")).toBeInTheDocument();
    expect(screen.getByLabelText("平台项目")).toHaveValue("");
    expect(screen.getByRole("button", { name: "准备真实生成" })).toBeDisabled();
    expect(api.startProbe).not.toHaveBeenCalled();
  });

  it("retries a failed project read without submitting generation", async () => {
    const listProjects = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(page([{ id: "project-1", name: "联调项目" }]));
    const api = gateway({ listProjects });
    render(<RealGenerationConnectionSection gateway={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "重试项目读取" }));
    expect(await screen.findByRole("option", { name: "联调项目" })).toBeInTheDocument();
    expect(listProjects).toHaveBeenNthCalledWith(2, 1);
    expect(screen.getByLabelText("平台项目")).toHaveValue("");
    expect(api.startProbe).not.toHaveBeenCalled();
  });

  it("requires a frozen inline paid confirmation and prevents duplicate calls", async () => {
    let finish!: (value: GenerationProbe) => void;
    const pending = new Promise<GenerationProbe>((resolve) => { finish = resolve; });
    const startProbe = vi.fn((_input: Parameters<RealGenerationGateway["startProbe"]>[0]) => pending);
    await ready(gateway({ startProbe }));
    selectProject();
    fireEvent.change(screen.getByLabelText("提示词"), { target: { value: "  镜头沿海岸推进，日出照亮水面。  " } });
    fireEvent.click(screen.getByRole("button", { name: "准备真实生成" }));
    expect(startProbe).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "确认一次真实付费生成" })).toBeInTheDocument();
    expect(screen.getByText(/确认后将在所选官网项目新增一个视频生成块/)).toHaveTextContent("提交后暂不支持取消");
    expect(screen.getByText("联调项目", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认付费并生成 1 条" })).toHaveFocus();
    expect(screen.getByLabelText("提示词")).toBeDisabled();
    expect(screen.getByLabelText("平台项目")).toBeDisabled();
    const confirmButton = screen.getByRole("button", { name: "确认付费并生成 1 条" });
    fireEvent.click(confirmButton); fireEvent.click(confirmButton);
    expect(startProbe).toHaveBeenCalledTimes(1);
    const submitted = startProbe.mock.calls[0][0];
    expect(submitted).toEqual({ projectId: "project-1", prompt: "镜头沿海岸推进，日出照亮水面。", requestKey: expect.stringMatching(/^[\da-f-]{36}$/), paidConsent: true });
    await act(async () => { finish(task({ requestKey: submitted.requestKey })); });
    expect(screen.getByRole("button", { name: "准备真实生成" })).toBeDisabled();
    expect(screen.queryByText(/\d+%/)).toBeNull();
    expect(screen.queryByRole("button", { name: "取消" })).toBeNull();
  });

  it("can leave preparation without any paid request", async () => {
    const { api } = await ready(); selectProject();
    fireEvent.click(screen.getByRole("button", { name: "准备真实生成" }));
    fireEvent.click(screen.getByRole("button", { name: "返回修改" }));
    expect(screen.queryByRole("heading", { name: "确认一次真实付费生成" })).toBeNull();
    expect(screen.getByLabelText("提示词")).toBeEnabled();
    expect(api.startProbe).not.toHaveBeenCalled();
  });

  it("recovers the current probe when reopened, polls only reads and clears timers", async () => {
    const getProbe = vi.fn(async () => task());
    vi.useFakeTimers();
    const api = gateway({ getConnection: vi.fn(async () => connection({ probe: task() })), getProbe });
    const { unmount } = render(<RealGenerationConnectionSection gateway={api} />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(getProbe).toHaveBeenCalledWith("probe-1");
    expect(api.startProbe).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains an in-flight task on read failure and resumes through a manual read", async () => {
    const getProbe = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(task({ status: "succeeded", result: { url: "/api/generation/probes/probe-1/video", contentType: "video/mp4", byteSize: 1000 } }));
    vi.useFakeTimers();
    render(<RealGenerationConnectionSection gateway={gateway({ getConnection: vi.fn(async () => connection({ probe: task() })), getProbe })} />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.getByRole("alert")).toHaveTextContent("本机状态暂不可读，任务可能仍在进行");
    expect(screen.queryByText("生成失败")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "重新读取状态" })); });
    expect(screen.getByText("生成成功")).toBeInTheDocument();
    expect(screen.getByLabelText("真实生成视频")).toHaveAttribute("src", "/api/generation/probes/probe-1/video");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not resubmit a lost response or confuse an old result with the new request", async () => {
    const old = task({ status: "succeeded", id: "old-probe" });
    const getConnection = vi.fn(async () => connection({ probe: old }));
    const api = gateway({ getConnection, startProbe: vi.fn(async () => { throw new Error("response lost"); }) });
    await ready(api); selectProject();
    fireEvent.click(screen.getByRole("button", { name: "准备真实生成" }));
    fireEvent.click(screen.getByRole("button", { name: "确认付费并生成 1 条" }));
    expect(await screen.findByText("提交结果待确认")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "准备真实生成" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "读取本机记录" }));
    await waitFor(() => expect(getConnection).toHaveBeenCalledTimes(3));
    expect(screen.getByText("提交结果待确认")).toBeInTheDocument();
    expect(api.startProbe).toHaveBeenCalledTimes(1);
  });

  it("recovers only the matching request after a submission response is lost", async () => {
    let submittedKey = "";
    const getConnection = vi.fn(async () => connection({ probe: submittedKey ? task({ requestKey: submittedKey }) : null }));
    const startProbe = vi.fn(async (input: Parameters<RealGenerationGateway["startProbe"]>[0]) => { submittedKey = input.requestKey; throw new Error("response lost"); });
    await ready(gateway({ getConnection, startProbe })); selectProject();
    fireEvent.click(screen.getByRole("button", { name: "准备真实生成" }));
    fireEvent.click(screen.getByRole("button", { name: "确认付费并生成 1 条" }));
    expect(await screen.findByText("本机任务 probe-1")).toBeInTheDocument();
    expect(screen.queryByText("提交结果待确认")).toBeNull();
    expect(startProbe).toHaveBeenCalledTimes(1);
  });

  it("offers save retry without repeating generation, and keeps unconfirmed outcomes blocked", async () => {
    const retrySave = vi.fn(async () => task({ status: "saving" }));
    const { api, unmount } = await ready(gateway({ getConnection: vi.fn(async () => connection({ probe: task({ status: "save_failed" }) })), retrySave }));
    fireEvent.click(screen.getByRole("button", { name: "重试保存视频" }));
    await waitFor(() => expect(retrySave).toHaveBeenCalledWith("probe-1"));
    expect(api.startProbe).not.toHaveBeenCalled();
    unmount();
    await ready(gateway({ getConnection: vi.fn(async () => connection({ probe: task({ status: "unconfirmed" }) })) }));
    expect(screen.getByText(/本页面不会自动重试生成/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "准备真实生成" })).toBeDisabled();
  });

  it("shows actual metadata from the real video rather than the requested dimensions", async () => {
    await ready(gateway({ getConnection: vi.fn(async () => connection({ probe: task({ status: "succeeded", result: { url: "/api/generation/probes/probe-1/video", contentType: "video/mp4", byteSize: 1000 } }) })) }));
    const video = screen.getByLabelText("真实生成视频");
    Object.defineProperties(video, { videoWidth: { value: 854 }, videoHeight: { value: 480 }, duration: { value: 5.2 } });
    fireEvent.loadedMetadata(video);
    expect(screen.getByText("实际视频 854 × 480 · 5.2 秒")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载视频" })).toHaveAttribute("href", "/api/generation/probes/probe-1/video");
    expect(screen.getByRole("link", { name: "下载视频" })).toHaveAttribute("download");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("rejects late project responses from a previously connected gateway", async () => {
    let finishOld!: (value: PlatformContainerPage) => void;
    const old = new Promise<PlatformContainerPage>((resolve) => { finishOld = resolve; });
    const listProjects = vi.fn(() => old);
    const view = render(<RealGenerationConnectionSection gateway={gateway({ listProjects })} />);
    await waitFor(() => expect(listProjects).toHaveBeenCalledTimes(1));
    view.rerender(<RealGenerationConnectionSection gateway={gateway()} />);
    await screen.findByRole("option", { name: "联调项目" });
    await act(async () => { finishOld(page([{ id: "old-project", name: "旧账号项目" }])); });
    expect(screen.queryByRole("option", { name: "旧账号项目" })).toBeNull();
    expect(screen.getByLabelText("平台项目")).toHaveValue("");
  });

  it("ignores a late connection read after the gateway changes", async () => {
    let finish!: (value: GenerationConnection) => void;
    const pending = new Promise<GenerationConnection>((resolve) => { finish = resolve; });
    const view = render(<RealGenerationConnectionSection gateway={gateway({ getConnection: vi.fn(() => pending) })} />);
    view.rerender(<RealGenerationConnectionSection gateway={gateway()} />);
    await screen.findByText("真实创作者");
    await act(async () => { finish(connection({ platformUser: { id: "old", displayName: "旧用户" } })); });
    expect(screen.queryByText("旧用户")).toBeNull();
    expect(screen.getByText("真实创作者")).toBeInTheDocument();
  });

  it("lets an expired connection be read back and reconnected before saving", async () => {
    const savedTask = task({ status: "save_failed" });
    const getConnection = vi.fn().mockResolvedValueOnce(connection({ probe: savedTask }))
      .mockResolvedValue(connection({ state: "expired", platformUser: null, probe: savedTask }));
    const connect = vi.fn(async () => connection({ probe: savedTask }));
    const { api } = await ready(gateway({ getConnection, connect }));
    fireEvent.click(screen.getByRole("button", { name: "重新读取连接" }));
    await screen.findByText("登录已过期");
    expect(screen.getByRole("button", { name: "重试保存视频" })).toBeDisabled();
    expect(screen.getByText(/请先重新连接原平台账号/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("平台手机号"), { target: { value: "13800138000" } });
    fireEvent.change(screen.getByLabelText("平台密码"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "连接平台" }));
    await screen.findByText("真实创作者");
    expect(screen.getByRole("button", { name: "重试保存视频" })).toBeEnabled();
    expect(api.startProbe).not.toHaveBeenCalled();
  });

  it("keeps a saved result successful even if browser playback fails", async () => {
    await ready(gateway({ getConnection: vi.fn(async () => connection({ probe: task({ status: "succeeded", result: { url: "/api/generation/probes/probe-1/video", contentType: "video/mp4", byteSize: 1000 } }) })) }));
    fireEvent.error(screen.getByLabelText("真实生成视频"));
    expect(screen.getByRole("alert")).toHaveTextContent("视频已保存，播放失败");
    expect(screen.getByText("生成成功")).toBeInTheDocument();
    expect(screen.queryByText("正在读取视频实际规格…")).toBeNull();
    expect(screen.queryByText("生成失败")).toBeNull();
  });

  it("allows reauthentication when a proven pre-submit check rejects an expired connection", async () => {
    const getConnection = vi.fn().mockResolvedValueOnce(connection()).mockResolvedValue(connection({ state: "expired", platformUser: null }));
    const startProbe = vi.fn(async () => { throw new ApplicationError("authentication_required", "真实平台登录已失效，请重新连接。", { serviceCode: "expired" }); });
    await ready(gateway({ getConnection, startProbe })); selectProject();
    fireEvent.click(screen.getByRole("button", { name: "准备真实生成" }));
    fireEvent.click(screen.getByRole("button", { name: "确认付费并生成 1 条" }));
    await screen.findByText("登录已过期");
    expect(screen.queryByText("提交结果待确认")).toBeNull();
    expect(screen.getByLabelText("平台密码")).toBeEnabled();
    expect(startProbe).toHaveBeenCalledTimes(1);
  });

  it("uses only the same-origin saved media endpoint for playback and download", async () => {
    await ready(gateway({ getConnection: vi.fn(async () => connection({ probe: task({ status: "succeeded", result: { url: "https://external.example/video.mp4", contentType: "video/mp4", byteSize: 1000 } }) })) }));
    expect(screen.queryByLabelText("真实生成视频")).toBeNull();
    expect(screen.queryByRole("link", { name: "下载视频" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("本机播放地址不可用");
    expect(screen.getByText("生成成功")).toBeInTheDocument();
  });

  it("keeps the new rejection visible when refreshing an older successful probe", async () => {
    const old = task({ id: "old-result", status: "succeeded" });
    const api = gateway({ getConnection: vi.fn(async () => connection({ probe: old })), startProbe: vi.fn(async () => { throw new ApplicationError("request_failed", "项目不可用。", { serviceCode: "container_unavailable" }); }) });
    await ready(api); selectProject();
    fireEvent.click(screen.getByRole("button", { name: "准备真实生成" }));
    fireEvent.click(screen.getByRole("button", { name: "确认付费并生成 1 条" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("本次生成未提交。项目不可用。");
    await waitFor(() => expect(api.getConnection).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent("本次生成未提交");
    expect(screen.queryByText("提交结果待确认")).toBeNull();
  });

  it("renders only the escaped structure sketch and explains an empty sample", async () => {
    const eventShape = '{"type":"asset_status","assets":[{"status":"completed","url":"<string>"}],"content":"<string>"}';
    const { unmount } = await ready(gateway({ getConnection: vi.fn(async () => connection({ probe: task({ status: "unconfirmed", diagnostics: { eventCount: 1, eventTypes: ["asset_status"], eventShapes: [eventShape] } }) })) }));
    fireEvent.click(screen.getByText("脱敏协议概要"));
    expect(screen.getByText(eventShape, { selector: "code" })).toHaveTextContent(eventShape);
    expect(document.querySelector("code string")).toBeNull();
    expect(screen.queryByText("暂未采到事件结构")).toBeNull();
    unmount();
    await ready(gateway({ getConnection: vi.fn(async () => connection({ probe: task({ status: "unconfirmed" }) })) }));
    fireEvent.click(screen.getByText("脱敏协议概要"));
    expect(screen.getByText("暂未采到事件结构")).toBeInTheDocument();
  });
});
