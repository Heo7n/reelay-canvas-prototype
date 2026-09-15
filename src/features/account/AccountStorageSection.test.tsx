// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaStorageSnapshot, MediaStorageSpace } from "../../domain/asset/media-storage";
import { AccountStorageSection } from "./AccountStorageSection";

afterEach(cleanup);
const GB = 1024 ** 3;
function usage(kind: MediaStorageSpace, usedBytes: number, reservedBytes = 0, limitBytes = 10 * GB): MediaStorageSnapshot {
  return { owner: { kind, id: kind }, usedBytes, reservedBytes, limitBytes, availableBytes: Math.max(0, limitBytes - usedBytes - reservedBytes) };
}

describe("AccountStorageSection", () => {
  it("shows actual owner limits, used files and reserved uploads separately", async () => {
    const repository = { getStorageUsage: vi.fn(async (_workspace: string, space: MediaStorageSpace) => space === "personal" ? usage(space, 2 * GB, GB) : usage(space, 16 * GB, 0, 20 * GB)) };
    render(<AccountStorageSection actorId="actor" workspaceId="workspace" repository={repository} />);
    const personal = screen.getByRole("region", { name: "个人空间" });
    const org = screen.getByRole("region", { name: "组织空间" });
    expect(await within(personal).findByText("可用 7 GB")).toBeInTheDocument();
    expect(within(personal).getByText("上传预留 1 GB")).toBeInTheDocument();
    expect(within(personal).getByRole("meter")).toHaveAttribute("aria-valuenow", String(3 * GB));
    expect(within(org).getByRole("meter")).toHaveAttribute("aria-valuemax", String(20 * GB));
    expect(within(org).getByText("空间即将用满。")).toBeInTheDocument();
  });

  it("retains independent success when one space fails and refreshes both", async () => {
    let fail = true;
    const repository = { getStorageUsage: vi.fn(async (_workspace: string, space: MediaStorageSpace) => {
      if (space === "organization" && fail) throw new Error("offline");
      return usage(space, GB);
    }) };
    render(<AccountStorageSection actorId="actor" workspaceId="workspace" repository={repository} />);
    expect(await screen.findByText("暂时无法读取用量，请重试。")).toBeInTheDocument();
    expect(screen.getByText("可用 9 GB")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "刷新存储用量" }));
    expect(await within(screen.getByRole("region", { name: "组织空间" })).findByRole("meter")).toBeInTheDocument();
    expect(screen.queryByText("暂时无法读取用量，请重试。")).toBeNull();
  });

  it("ignores a late response from the previous actor and workspace", async () => {
    let finishOld!: (value: MediaStorageSnapshot) => void;
    const oldResponse = new Promise<MediaStorageSnapshot>((resolve) => { finishOld = resolve; });
    const repository = { getStorageUsage: vi.fn(async (workspace: string, space: MediaStorageSpace) => workspace === "old" ? oldResponse : usage(space, 4 * GB)) };
    const view = render(<AccountStorageSection actorId="old-actor" workspaceId="old" repository={repository} />);
    view.rerender(<AccountStorageSection actorId="new-actor" workspaceId="new" repository={repository} />);
    expect(await screen.findAllByText("可用 6 GB")).toHaveLength(2);
    await act(async () => { finishOld(usage("personal", 9 * GB)); });
    expect(screen.getAllByText("可用 6 GB")).toHaveLength(2);
    expect(screen.queryByText("可用 1 GB")).toBeNull();
  });

  it("handles a zero-capacity personal account without requesting organization storage", async () => {
    const repository = { getStorageUsage: vi.fn(async () => usage("personal", 0, 0, 0)) };
    render(<AccountStorageSection actorId="actor" workspaceId="personal" organization={false} repository={repository} />);
    expect(await screen.findByText("空间已用完，暂时无法保存新文件。")).toBeInTheDocument();
    expect(screen.getByRole("meter").innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.queryByRole("region", { name: "组织空间" })).toBeNull();
    expect(repository.getStorageUsage).toHaveBeenCalledTimes(1);
  });
});
