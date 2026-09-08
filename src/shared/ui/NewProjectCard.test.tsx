// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { NewProjectCard } from "./NewProjectCard";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
});

it("submits a blank personal project from the collaborative view and blocks duplicate submissions", async () => {
  let finish!: (value: { error: string }) => void;
  const submitted = vi.fn();
  const router = createMemoryRouter([{
    path: "/w/one/projects",
    element: <><textarea name="prompt" defaultValue="主页尚未提交的描述" aria-label="页面中的创作描述" /><NewProjectCard personalNote /></>,
    action: async ({ request }) => {
      submitted(Object.fromEntries(await request.formData()));
      return new Promise<{ error: string }>((resolve) => { finish = resolve; });
    },
  }], { initialEntries: ["/w/one/projects?kind=collaborative"] });
  routers.push(router);
  render(<RouterProvider router={router} />);

  const create = screen.getByRole("button", { name: "新建项目" });
  expect(create).toHaveTextContent("创建个人项目");
  fireEvent.click(create);
  await waitFor(() => expect(submitted).toHaveBeenCalledWith({ intent: "create" }));
  expect(create).toBeDisabled();
  fireEvent.click(create);
  expect(submitted).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("textbox", { name: "页面中的创作描述" })).toHaveValue("主页尚未提交的描述");

  await act(async () => finish({ error: "创建失败，请重试。" }));
  expect(create).toBeEnabled();
});
