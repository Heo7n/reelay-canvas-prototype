// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { createMemoryRouter, RouterProvider, useActionData } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { CreationEntry } from "./CreationEntry";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  window.sessionStorage.clear();
});

function Home() {
  const [prompt, setPrompt] = useState("");
  const error = useActionData() as string | undefined;
  return <><CreationEntry prompt={prompt} onPromptChange={setPrompt} />{error ? <p role="alert">{error}</p> : null}</>;
}

it("creates a blank project, prevents duplicate submissions and allows retry after failure", async () => {
  let finish!: (value: string) => void;
  const action = vi.fn(async ({ request }: { request: Request }) => {
    const form = await request.formData();
    expect(form.get("intent")).toBe("create");
    expect(form.get("prompt")).toBe("");
    return new Promise<string>((resolve) => { finish = resolve; });
  });
  const router = createMemoryRouter([{ path: "/", element: <Home />, action }]);
  routers.push(router);
  render(<RouterProvider router={router} />);
  const create = screen.getByRole("button", { name: "新建项目" });
  fireEvent.click(create);
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(create).toBeDisabled();
  expect(create).toHaveTextContent("正在创建…");
  fireEvent.click(create);
  fireEvent.submit(create.closest("form")!);
  expect(action).toHaveBeenCalledTimes(1);
  await act(async () => finish("创建失败，请重试。"));
  expect(await screen.findByRole("alert")).toHaveTextContent("创建失败");
  expect(create).toBeEnabled();
  fireEvent.click(create);
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  await act(async () => finish(""));
});

it("submits only real input, preserves it after failure, and respects IME and multiline entry", async () => {
  let finish!: (value: string) => void;
  const action = vi.fn(async ({ request }: { request: Request }) => {
    expect((await request.formData()).get("prompt")).toBe("窗边的产品静物\n柔和的晨光");
    return new Promise<string>((resolve) => { finish = resolve; });
  });
  const router = createMemoryRouter([{ path: "/", element: <Home />, action }]);
  routers.push(router);
  render(<RouterProvider router={router} />);
  const input = screen.getByRole("textbox", { name: "描述你的创作需求" });
  expect(input).toHaveValue("");
  fireEvent.focus(input);
  expect(screen.queryByText("生成一张", { exact: false })).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "窗边的产品静物\n柔和的晨光" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  expect(action).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(input).toHaveAttribute("readonly");
  await act(async () => finish("暂时无法创建项目，请重试。"));
  expect(input).toHaveValue("窗边的产品静物\n柔和的晨光");
  expect(input).not.toHaveAttribute("readonly");
});
