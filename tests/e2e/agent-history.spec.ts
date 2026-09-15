import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function expectAlignedHistoryMenu(page: Page) {
  const trigger = (await page.locator("#agentHistoryBtn").boundingBox())!;
  const menu = (await page.locator("#agentHistoryMenu").boundingBox())!;
  const messageLeft = await page.locator("#agentGenerationRecords").evaluate((element) => {
    const record = element.querySelector(".generation-record");
    if (record) return record.getBoundingClientRect().left + parseFloat(getComputedStyle(record, "::before").left);
    const style = getComputedStyle(element);
    return element.getBoundingClientRect().left + parseFloat(style.paddingLeft)
      - parseFloat(style.getPropertyValue("--agent-record-outset-inline"));
  });
  expect(menu.x).toBeCloseTo(messageLeft, 0);
  expect(menu.x + menu.width).toBeCloseTo(trigger.x + trigger.width, 0);
  expect(menu.y - trigger.y - trigger.height).toBeCloseTo(6, 0);
  expect(trigger.width).toBeLessThanOrEqual(288);
  return { trigger, menu };
}

test("history menu aligns with the message left edge and title right edge at regular and minimum panel widths", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/index.html");
  await page.locator("#agentLauncher").click();
  const panel = page.locator("#agentPanel");
  const trigger = page.locator("#agentHistoryBtn");
  const menu = page.locator("#agentHistoryMenu");
  const list = page.locator("#agentHistoryList");
  const rows = list.locator(".history-select");
  const title = page.locator("#agentConversationTitle");
  const newChat = page.getByRole("group", { name: "对话操作", exact: true })
    .getByRole("button", { name: "新建对话", exact: true });

  for (const size of ["regular", "minimum"]) {
    if (size === "minimum") {
      const resize = (await page.locator("#agentResizeHandle").boundingBox())!;
      await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
      await page.mouse.down();
      await page.mouse.move(1400, resize.y + resize.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect.poll(async () => (await panel.boundingBox())!.width).toBeCloseTo(480, 0);
      await trigger.click();
      await list.locator('[data-chat-id="new"] .history-select').click();
    }

    await expect(newChat).toBeVisible();
    await expect(title).toHaveText("新对话");
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "新建对话", exact: true })).toHaveCount(0);
    await expect(rows).toHaveCount(9);
    await expect(trigger).toBeFocused();
    const current = list.locator(".history-item.active");
    await expect(current.locator(".history-current-check")).toHaveCSS("opacity", "1");
    await expect(current.locator(".history-actions")).toHaveCSS("opacity", "0");
    await current.hover();
    await expect(current.locator(".history-actions")).toHaveCSS("opacity", "1");
    await expect(current.locator(".history-current-check")).toHaveCSS("opacity", "0");
    await trigger.hover();
    const short = await expectAlignedHistoryMenu(page);

    const listMetrics = await list.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        scrollable: element.scrollHeight > element.clientHeight,
        fullyVisibleRows: [...element.querySelectorAll(".history-item")].filter((row) => {
          const rect = row.getBoundingClientRect();
          return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
        }).length,
      };
    });
    expect(listMetrics.height).toBeCloseTo(290, 0);
    expect(short.menu.height).toBeCloseTo(308, 0);
    expect(listMetrics.scrollable).toBe(true);
    expect(listMetrics.fullyVisibleRows).toBe(7);

    const names = await rows.allTextContents();
    const longestIndex = names.reduce((longest, name, index) => name.length > names[longest].length ? index : longest, 0);
    const longest = rows.nth(longestIndex);
    await expect(longest).toHaveAttribute("title", names[longestIndex]);
    expect(await longest.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect(longest).toHaveCSS("text-overflow", "ellipsis");
    await longest.click();
    await expect(menu).toBeHidden();
    await expect(title).toHaveText(names[longestIndex]);
    await expect(title).toHaveAttribute("title", names[longestIndex]);
    expect(await title.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect(title).toHaveCSS("text-overflow", "ellipsis");
    await trigger.click();
    await expect(trigger).toBeFocused();
    const long = await expectAlignedHistoryMenu(page);
    expect(long.trigger.width).toBeCloseTo(short.trigger.width, 0);
    expect(long.trigger.x).toBeCloseTo(short.trigger.x, 0);

    const panelBox = (await panel.boundingBox())!;
    for (const theme of ["dark", "light"]) {
      // Isolated canvas fixtures can set the theme for paired visual captures.
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({
        path: testInfo.outputPath(`agent-history-${size}-${theme}.png`),
        clip: { x: panelBox.x, y: panelBox.y, width: panelBox.width, height: long.menu.y + long.menu.height - panelBox.y + 12 },
      });
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  }
});

test("short windows keep history scrolling inside the panel and restore the selected bottom row on reopen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 320 });
  await page.goto("/index.html");
  await page.locator("#agentLauncher").click();
  const trigger = page.locator("#agentHistoryBtn");
  const menu = page.locator("#agentHistoryMenu");
  const list = page.locator("#agentHistoryList");
  const last = list.locator(".history-select").last();
  await trigger.click();
  const { menu: menuBox } = await expectAlignedHistoryMenu(page);
  const panelBox = (await page.locator("#agentPanel").boundingBox())!;
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(Math.min(320, panelBox.y + panelBox.height));
  expect((await list.boundingBox())!.height).toBeLessThan(290);

  const lastTitle = await last.innerText();
  await last.click();
  await expect(menu).toBeHidden();
  await expect(page.locator("#agentConversationTitle")).toHaveText(lastTitle);
  await trigger.click();
  for (const openWith of ["mouse", "Enter", "Space"]) {
    // Reopening must restore the current row even after reading earlier history.
    await list.hover();
    await page.mouse.wheel(0, -2000);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    if (openWith === "mouse") await trigger.click();
    else await trigger.press(openWith);
    await expect(openWith === "mouse" ? trigger : last).toBeFocused();
    await expect(last).toHaveAttribute("aria-current", "true");
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const listBox = (await list.boundingBox())!;
    const lastBox = (await last.boundingBox())!;
    expect(lastBox.y).toBeGreaterThanOrEqual(listBox.y);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(listBox.y + listBox.height + 1);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  const newChat = page.getByRole("group", { name: "对话操作", exact: true })
    .getByRole("button", { name: "新建对话", exact: true });
  await expect(newChat).toBeVisible();
  await newChat.click();
  await expect(page.locator("#agentConversationTitle")).toHaveText("新对话");
  await trigger.click();
  await expect(trigger).toBeFocused();
});
