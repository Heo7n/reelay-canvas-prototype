import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type FrameLocator, type Page } from "@playwright/test";
import { startBrowserTestServer } from "./server";

export const canvasFrameSelector = 'iframe[title="Reelay 项目画布"]';

// The application simulates results with public sample media. Fulfill only those
// samples locally; neither browser traffic nor tests may touch shared services.
const sampleMedia = new Map([
  ["https://picsum.photos/seed/reelay-canvas/1280/720", ["assets/reelay-logo.png", "image/png"]],
  ["https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", ["assets/experience-media/seedance-empty-state-7ed500ba.webm", "video/webm"]],
  ["https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3", ["assets/experience-media/scanner-pulse-b7382270.mp3", "audio/mpeg"]],
]);

type BrowserTestServer = Awaited<ReturnType<typeof startBrowserTestServer>>;

export const test = base.extend<{ runtimeGuard: void }, { browserTestServer: BrowserTestServer }>({
  browserTestServer: [async ({}, use) => {
    const server = await startBrowserTestServer();
    try { await use(server); } finally { await server.close(); }
  }, { scope: "worker" }],
  baseURL: async ({ browserTestServer }, use) => { await use(browserTestServer.origin); },
  runtimeGuard: [async ({ page, context, baseURL, browserTestServer }, use) => {
    const { origin } = browserTestServer;
    expect(baseURL, "E2E must use the isolated in-memory HTTP server").toBe(origin);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await context.route(/^https?:\/\//, async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      const media = sampleMedia.get(url.href);
      if (media) {
        return route.fulfill({ status: 200, contentType: media[1], body: await readFile(resolve(media[0])) });
      }
      errors.push(`Blocked request outside isolated E2E server: ${url.href}`);
      await route.abort("blockedbyclient");
    });
    await use();
    expect(errors, "Browser console, uncaught exceptions, and unexpected network requests").toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function openCanvas(page: Page, projectName = "个人概念短片"): Promise<FrameLocator> {
  await page.goto("/");
  await page.getByRole("button", { name: "注册/登录", exact: true }).click();
  const login = page.getByRole("dialog", { name: "欢迎登录" });
  await login.getByRole("textbox", { name: "账号", exact: true }).fill("creator@reelay.test");
  await login.getByLabel("密码", { exact: true }).fill("reelay-demo");
  await login.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("region", { name: "开始创作" })).toBeVisible();
  await page.getByRole("link", { name: "项目", exact: true }).click();
  await expect(page.getByRole("heading", { name: "全部项目", exact: true })).toBeVisible();
  if (await page.getByRole("link", { name: `打开项目 ${projectName}`, exact: true }).count() === 0) {
    await page.getByRole("link", { name: "协作", exact: true }).click();
  }
  await page.getByRole("link", { name: `打开项目 ${projectName}`, exact: true }).click();
  const canvas = page.frameLocator(canvasFrameSelector);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await expect(canvas.locator("#canvasShell")).toBeVisible();
  if (await canvas.getByRole("button", { name: "展开 Reelay Agent", exact: true }).isVisible()) {
    await canvas.getByRole("button", { name: "展开 Reelay Agent", exact: true }).click();
  }
  await expect(canvas.locator('#agentInput [contenteditable="true"]')).toBeVisible();
  await canvas.getByRole("button", { name: "新建对话", exact: true }).click();
  await expect(canvas.locator("#agentGenerationRecords .generation-record")).toHaveCount(0);
  return canvas;
}
