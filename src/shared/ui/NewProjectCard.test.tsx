// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NewProjectCard } from "./NewProjectCard";

afterEach(cleanup);

function renderNewProjectCard(
  action: ({ request }: { request: Request }) => Promise<unknown> = async () => null,
  props: { description?: string; label?: string } = {},
): void {
  const router = createMemoryRouter(
    [{
      path: "*",
      action,
      element: <NewProjectCard {...props} />,
    }],
    { initialEntries: ["/w/workspace-organization/projects"] },
  );
  render(<RouterProvider router={router} />);
}

describe("NewProjectCard", () => {
  it("keeps the default homepage label while making private visibility explicit", () => {
    renderNewProjectCard();

    expect(screen.getByText("新建项目")).toBeInTheDocument();
    expect(screen.getByText("个人项目 · 仅自己可见")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建项目，创建仅自己可见的个人项目" })).toBeEnabled();
  });

  it("supports custom copy and prevents another create while the request is pending", async () => {
    const submitted = vi.fn();
    let resolveAction: ((value: unknown) => void) | undefined;
    renderNewProjectCard(async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return new Promise((resolve) => {
        resolveAction = resolve;
      });
    }, {
      description: "默认只对当前账号开放",
      label: "创建个人草稿",
    });

    fireEvent.click(screen.getByRole("button", {
      name: "创建个人草稿，创建仅自己可见的个人项目",
    }));

    await waitFor(() => expect(submitted).toHaveBeenCalledWith({ intent: "create" }));
    const pendingButton = screen.getByRole("button", { name: "正在创建个人项目" });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("正在创建…")).toBeInTheDocument();

    resolveAction?.({ ok: true });
    await waitFor(() => expect(pendingButton).toBeEnabled());
  });
});
