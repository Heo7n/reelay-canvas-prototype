import type { Page } from "@playwright/test";
import type { LegacyCanvasDocumentV1 } from "../../src/contracts/canvas-document-v1";
import { test, expect, openCanvas, canvasFrameSelector } from "./fixtures";

type DocumentResponse = { document: { revision: number; content: LegacyCanvasDocumentV1 } };

async function createSavedGenerator(page: Page) {
  await openCanvas(page);
  const workspace = new URL(page.url()).pathname.match(/\/w\/([^/]+)\/projects\//)?.[1];
  if (!workspace) throw new Error("Expected an authenticated workspace route.");
  // The HTTP test server is worker-scoped. Use a fresh private project so a
  // preceding test's saved nodes cannot occupy this test's creation location.
  const created = await page.request.post(`/api/workspaces/${workspace}/projects`, {
    data: { name: `保存恢复验收 ${Date.now()}`, accessKind: "private" },
  });
  expect(created.status()).toBe(201);
  const projectId = (await created.json() as { project: { id: string } }).project.id;
  const documentPath = `/api/projects/${encodeURIComponent(projectId)}/canvases/main/document`;
  await page.goto(`/app/w/${workspace}/projects/${encodeURIComponent(projectId)}/canvases/main`);
  const canvas = page.frameLocator(canvasFrameSelector);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await expect(canvas.locator(".app-shell")).toHaveAttribute("data-canvas-access", "editable");
  const baseline = `恢复前已保存 ${Date.now()}`;
  await canvas.locator("#canvasShell").dblclick({ position: { x: 280, y: 200 } });
  await canvas.getByRole("menuitem", { name: "图片 添加图片生成节点" }).click();
  const node = canvas.locator(".canvas-node.selected");
  const nodeId = await node.getAttribute("data-id");
  if (!nodeId) throw new Error("Expected a newly created generator node.");
  const editor = node.locator('[data-node-prompt-input] [contenteditable="true"]');
  const saved = page.waitForResponse(async (response) => response.request().method() === "PUT"
    && new URL(response.url()).pathname === documentPath && response.ok()
    && JSON.stringify(await response.json()).includes(baseline));
  await editor.fill(baseline);
  await editor.press("Tab");
  const document = (await (await saved).json() as DocumentResponse).document;
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  return { canvas, nodeId, editor, document, documentPath };
}

test("expired login preserves the editing frame and resumes saving with the original account", async ({ page, context, expectedHttpErrors }) => {
  const { canvas, nodeId, editor, documentPath } = await createSavedGenerator(page);
  const frame = await page.locator(canvasFrameSelector).elementHandle();
  if (!frame) throw new Error("Expected the editing iframe.");
  const originalUrl = page.url();
  await page.clock.install();
  expect((await context.request.delete("/api/session")).ok()).toBe(true);
  expectedHttpErrors.push({ pathname: documentPath, status: 401, remaining: 1 });
  let attempts = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && new URL(request.url()).pathname === documentPath) attempts += 1;
  });
  const prompt = `登录失效后仍需保留 ${Date.now()}`;
  const failedSave = page.waitForResponse((response) => response.request().method() === "PUT"
    && new URL(response.url()).pathname === documentPath && response.status() === 401);
  await editor.fill(prompt);
  await editor.press("Tab");
  await page.clock.fastForward(1000);
  await failedSave;
  const recovery = page.getByRole("dialog", { name: "恢复画布保存", exact: true });
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText("登录已失效");
  await expect(recovery.getByLabel("账号", { exact: true })).toHaveValue("creator@reelay.test");
  await expect(canvas.locator(".app-shell")).toHaveAttribute("data-canvas-access", "blocked");
  await page.clock.fastForward(10_000);
  expect(attempts).toBe(1);
  expect(page.url()).toBe(originalUrl);

  const resumed = page.waitForResponse(async (response) => response.request().method() === "PUT"
    && new URL(response.url()).pathname === documentPath && response.ok()
    && JSON.stringify(await response.json()).includes(prompt));
  await recovery.getByLabel("密码", { exact: true }).fill("reelay-demo");
  await recovery.getByRole("button", { name: "登录并恢复保存", exact: true }).click();
  await expect(recovery).toBeHidden();
  await page.clock.fastForward(1000);
  await resumed;
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await expect(canvas.locator(".app-shell")).toHaveAttribute("data-canvas-access", "editable");
  expect(await frame.evaluate((element) => element.isConnected)).toBe(true);
  expect(page.url()).toBe(originalUrl);
  await expect(canvas.locator(`.canvas-node[data-id="${nodeId}"]`)).toBeVisible();
  const persisted = await context.request.get(documentPath);
  expect(JSON.stringify((await persisted.json() as DocumentResponse).document.content)).toContain(prompt);
});

test("a conflicting save preserves the remote revision and saves every local canvas as a separate copy", async ({ page, context, expectedHttpErrors }) => {
  const { editor, document, documentPath } = await createSavedGenerator(page);
  const localCanvasId = document.content.activeCanvasId;
  const remoteContent = structuredClone(document.content);
  const remoteCanvas = remoteContent.canvases.find((canvas) => canvas.id === localCanvasId);
  if (!remoteCanvas) throw new Error("Expected the active canvas in the saved document.");
  const remoteName = `另一窗口的修改 ${Date.now()}`;
  remoteCanvas.name = remoteName;
  const remoteWrite = await context.request.put(documentPath, { data: {
    schemaVersion: 1, expectedRevision: document.revision, content: remoteContent,
  } });
  expect(remoteWrite.ok()).toBe(true);
  const remoteDocument = (await remoteWrite.json() as DocumentResponse).document;
  expectedHttpErrors.push({ pathname: documentPath, status: 409, remaining: 1 });
  const localPrompt = `冲突后必须另存的本地修改 ${Date.now()}`;
  const conflict = page.waitForResponse((response) => response.request().method() === "PUT"
    && new URL(response.url()).pathname === documentPath && response.status() === 409);
  await editor.fill(localPrompt);
  await editor.press("Tab");
  await conflict;
  const recovery = page.getByRole("dialog", { name: "恢复画布保存", exact: true });
  await expect(recovery).toContainText("画布已有新版本");
  // Loading the current server version cannot discard local work on the first click.
  await recovery.getByRole("button", { name: "加载最新版本", exact: true }).click();
  await expect(recovery).toContainText("放弃未保存的修改？");
  await expect(recovery.getByRole("button", { name: "保留当前修改", exact: true })).toBeFocused();
  await recovery.getByRole("button", { name: "保留当前修改", exact: true }).click();
  const savedCopy = page.waitForResponse((response) => response.request().method() === "PUT"
    && new URL(response.url()).pathname === documentPath && response.ok());
  await recovery.getByRole("button", { name: "保存为副本", exact: true }).click();
  const recovered = (await (await savedCopy).json() as DocumentResponse).document;
  await expect(recovery).toBeHidden();
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  expect(recovered.revision).toBe(remoteDocument.revision + 1);
  expect(recovered.content.canvases.find((canvas) => canvas.id === localCanvasId)).toEqual(remoteCanvas);
  const originalIds = new Set(remoteContent.canvases.map((canvas) => canvas.id));
  const copies = recovered.content.canvases.filter((canvas) => !originalIds.has(canvas.id));
  expect(copies).toHaveLength(document.content.canvases.length);
  expect(copies.every((canvas) => canvas.name.endsWith(" · 恢复副本"))).toBe(true);
  expect(JSON.stringify(copies)).toContain(localPrompt);
  const reloadRead = page.waitForResponse((response) => response.request().method() === "GET"
    && new URL(response.url()).pathname === documentPath && response.ok());
  await page.reload();
  const restored = (await (await reloadRead).json() as DocumentResponse).document;
  expect(restored.content).toEqual(recovered.content);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
});
