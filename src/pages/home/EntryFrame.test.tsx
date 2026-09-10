// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { EntryFrame } from "./EntryFrame";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  window.localStorage.clear();
  window.sessionStorage.clear();
});

it("starts collapsed and preserves an explicit sidebar choice across page navigation", async () => {
  const router = createMemoryRouter([
    { path: "/w/one", element: <EntryFrame workspaceId="one" activePage="home" header={null}>主页内容</EntryFrame> },
    { path: "/w/one/projects", element: <EntryFrame workspaceId="one" activePage="projects" header={null}>项目列表</EntryFrame> },
    { path: "/w/one/organization", element: <EntryFrame workspaceId="one" activePage="organization" header={null}>组织资料</EntryFrame> },
  ], { initialEntries: ["/w/one"] });
  routers.push(router);
  render(<RouterProvider router={router} />);
  expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
  expect(screen.getByRole("button", { name: "收起侧栏" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("link", { name: "项目" }));
  await screen.findByText("项目列表");
  expect(screen.getByRole("button", { name: "收起侧栏" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "项目" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(screen.getByRole("link", { name: "组织中心" }));
  await screen.findByText("组织资料");
  expect(screen.getByRole("link", { name: "组织中心" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "项目" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("button", { name: "收起侧栏" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
  expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveAttribute("aria-expanded", "false");
  await act(async () => { await router.navigate("/w/one"); });
  expect(screen.getByRole("button", { name: "展开侧栏" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "新建项目" })).not.toBeInTheDocument();
});

it("keeps organization and project navigation out of the visitor frame", () => {
  const router = createMemoryRouter([
    { path: "/", element: <EntryFrame activePage="home" header={null}>访客首页</EntryFrame> },
  ]);
  routers.push(router);
  render(<RouterProvider router={router} />);
  expect(screen.getByRole("link", { name: "首页" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "项目" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "组织中心" })).not.toBeInTheDocument();
});
