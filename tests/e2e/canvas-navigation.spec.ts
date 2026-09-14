import { test, expect, openCanvas, canvasFrameSelector } from "./fixtures";

test("demo login, canvas edit, home navigation and refresh preserve the HTTP document", async ({ page }) => {
  const canvas = await openCanvas(page);
  const prompt = `浏览器保存回读 ${Date.now()}：薄雾中的海边灯塔，镜头缓慢推进。`;
  const documentPath = /\/api\/projects\/project-personal-concept\/canvases\/[^/]+\/document$/;
  const previousCount = await canvas.locator(".canvas-node").count();

  await canvas.locator("#canvasShell").dblclick({ position: { x: 280, y: 200 } });
  await canvas.getByRole("menuitem", { name: "图片 添加图片生成节点" }).click();
  await expect(canvas.locator(".canvas-node")).toHaveCount(previousCount + 1);
  const node = canvas.locator(".canvas-node.selected");
  const nodeId = await node.getAttribute("data-id");
  expect(nodeId).toBeTruthy();
  const editor = node.locator('[data-node-prompt-input] [contenteditable="true"]');
  const save = page.waitForResponse(async (response) => response.request().method() === "PUT"
    && documentPath.test(response.url()) && response.ok()
    && JSON.stringify(await response.json()).includes(prompt));
  await editor.fill(prompt);
  await editor.press("Tab");
  const saved = await (await save).json();
  expect(saved.document.projectId).toBe("project-personal-concept");
  expect(saved.document.revision).toBeGreaterThan(0);
  expect(JSON.stringify(saved.document.content)).toContain(nodeId!);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");

  await canvas.getByRole("button", { name: "返回主页", exact: true }).click();
  await expect(page.getByRole("region", { name: "开始创作" })).toBeVisible();
  await expect(page.locator(canvasFrameSelector)).toHaveCount(0);
  await page.getByRole("link", { name: "项目", exact: true }).click();
  const read = page.waitForResponse((response) => response.request().method() === "GET"
    && documentPath.test(response.url()) && response.ok());
  await page.getByRole("link", { name: "打开项目 个人概念短片", exact: true }).click();
  expect(JSON.stringify((await (await read).json()).document.content)).toContain(prompt);
  const restoredNode = page.frameLocator(canvasFrameSelector).locator(`.canvas-node[data-id="${nodeId}"]`);
  await expect(restoredNode).toBeVisible();
  await restoredNode.locator(".media-frame").click();
  await expect(restoredNode.locator('[data-node-prompt-input] [contenteditable="true"]')).toHaveText(prompt);

  const reloadRead = page.waitForResponse((response) => response.request().method() === "GET"
    && documentPath.test(response.url()) && response.ok());
  await page.reload();
  expect(JSON.stringify((await (await reloadRead).json()).document.content)).toContain(prompt);
  await expect(restoredNode).toBeVisible();
  await restoredNode.locator(".media-frame").click();
  await expect(restoredNode.locator('[data-node-prompt-input] [contenteditable="true"]')).toHaveText(prompt);
  await expect(page.frameLocator(canvasFrameSelector).locator("#railCreditValue")).toHaveText("3000");
});
