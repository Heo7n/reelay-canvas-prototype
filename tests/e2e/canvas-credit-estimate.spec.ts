import type { Locator, Page } from "@playwright/test";
import { test, expect, openCanvas } from "./fixtures";

async function exactCredits(value: Locator) {
  await expect(value).toHaveText(/^≈ ([\d,]+)$/);
  const match = /^≈ ([\d,]+)$/.exec(await value.innerText());
  if (!match) throw new Error("Expected one exact credit estimate, not a range or pending quote.");
  const credits = Number(match[1].replaceAll(",", ""));
  expect(credits).toBeGreaterThan(0);
  return credits;
}

async function pauseGenerationClock(page: Page) {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
}

async function setDuration(panel: Locator, seconds: string) {
  const input = panel.locator("[data-duration-number]");
  await input.fill(seconds);
  await input.press("Tab");
}

async function expectSingleLineEstimate(button: Locator, estimate: Locator) {
  await expect(estimate).toBeVisible();
  const [buttonBox, estimateBox, arrowBox] = await Promise.all([
    button.boundingBox(), estimate.boundingBox(), button.locator(".send-arrow").boundingBox(),
  ]);
  if (!buttonBox || !estimateBox || !arrowBox) throw new Error("Expected the visible estimate and send control.");
  expect(estimateBox.x).toBeGreaterThanOrEqual(buttonBox.x);
  expect(estimateBox.x + estimateBox.width).toBeLessThanOrEqual(arrowBox.x + 1);
  expect(arrowBox.x + arrowBox.width).toBeLessThanOrEqual(buttonBox.x + buttonBox.width + 1);
  expect(await estimate.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  })).toBe(1);
}

test("node model and parameter changes update the quote, and generation charges and refunds that quote once", async ({ page }) => {
  const canvas = await openCanvas(page);
  await canvas.getByRole("button", { name: "收起 Reelay Agent", exact: true }).click();
  await canvas.locator("#canvasShell").dblclick({ position: { x: 280, y: 200 } });
  await canvas.getByRole("menuitem", { name: "视频 添加视频生成节点", exact: true }).click();
  const node = canvas.locator(".canvas-node.selected");
  const estimate = node.locator("[data-node-credit-estimate]");
  const panel = node.locator(".param-panel");
  const generate = node.locator('[data-action="generate"]');
  await node.locator('[data-action="model-panel"]').click();
  await node.locator('[data-action="model"][data-value="seedance-2-5"]').click();
  await node.locator('[data-action="param-panel"]').click();
  await panel.getByRole("button", { name: "16:9", exact: true }).click();
  await panel.getByRole("button", { name: "480P", exact: true }).click();
  await setDuration(panel, "10");
  // Verified catalog examples: fixed duration, 16:9, no video reference, one output.
  await expect(estimate).toHaveText("≈ 111");
  await panel.getByRole("button", { name: "720P", exact: true }).click();
  await expect(estimate).toHaveText("≈ 250");
  await setDuration(panel, "5");
  await expect(estimate).toHaveText("≈ 125");
  await node.locator('[data-action="param-panel"]').click();

  for (const { model, label } of [
    { model: "seedance-2", label: "≈ 82" },
    { model: "seedance-2-fast", label: "≈ 66" },
  ]) {
    await node.locator('[data-action="model-panel"]').click();
    await node.locator(`[data-action="model"][data-value="${model}"]`).click();
    await node.locator('[data-action="param-panel"]').click();
    await panel.getByRole("button", { name: "720P", exact: true }).click();
    await setDuration(panel, "5");
    await expect(estimate).toHaveText(label);
    await node.locator('[data-action="param-panel"]').click();
  }
  await node.locator('[data-node-prompt-input] [contenteditable="true"]').fill("清晨的山谷，薄雾沿山脊缓缓流动，镜头平稳向前推进。");
  await expectSingleLineEstimate(generate, estimate);
  const cost = await exactCredits(estimate);
  await expect(generate).toHaveAccessibleName(new RegExp(`预估消耗 ${cost} 积分`));
  await pauseGenerationClock(page);
  await generate.click();
  await expect(node.locator(".generating-preview")).toBeVisible();
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - cost));
  await node.getByRole("button", { name: "取消生成", exact: true }).click();
  await expect(node.locator(".generating-preview")).toHaveCount(0);
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
  await page.clock.fastForward(8_000);
  await expect(node.locator(".generating-preview")).toHaveCount(0);
  await expect(canvas.locator("#railCreditValue")).toHaveText("3000");
});

test("sidebar quotes distinguish Auto and pending states, and sample-to-final generation uses the displayed costs", async ({ page }, testInfo) => {
  const canvas = await openCanvas(page);
  const estimate = canvas.locator("#agentCreditValue");
  const send = canvas.locator(".agent-send");
  const parameters = canvas.locator("#agentParamSummary");
  const panel = canvas.locator("#agentParamMenu");
  await canvas.locator("#agentModeBtn").click();
  await canvas.getByRole("menuitemradio", { name: "Agent 模式", exact: true }).click();
  await expect(estimate).toHaveText("—");
  await canvas.locator("#agentModeBtn").click();
  await canvas.getByRole("menuitemradio", { name: "生成模式", exact: true }).click();
  await canvas.locator("#agentModelBtn").click();
  await canvas.getByRole("dialog", { name: "选择模型", exact: true })
    .getByRole("button", { name: "Seedance 2.5（样片模式）", exact: true }).click();
  await expect(estimate).toHaveText("≈ 111");
  await parameters.click();
  await panel.getByRole("button", { name: "视频编辑", exact: true }).click();
  await expect(estimate).toHaveText("待估算");
  await panel.getByRole("button", { name: "视频延长", exact: true }).click();
  await panel.getByRole("slider", { name: "时长（智能或秒数）", exact: true }).press("Home");
  await expect(estimate).toHaveText(/^≈ [\d,]+–[\d,]+$/);
  const bounds = /^≈ ([\d,]+)–([\d,]+)$/.exec(await estimate.innerText());
  if (!bounds) throw new Error("Auto duration must display a range.");
  expect(Number(bounds[1].replaceAll(",", ""))).toBeGreaterThan(0);
  expect(Number(bounds[2].replaceAll(",", ""))).toBeGreaterThan(Number(bounds[1].replaceAll(",", "")));
  await parameters.click();

  for (const theme of ["dark", "light"]) {
    // Only theme changes for paired captures; all task and quote state comes from real UI actions.
    await canvas.locator("html").evaluate((element, value) => { element.dataset.theme = value; }, theme);
    await expectSingleLineEstimate(send, estimate);
    const [parameterBox, sendBox] = await Promise.all([parameters.boundingBox(), send.boundingBox()]);
    if (!parameterBox || !sendBox) throw new Error("Expected composer parameters and send control.");
    expect(parameterBox.x + parameterBox.width).toBeLessThanOrEqual(sendBox.x + 1);
    await canvas.locator("#agentComposer").screenshot({ path: testInfo.outputPath(`credit-estimate-${theme}.png`) });
  }

  await parameters.click();
  await panel.getByRole("button", { name: "全模态参考", exact: true }).click();
  await panel.getByRole("button", { name: "16:9", exact: true }).click();
  await setDuration(panel, "10");
  await parameters.click();
  await expect(estimate).toHaveText("≈ 111");
  const prompt = "晨光洒在湖面上，一艘小船驶过芦苇，镜头从远景缓缓推进到船头，水面保留细微涟漪。";
  await canvas.locator('#agentInput [contenteditable="true"]').fill(prompt);
  const draftCost = await exactCredits(estimate);
  const before = await canvas.locator(".canvas-node").count();
  await pauseGenerationClock(page);
  await send.click();
  const record = canvas.locator("#agentGenerationRecords .generation-record").filter({ hasText: prompt });
  await expect(record).toHaveAttribute("data-status", /queued|running/);
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - draftCost));
  await page.clock.fastForward(8_000);
  await expect(record).toHaveAttribute("data-status", "succeeded");
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  await record.getByRole("button", { name: "生成正片", exact: true }).click();
  const dialog = canvas.getByRole("dialog", { name: "正片生成参数", exact: true });
  await expect(dialog.locator("[data-draft-cost]")).toHaveText("≈ 618");
  const finalCost = await exactCredits(dialog.locator("[data-draft-cost]"));
  await dialog.getByText("MOV", { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "MOV", exact: true })).toBeChecked();
  await expect(dialog.locator("[data-draft-cost]")).toHaveText(`≈ ${finalCost}`);
  await dialog.getByRole("button", { name: `生成正片，预估消耗 ${finalCost} 积分`, exact: true }).click();
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - draftCost - finalCost));
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 2);
  const finalState = record.locator(".generation-record-final-state");
  await finalState.getByRole("button", { name: "取消生成", exact: true }).click();
  await expect(finalState).toContainText("积分已返还");
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - draftCost));
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
  await page.clock.fastForward(8_000);
  await expect(canvas.locator("#railCreditValue")).toHaveText(String(3000 - draftCost));
  await expect(canvas.locator(".canvas-node")).toHaveCount(before + 1);
});
