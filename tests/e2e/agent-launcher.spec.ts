import { test, expect } from "./fixtures";

test("launcher and collapse logos animate only while visible without moving their hit areas", async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto("/index.html");
  const launcher = page.locator("#agentLauncher");
  const lids = launcher.locator(".agent-logo-lid");
  const collapse = page.locator("#agentCloseBtn");
  const collapseLids = collapse.locator(".agent-logo-lid");
  // The body owns idle effects; the wrapper may briefly return from its
  // pressed CSS pose while the containing panel finishes closing.
  const logoMotionCount = (control: typeof launcher) => control.locator(".agent-logo-body")
    .evaluate((element) => element.getAnimations({ subtree: true }).length);
  await expect(launcher).toBeVisible();
  await expect(launcher.locator("img")).toHaveJSProperty("complete", true);
  const original = (await launcher.boundingBox())!;
  const clip = { x: original.x - 8, y: original.y - 8, width: original.width + 16, height: original.height + 16 };
  await page.screenshot({ path: testInfo.outputPath("launcher-awake.png"), clip });

  await page.clock.fastForward(5_100);
  // Freeze the real eyelid animation at its closed pose for visual inspection.
  // The product still creates and owns the animations; the test controls time.
  const blinkCount = await lids.evaluateAll((elements) => {
    let count = 0;
    for (const element of elements) {
      for (const animation of element.getAnimations()) {
        animation.pause();
        animation.currentTime = 125;
        count += 1;
      }
    }
    return count;
  });
  expect(blinkCount).toBe(4);
  await page.screenshot({ path: testInfo.outputPath("launcher-blink.png"), clip });
  expect((await launcher.boundingBox())!).toEqual(original);

  await launcher.hover();
  expect(await lids.evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(4);
  expect((await launcher.boundingBox())!).toEqual(original);
  await launcher.click();
  await expect(page.locator("#agentPanel")).toHaveAttribute("aria-hidden", "false");
  await expect.poll(() => page.locator(".agent-panel-shell")
    .evaluate((element) => element.getAnimations().length)).toBe(0);
  const collapseOriginal = (await collapse.boundingBox())!;
  await expect(collapse.locator("img")).toHaveJSProperty("complete", true);
  await page.clock.fastForward(5_100);
  expect(await logoMotionCount(launcher)).toBe(0);
  expect(await collapseLids.evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(4);
  expect((await collapse.boundingBox())!).toEqual(collapseOriginal);

  // This isolated fixture may set the theme directly for paired visual
  // captures. Freeze product-owned motion in its awake pose in both themes.
  await collapse.locator(".agent-logo").evaluate((element) => {
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  const headerClip = (await page.locator(".agent-header").boundingBox())!;
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await page.screenshot({ path: testInfo.outputPath(`agent-header-${theme}.png`), clip: headerClip });
  }

  await collapse.click();
  await expect(launcher).toBeFocused();
  expect(await logoMotionCount(collapse)).toBe(0);
  // A mouse-driven collapse restores focus for accessibility, but idle should
  // resume without requiring another click elsewhere on the canvas.
  await page.clock.fastForward(5_100);
  expect(await lids.evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(4);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(600, 400);
  await page.keyboard.press("Tab");
  await page.clock.fastForward(60_000);
  expect(await logoMotionCount(launcher)).toBe(0);
  await expect(launcher.locator(".agent-logo")).toHaveCSS("transform", "none");
  await launcher.click();
  await expect(collapse).toBeVisible();
  await page.clock.fastForward(60_000);
  expect(await logoMotionCount(collapse)).toBe(0);
  await expect(collapse.locator(".agent-logo")).toHaveCSS("transform", "none");
});
