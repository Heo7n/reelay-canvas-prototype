import { test, expect } from "./fixtures";

test("launcher blinks its eyes without moving its hit area and stops when the panel opens", async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto("/index.html");
  const launcher = page.locator("#agentLauncher");
  const lids = launcher.locator(".agent-logo-lid");
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
  await page.clock.fastForward(60_000);
  expect(await lids.evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(0);

  await page.getByRole("button", { name: "收起 Reelay Agent", exact: true }).click();
  await expect(launcher).toBeFocused();
  // A mouse-driven collapse restores focus for accessibility, but idle should
  // resume without requiring another click elsewhere on the canvas.
  await page.clock.fastForward(5_100);
  expect(await lids.evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(4);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(600, 400);
  await page.keyboard.press("Tab");
  await page.clock.fastForward(60_000);
  expect(await lids.evaluateAll((elements) => elements.flatMap((element) => element.getAnimations()).length)).toBe(0);
  await expect(launcher.locator(".agent-logo")).toHaveCSS("transform", "none");
});
