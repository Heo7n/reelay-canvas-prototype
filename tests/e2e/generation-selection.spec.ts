import { test, expect, openCanvas } from "./fixtures";

test("batch deletion confirms the selected history and preserves generated canvas media and credits", async ({ page }) => {
  const canvas = await openCanvas(page, "香水品牌 TVC_最终版");
  await page.clock.install();
  await canvas.locator("#agentModelBtn").click();
  await canvas.getByRole("button", { name: "GPT Image 2", exact: true }).click();
  const editor = canvas.locator('#agentInput [contenteditable="true"]');
  const records = canvas.locator("#agentGenerationRecords .generation-record");
  const nodeCount = await canvas.locator(".canvas-node").count();

  await editor.fill("批量删除：保留晨光中的香水瓶结果");
  await canvas.locator(".agent-send").click();
  await page.clock.fastForward(11_500);
  const success = records.filter({ hasText: "批量删除：保留晨光中的香水瓶结果" });
  await expect(success).toHaveAttribute("data-status", "succeeded");
  await expect(canvas.locator(".canvas-node")).toHaveCount(nodeCount + 1);

  await editor.fill("批量删除：已取消的另一条记录");
  await canvas.locator(".agent-send").click();
  const canceled = records.filter({ hasText: "批量删除：已取消的另一条记录" });
  await canceled.getByRole("button", { name: "取消生成", exact: true }).click();
  await expect(canceled).toHaveAttribute("data-status", "canceled");
  const balance = await canvas.locator("#railCreditValue").innerText();
  const nodeIds = await canvas.locator(".canvas-node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")).sort());

  const select = canvas.locator("#agentRecordSelectBtn");
  await select.click();
  await success.getByRole("checkbox").check();
  const toolbar = canvas.getByRole("group", { name: "批量选择生成记录", exact: true });
  await expect(toolbar.getByRole("status")).toHaveText("已选 1 条");
  await toolbar.getByRole("checkbox", { name: "全选", exact: true }).check();
  await expect(toolbar.getByRole("status")).toHaveText("已选 2 条");
  await toolbar.getByRole("button", { name: "删除", exact: true }).click();
  const confirmation = canvas.getByRole("dialog", { name: "删除 2 条生成记录？", exact: true });
  await expect(confirmation).toContainText("画布中的生成结果会保留");
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  await expect(records).toHaveCount(2);
  await expect(toolbar.getByRole("status")).toHaveText("已选 2 条");

  await toolbar.getByRole("button", { name: "删除", exact: true }).click();
  await confirmation.getByRole("button", { name: "删除记录", exact: true }).click();
  await expect(records).toHaveCount(0);
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(select).toBeDisabled();
  await expect(canvas.locator("#railCreditValue")).toHaveText(balance);
  expect(await canvas.locator(".canvas-node").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")).sort())).toEqual(nodeIds);
});

test("compact sidebar keeps header collapse accessible and clears selection on collapse or a new conversation", async ({ page }) => {
  const canvas = await openCanvas(page, "角色动画短片_第 3 版");
  await canvas.locator('#agentInput [contenteditable="true"]').fill("窄侧栏的批量选择记录");
  await canvas.locator(".agent-send").click();
  const record = canvas.locator("#agentGenerationRecords .generation-record");
  await record.getByRole("button", { name: "取消生成", exact: true }).click();
  await expect(record).toHaveAttribute("data-status", "canceled");

  const resize = (await canvas.locator("#agentResizeHandle").boundingBox())!;
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(1380, resize.y + resize.height / 2, { steps: 4 });
  await page.mouse.up();
  const panel = canvas.locator("#agentPanel");
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeCloseTo(480, 0);
  const collapse = canvas.getByRole("button", { name: "收起 Reelay Agent", exact: true });
  await expect(collapse).toBeVisible();
  const panelBox = (await panel.boundingBox())!;
  const collapseBox = (await collapse.boundingBox())!;
  const titleBox = (await canvas.locator("#agentHistoryBtn").boundingBox())!;
  expect(collapseBox.x).toBeGreaterThanOrEqual(panelBox.x);
  expect(collapseBox.y + collapseBox.height / 2).toBeCloseTo(titleBox.y + titleBox.height / 2, 0);
  expect(collapseBox.width).toBeGreaterThanOrEqual(32);
  expect(collapseBox.height).toBeGreaterThanOrEqual(32);
  expect(collapseBox.x + collapseBox.width).toBeLessThanOrEqual(titleBox.x);
  const actions = canvas.getByRole("group", { name: "对话操作", exact: true });
  await expect(actions.getByRole("button")).toHaveCount(2);

  const select = canvas.locator("#agentRecordSelectBtn");
  await select.click();
  await record.getByRole("checkbox").check();
  const toolbar = canvas.getByRole("group", { name: "批量选择生成记录", exact: true });
  await expect(toolbar.getByRole("button", { name: "完成", exact: true })).toBeVisible();
  expect(await toolbar.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await collapse.click();
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(collapse).toBeHidden();
  await canvas.getByRole("button", { name: "展开 Reelay Agent", exact: true }).click();
  await expect(record).toHaveCount(1);
  await expect(record.getByRole("checkbox")).toHaveCount(0);

  await select.click();
  await record.getByRole("checkbox").check();
  await actions.getByRole("button", { name: "新建对话", exact: true }).click();
  await expect(record).toHaveCount(0);
  await expect(select).toHaveAttribute("aria-pressed", "false");
  await expect(select).toBeDisabled();
  await expect(toolbar).toHaveCount(0);
});

test("sidebar header control keeps its hit area still and keyboard focus through quick toggles", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#canvasShell")).toBeVisible();
  const handle = page.locator("#agentDock");
  const launcher = page.getByRole("button", { name: "展开 Reelay Agent", exact: true });
  const collapse = page.getByRole("button", { name: "收起 Reelay Agent", exact: true });
  const editor = page.locator('#agentInput [contenteditable="true"]');
  const runningAnimations = () => handle.evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => animation.playState === "running" || animation.pending).length);
  // The shared reduced-motion fallback uses 0.01ms transitions, which may be
  // reported as pending for one frame even though there is no visible motion.
  const visibleMotion = () => handle.evaluate((element) => element.getAnimations({ subtree: true })
    .filter((animation) => (animation.playState === "running" || animation.pending)
      && Number(animation.effect?.getComputedTiming().activeDuration) > 1).length);

  await expect(launcher).toBeVisible();
  await expect(collapse).toHaveCount(0);
  await launcher.click();
  await expect.poll(runningAnimations).toBe(0);
  const before = (await collapse.boundingBox())!;
  const arrow = collapse.locator("svg");
  await expect(arrow).toBeVisible();
  const beforeX = (await arrow.boundingBox())!.x;
  await collapse.hover();
  await expect.poll(runningAnimations, { message: "The header control has no continuous hover animation" }).toBe(0);
  expect((await arrow.boundingBox())!.x).toBeCloseTo(beforeX, 0);
  expect((await collapse.boundingBox())!.x).toBeCloseTo(before.x, 0);
  await collapse.click();

  // Keyboard activation does not wait for pointer hit boxes to settle, allowing
  // each reversal to happen before the previous movement has completed.
  for (let index = 0; index < 2; index++) {
    await launcher.focus();
    await page.keyboard.press("Enter");
    await expect(launcher).toHaveCount(0);
    await expect(collapse).toHaveCount(1);
    await collapse.focus();
    await page.keyboard.press("Enter");
    await expect(launcher).toBeFocused();
    await expect(collapse).toHaveCount(0);
  }
  await launcher.press("Enter");
  await expect(editor).toBeFocused();
  await collapse.focus();
  await page.keyboard.press("Enter");
  await expect(launcher).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(600, 400);
  await launcher.hover();
  await expect.poll(runningAnimations).toBe(0);
  await launcher.press("Enter");
  await expect(editor).toBeFocused();
  expect(await visibleMotion()).toBe(0);
  await collapse.focus();
  await page.keyboard.press("Enter");
  await expect(launcher).toBeFocused();
  expect(await visibleMotion()).toBe(0);

  await page.setViewportSize({ width: 390, height: 700 });
  await launcher.click();
  const compactBox = (await collapse.boundingBox())!;
  const compactTitle = (await page.locator("#agentHistoryBtn").boundingBox())!;
  expect(compactBox.x).toBeGreaterThanOrEqual(0);
  expect(compactBox.x + compactBox.width).toBeLessThanOrEqual(compactTitle.x);
  await collapse.click();
  await expect(launcher).toBeFocused();
});
