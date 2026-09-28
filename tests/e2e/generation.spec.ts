import { test, expect, openCanvas } from "./fixtures";
import type { LegacyCanvasDocumentV1 } from "../../src/contracts/canvas-document-v1";

test("sidebar generation immediately adds a pending node, fills it on completion and locates the same node", async ({ page }) => {
  const canvas = await openCanvas(page, "香水品牌 TVC_最终版");
  await expect(canvas.locator("#agentModeBtn")).toHaveAccessibleName("当前模式：生成模式");
  await canvas.locator("#agentModelBtn").click();
  await canvas.getByRole("button", { name: "GPT Image 2", exact: true }).click();
  const prompt = `晨光中的玻璃香水瓶 ${Date.now()}`;
  await canvas.locator('#agentInput [contenteditable="true"]').fill(prompt);
  const before = await canvas.locator(".canvas-node").count();
  const cost = Number(await canvas.locator("#agentCreditValue").innerText());
  expect(cost).toBeGreaterThan(0);
  await canvas.locator(".agent-send").click();
  const record = canvas.locator("#agentGenerationRecords .generation-record").filter({ hasText: prompt });
  await expect(record).toHaveCount(1);
  await expect(record).toHaveAttribute("data-status", /queued|running/);
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - cost));
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  const pending = canvas.locator(".canvas-node").filter({ has: canvas.locator(".generating-preview") });
  await expect(pending).toHaveCount(1);
  const pendingId = await pending.getAttribute("data-id");
  await expect(pending.locator(".prompt-panel")).toHaveCount(0);
  const pendingPosition = await pending.evaluate((element) => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top }));

  // Keep this real timer path: it covers the production queued -> running ->
  // succeeded lifecycle, including filling the same canvas placeholder (7.5 seconds).
  await expect(record).toHaveAttribute("data-status", "succeeded", { timeout: 20_000 });
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  const image = record.locator(".generation-record-media");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
  const resultUrl = await record.locator(".generation-record-output").getAttribute("data-result-url");
  await record.getByRole("button", { name: "定位画布中的生成结果", exact: true }).click();
  const selected = canvas.locator(".canvas-node.selected");
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveClass(/asset-node/);
  await expect(selected).toHaveAttribute("data-id", pendingId!);
  expect(await selected.evaluate((element) => ({ left: (element as HTMLElement).style.left, top: (element as HTMLElement).style.top }))).toEqual(pendingPosition);
  await expect(selected.locator("img.frame-media")).toHaveAttribute("src", resultUrl!);
  await expect(selected).toBeInViewport();
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
});

test("canceling queued sidebar generation removes its pending node and refunds once", async ({ page }) => {
  const canvas = await openCanvas(page, "角色动画短片_第 3 版");
  await page.clock.install();
  const prompt = `取消生成边界 ${Date.now()}`;
  await canvas.locator('#agentInput [contenteditable="true"]').fill(prompt);
  const before = await canvas.locator(".canvas-node").count();
  const cost = Number(await canvas.locator("#agentCreditValue").innerText());
  expect(cost).toBeGreaterThan(0);
  await canvas.locator(".agent-send").click();
  const record = canvas.locator("#agentGenerationRecords .generation-record").filter({ hasText: prompt });
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - cost));
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  await expect(canvas.locator(".generating-preview")).toBeVisible();
  const cancel = record.getByRole("button", { name: "取消生成", exact: true });
  await expect(record.getByRole("button", { name: "重新编辑", exact: true })).toBeVisible();
  await expect(cancel).toHaveAttribute("aria-description", "发送后 5 秒内可取消，取消后返还本次积分");
  await record.getByRole("button", { name: "取消生成", exact: true }).click();
  await expect(record).toHaveAttribute("data-status", "canceled");
  await expect(record).toContainText("积分已返还");
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
  await expect(record.getByRole("button", { name: "取消生成", exact: true })).toBeHidden();
  await expect(canvas.locator(".canvas-node")).toHaveCount(before);
  // Pass the simulated completion deadline after cancellation to verify that
  // no late result or second refund occurs. The successful flow uses real time.
  await page.clock.fastForward(8000);
  await expect(record).toHaveAttribute("data-status", "canceled");
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
  await expect(canvas.locator(".canvas-node")).toHaveCount(before);
});

test("cancel deadline keeps both status rows visible and disables cancellation", async ({ page }) => {
  const canvas = await openCanvas(page, "角色动画短片_第 3 版");
  await page.clock.install();
  const prompt = `取消窗口到期 ${Date.now()}`;
  await canvas.locator('#agentInput [contenteditable="true"]').fill(prompt);
  await canvas.locator(".agent-send").click();
  const record = canvas.locator("#agentGenerationRecords .generation-record").filter({ hasText: prompt });
  const edit = record.getByRole("button", { name: "重新编辑", exact: true });
  const cancel = record.getByRole("button", { name: "取消生成", exact: true });
  const pending = canvas.locator(".canvas-node").filter({ has: canvas.locator(".generating-preview") });
  const nodeCancel = pending.getByRole("button", { name: "取消生成", exact: true });
  await expect(cancel).toBeEnabled();
  await expect(nodeCancel).toBeEnabled();
  await page.clock.fastForward(1_500);
  await expect(pending.locator("[data-generation-progress]")).toHaveText(await record.locator("[data-generation-progress]").innerText());
  await page.clock.fastForward(5_600);
  await expect(cancel).toBeVisible();
  await expect(cancel).toBeDisabled();
  await expect(nodeCancel).toBeVisible();
  await expect(nodeCancel).toBeDisabled();
  await expect(cancel).toHaveAttribute("aria-description", "已进入生成阶段，当前无法取消");
  await expect(pending.locator("[data-generation-progress]")).toHaveText(await record.locator("[data-generation-progress]").innerText());
  await expect(record).toHaveAttribute("data-status", "running");
  await edit.click();
  await expect(canvas.locator('#agentInput [contenteditable="true"]')).toHaveText(prompt);
  await expect(record).toHaveAttribute("data-status", "running");
});

test("a saved sample survives refresh and its node can generate a separately charged final without replacing the sample", async ({ page }) => {
  const canvas = await openCanvas(page);
  await page.clock.install();
  const prompt = `样片保存与成片接续 ${Date.now()}：清晨湖边，一艘白色小船缓缓驶过。`;
  const documentPath = /\/api\/projects\/project-personal-concept\/canvases\/[^/]+\/document$/;
  const before = await canvas.locator(".canvas-node").count();
  await canvas.locator("#agentModelBtn").click();
  await canvas.getByRole("button", { name: "Seedance 2.5（样片模式）", exact: true }).click();
  await canvas.locator('#agentInput [contenteditable="true"]').fill(prompt);
  const draftCost = Number(await canvas.locator("#agentCreditValue").innerText());
  expect(draftCost).toBeGreaterThan(0);
  const sampleSave = page.waitForResponse(async (response) => {
    if (response.request().method() !== "PUT" || !documentPath.test(response.url()) || !response.ok()) return false;
    const content = JSON.stringify(await response.json());
    return content.includes(prompt) && content.includes('"stage":"draft"');
  });
  await canvas.locator(".agent-send").click();
  const sampleRecord = canvas.locator("#agentGenerationRecords .generation-record").filter({ hasText: prompt });
  await expect(sampleRecord).toHaveAttribute("data-status", /queued|running/);
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - draftCost));
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  const pendingSample = canvas.locator(".canvas-node").filter({ has: canvas.locator(".generating-preview") });
  const pendingSampleId = await pendingSample.getAttribute("data-id");
  await expect(pendingSample.locator(".node-draft-label")).toHaveText("样片 480P");
  await page.clock.fastForward(8000);
  await expect(sampleRecord).toHaveAttribute("data-status", "succeeded");
  await expect(sampleRecord.locator(".generation-media-resolution")).toHaveText("样片 480P");
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  const savedSample = await (await sampleSave).json() as { document: { content: LegacyCanvasDocumentV1 } };
  const sourceNode = savedSample.document.content.canvases.flatMap((item) => item.nodes).find((node) =>
    node.assets.some((asset) => asset.generation?.stage === "draft" && asset.generation.input.prompt === prompt));
  const sourceAsset = sourceNode?.assets.find((asset) => asset.generation?.stage === "draft" && asset.generation.input.prompt === prompt);
  if (!sourceNode || !sourceAsset?.generation) throw new Error("Saved sample must retain its result provenance through the HTTP boundary.");
  expect(sourceNode.id).toBe(pendingSampleId);
  expect(sourceAsset.generation.input.cost).toBe(draftCost);
  expect(sourceAsset.generation.input.parameters.quality).toBe("480p");
  expect(sourceAsset.generation.expiresAt).toBe(sourceAsset.generation.createdAt + 604800000);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");

  // Refresh destroys the task service and its memory. Conversion must recover
  // solely from the CanvasDocument read through Host and the real HTTP API.
  const reloadRead = page.waitForResponse((response) => response.request().method() === "GET"
    && documentPath.test(response.url()) && response.ok());
  await page.reload();
  const loadedSample = await (await reloadRead).json() as { document: { content: LegacyCanvasDocumentV1 } };
  const restoredSource = loadedSample.document.content.canvases.flatMap((item) => item.nodes)
    .find((node) => node.id === sourceNode.id)?.assets.find((asset) => asset.id === sourceAsset.id);
  expect(restoredSource?.generation).toEqual(sourceAsset.generation);
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  await canvas.getByRole("button", { name: "适应视图", exact: true }).click();
  const sampleNode = canvas.locator(`.canvas-node[data-id="${sourceNode.id}"]`);
  await expect(sampleNode).toBeVisible();
  await sampleNode.locator(".media-frame").click({ position: { x: 12, y: 12 } });
  const finalAction = sampleNode.getByRole("button", { name: "生成正片 1080P", exact: true });
  await expect(finalAction).toBeEnabled();
  await finalAction.click();
  const dialog = canvas.getByRole("dialog", { name: "正片生成参数", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-draft-resolution]")).toHaveText("1080P");
  await expect(dialog.getByRole("radio", { name: "MP4", exact: true })).toBeChecked();
  await dialog.getByText("MOV", { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "MOV", exact: true })).toBeChecked();
  const finalCost = Number(await dialog.locator("[data-draft-cost]").innerText());
  expect(finalCost).toBeGreaterThan(draftCost);
  const finalSave = page.waitForResponse(async (response) => response.request().method() === "PUT"
    && documentPath.test(response.url()) && response.ok()
    && JSON.stringify(await response.json()).includes(`"sourceDraftTaskId":"${sourceAsset.generation!.taskId}"`));
  await dialog.getByRole("button", { name: /^生成正片，消耗/ }).click();
  await expect(dialog).toBeHidden();
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - finalCost));
  const finalRecord = canvas.locator("#agentGenerationRecords .generation-record").filter({ has: canvas.locator(".generation-record-final-source") });
  await expect(finalRecord).toHaveAttribute("data-status", /queued|running/);
  await expect(finalRecord.locator(".generation-record-prompt, .generation-record-references")).toHaveCount(0);
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 2);
  await expect(canvas.locator(".generating-preview")).toBeVisible();
  await page.clock.fastForward(8000);
  await expect(finalRecord).toHaveAttribute("data-status", "succeeded");
  await expect(finalRecord.locator(".generation-media-resolution")).toHaveText("正片 1080P");
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 2);
  const savedFinal = await (await finalSave).json() as { document: { content: LegacyCanvasDocumentV1 } };
  const savedNodes = savedFinal.document.content.canvases.flatMap((item) => item.nodes);
  const finalNode = savedNodes.find((node) => node.assets.some((asset) => asset.generation?.stage === "final"
    && asset.generation.sourceDraftTaskId === sourceAsset.generation!.taskId));
  const finalAsset = finalNode?.assets.find((asset) => asset.generation?.stage === "final");
  expect(finalNode?.id).toBeTruthy();
  expect(finalNode?.id).not.toBe(sourceNode.id);
  expect(finalAsset?.url).toBe(sourceAsset.url);
  expect(finalAsset?.generation).toMatchObject({ stage: "final", sourceDraftTaskId: sourceAsset.generation.taskId,
    sourceResultId: sourceAsset.generation.resultId, input: { prompt, cost: finalCost, parameters: { quality: "1080p", outputFormat: "mov" } } });
  expect(savedNodes.find((node) => node.id === sourceNode.id)?.assets.find((asset) => asset.id === sourceAsset.id)?.generation)
    .toEqual(sourceAsset.generation);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - finalCost));

  const finalReload = page.waitForResponse((response) => response.request().method() === "GET"
    && documentPath.test(response.url()) && response.ok());
  await page.reload();
  const loadedFinal = await (await finalReload).json() as { document: { content: LegacyCanvasDocumentV1 } };
  const loadedNodes = loadedFinal.document.content.canvases.flatMap((item) => item.nodes);
  expect(loadedNodes.find((node) => node.id === finalNode?.id)?.assets[0].generation).toEqual(finalAsset?.generation);
  expect(loadedNodes.find((node) => node.id === sourceNode.id)?.assets[0].generation).toEqual(sourceAsset.generation);
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 2);
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
});
