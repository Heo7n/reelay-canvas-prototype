// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasVideoProjectDialog, type CanvasVideoProjectSelection } from "./CanvasVideoProjectDialog";

afterEach(cleanup);
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
});

function selection(loadProjects: CanvasVideoProjectSelection["loadProjects"] = async (page = 1) => ({ items: [], page, hasMore: false })) {
  return { requestId: "request", accountName: "真实账号", localProjectName: "本机创作", loadProjects, confirm: vi.fn(async () => {}), cancel: vi.fn() };
}

describe("CanvasVideoProjectDialog", () => {
  it("requires explicit selection, loads all pages, and shows the real charge boundary", async () => {
    const request = selection();
    const gateway = { listProjects: vi.fn(async (page = 1) => ({ items: [{ id: `web-${page}`, name: `官网${page}` }], page, hasMore: page === 1 })) };
    request.loadProjects = gateway.listProjects;
    render(<CanvasVideoProjectDialog selection={request} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "官网2" })).toBeInTheDocument());
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "关联并继续发送" })).toBeDisabled();
    expect(screen.getByText(/实际费用待确认/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "web-2" } });
    fireEvent.click(screen.getByRole("button", { name: "关联并继续发送" }));
    await waitFor(() => expect(request.confirm).toHaveBeenCalledExactlyOnceWith("web-2"));
    expect(gateway.listProjects.mock.calls.map(([page]) => page)).toEqual([1, 2]);
  });

  it("cancels without selecting or submitting a project", async () => {
    const request = selection();
    render(<CanvasVideoProjectDialog selection={request} />);
    await screen.findByText(/暂无官网项目/);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(request.cancel).toHaveBeenCalledOnce();
    expect(request.confirm).not.toHaveBeenCalled();
  });

  it("keeps a failed binding visible and allows a retry", async () => {
    const request = selection(); request.confirm.mockRejectedValue(new Error("failed"));
    request.loadProjects = vi.fn(async () => ({ items: [{ id: "web", name: "官网" }], page: 1, hasMore: false }));
    render(<CanvasVideoProjectDialog selection={request} />);
    await screen.findByRole("option", { name: "官网" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "web" } });
    fireEvent.click(screen.getByRole("button", { name: "关联并继续发送" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("项目关联未保存");
    expect(screen.getByRole("button", { name: "关联并继续发送" })).toBeEnabled();
  });
});
