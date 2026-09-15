import { test, expect, openCanvas } from "./fixtures";

test("sidebar generation completes, adds its result to canvas and locates the matching node", async ({ page }) => {
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
  await expect(canvas.locator(".canvas-node")).toHaveCount(before);

  // Keep this real timer path: it covers the production queued -> running ->
  // succeeded lifecycle, including asynchronous result placement (~11 seconds).
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
  await expect(selected.locator("img.frame-media")).toHaveAttribute("src", resultUrl!);
  await expect(selected).toBeInViewport();
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
});

test("canceling queued sidebar generation refunds once and does not create a result node", async ({ page }) => {
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
  const cancel = record.getByRole("button", { name: "取消生成", exact: true });
  await expect(record.getByRole("button", { name: "重新编辑", exact: true })).toBeVisible();
  await cancel.hover();
  await expect.poll(() => cancel.evaluate((element) => getComputedStyle(element, "::after").opacity)).toBe("1");
  await expect(cancel).toHaveAttribute("aria-description", "发送后 7 秒内可取消，取消后返还本次积分");
  await record.getByRole("button", { name: "取消生成", exact: true }).click();
  await expect(record).toHaveAttribute("data-status", "canceled");
  await expect(record).toContainText("积分已返还");
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
  await expect(record.getByRole("button", { name: "取消生成", exact: true })).toBeHidden();
  await expect(canvas.locator(".canvas-node")).toHaveCount(before);
  // Pass the simulated completion deadline after cancellation to verify that
  // no late result or second refund occurs. The successful flow uses real time.
  await page.clock.fastForward(11_500);
  await expect(record).toHaveAttribute("data-status", "canceled");
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
  await expect(canvas.locator(".canvas-node")).toHaveCount(before);
});

test("cancel deadline keeps re-edit available and returns keyboard focus", async ({ page }) => {
  const canvas = await openCanvas(page, "角色动画短片_第 3 版");
  await page.clock.install();
  const prompt = `取消窗口到期 ${Date.now()}`;
  await canvas.locator('#agentInput [contenteditable="true"]').fill(prompt);
  await canvas.locator(".agent-send").click();
  const record = canvas.locator("#agentGenerationRecords .generation-record").filter({ hasText: prompt });
  const edit = record.getByRole("button", { name: "重新编辑", exact: true });
  const cancel = record.getByRole("button", { name: "取消生成", exact: true });
  await edit.focus();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await expect.poll(() => cancel.evaluate((element) => getComputedStyle(element, "::after").opacity)).toBe("1");
  await page.clock.fastForward(7_100);
  await expect(cancel).toBeHidden();
  await expect(edit).toBeFocused();
  await expect(record).toHaveAttribute("data-status", "running");
  await edit.click();
  await expect(canvas.locator('#agentInput [contenteditable="true"]')).toHaveText(prompt);
  await expect(record).toHaveAttribute("data-status", "running");
});
