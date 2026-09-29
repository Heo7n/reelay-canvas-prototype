import type { Page } from "@playwright/test";
import type { LegacyCanvasDocumentV1 } from "../../src/contracts/canvas-document-v1";
import { test, expect, openCanvas, canvasFrameSelector } from "./fixtures";

type SavedDocument = { revision: number; content: LegacyCanvasDocumentV1 };
type DocumentResponse = { document: SavedDocument };

function canvasNodes(document: SavedDocument, canvasId: string) {
  const canvas = document.content.canvases.find((item) => item.id === canvasId);
  if (!canvas) throw new Error("Expected the edited canvas in the saved document.");
  return canvas.nodes;
}

async function createSavedGenerator(page: Page) {
  const canvas = await openCanvas(page);
  await canvas.getByRole("button", { name: "收起 Reelay Agent", exact: true }).click();
  const route = new URL(page.url()).pathname.match(/\/projects\/([^/]+)\/canvases\/([^/]+)$/);
  if (!route) throw new Error("Expected an authenticated canvas route.");
  const documentPath = `/api/projects/${route[1]}/canvases/${route[2]}/document`;
  const prompt = `拖动前已保存 ${Date.now()}`;
  await canvas.locator("#canvasShell").dblclick({ position: { x: 280, y: 200 } });
  await canvas.getByRole("menuitem", { name: "图片 添加图片生成节点", exact: true }).click();
  const node = canvas.locator(".canvas-node.selected");
  const nodeId = await node.getAttribute("data-id");
  if (!nodeId) throw new Error("Expected a newly created generator node.");
  const editor = node.locator('[data-node-prompt-input] [contenteditable="true"]');
  const saved = page.waitForResponse(async (response) => response.request().method() === "PUT"
    && new URL(response.url()).pathname === documentPath && response.ok()
    && JSON.stringify(await response.json()).includes(prompt));
  await editor.fill(prompt);
  await editor.press("Tab");
  const document = (await (await saved).json() as DocumentResponse).document;
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  return { canvas, nodeId, editor, document, documentPath };
}

for (const duplicate of [false, true]) {
  test(duplicate
    ? "Alt-drag previews never enter an unrelated autosave, and Escape leaves no copy after refresh"
    : "a held node drag stays out of an unrelated autosave, and Escape preserves its origin after refresh", async ({ page }) => {
    const { canvas, nodeId, editor, document, documentPath } = await createSavedGenerator(page);
    const canvasId = document.content.activeCanvasId;
    const originalNodes = canvasNodes(document, canvasId);
    const originalIds = originalNodes.map((node) => node.id).sort();
    const originalNode = originalNodes.find((node) => node.id === nodeId);
    if (!originalNode) throw new Error("Expected the new node in the saved baseline.");
    const origin = { x: originalNode.x, y: originalNode.y };
    const source = canvas.locator(`.canvas-node[data-id="${nodeId}"]`);
    const media = source.locator(".media-frame");
    const before = await media.boundingBox();
    if (!before) throw new Error("Expected the draggable media frame to be visible.");

    // Pause only browser timers. The prompt starts a real debounced HTTP save,
    // which is released while the real mouse is still holding the drag.
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
    const prompt = `持住拖动时保存的提示词 ${Date.now()}`;
    const saveDuringDrag = page.waitForResponse(async (response) => response.request().method() === "PUT"
      && new URL(response.url()).pathname === documentPath && response.ok()
      && JSON.stringify(await response.json()).includes(prompt));
    await editor.fill(prompt);
    await editor.press("Tab");
    const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await page.mouse.move(start.x, start.y);
    if (duplicate) await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(start.x + 140, start.y + 85);
    await page.clock.runFor(32);
    await expect(canvas.locator(".canvas-node")).toHaveCount(originalIds.length + Number(duplicate));
    const movingMedia = canvas.locator(".canvas-node.selected .media-frame");
    await expect(movingMedia).toHaveCount(1);
    await expect.poll(async () => (await movingMedia.boundingBox())?.x ?? -1).toBeGreaterThan(before.x + 100);

    await page.clock.fastForward(1_000);
    const heldSave = (await (await saveDuringDrag).json() as DocumentResponse).document;
    expect(heldSave.revision).toBeGreaterThan(document.revision);
    const heldNodes = canvasNodes(heldSave, canvasId);
    expect(heldNodes.map((node) => node.id).sort()).toEqual(originalIds);
    expect(heldNodes.find((node) => node.id === nodeId)).toMatchObject(origin);
    // The response must settle before cancellation; a later cleanup save cannot
    // hide an intermediate position or an Alt-copy that reached persistence.
    await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
    await expect.poll(async () => (await movingMedia.boundingBox())?.x ?? -1).toBeGreaterThan(before.x + 100);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    if (duplicate) await page.keyboard.up("Alt");
    await page.clock.fastForward(1_000);
    await expect(canvas.locator(".canvas-node")).toHaveCount(originalIds.length);
    await expect.poll(async () => (await media.boundingBox())?.x ?? -1).toBeCloseTo(before.x, 0);
    await expect.poll(async () => (await media.boundingBox())?.y ?? -1).toBeCloseTo(before.y, 0);
    await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
    await page.clock.resume();

    const reloadRead = page.waitForResponse((response) => response.request().method() === "GET"
      && new URL(response.url()).pathname === documentPath && response.ok());
    await page.reload();
    const restored = (await (await reloadRead).json() as DocumentResponse).document;
    const restoredNodes = canvasNodes(restored, canvasId);
    expect(restoredNodes.map((node) => node.id).sort()).toEqual(originalIds);
    expect(restoredNodes.find((node) => node.id === nodeId)).toMatchObject(origin);
    expect(JSON.stringify(restoredNodes.find((node) => node.id === nodeId)?.prompt)).toContain(prompt);
    const restoredCanvas = page.frameLocator(canvasFrameSelector);
    await expect(restoredCanvas.locator(".app-shell")).toHaveAttribute("data-canvas-access", "editable");
    await expect(restoredCanvas.locator(".canvas-node")).toHaveCount(originalIds.length);
    await expect(restoredCanvas.locator(`.canvas-node[data-id="${nodeId}"]`)).toBeVisible();
  });
}
