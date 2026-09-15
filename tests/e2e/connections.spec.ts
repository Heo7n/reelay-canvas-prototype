import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

async function addGenerator(page: Page, x: number, y: number) {
  await page.mouse.dblclick(x, y);
  await page.getByRole("menuitem", { name: "图片 添加图片生成节点", exact: true }).click();
}

test("ports keep their original size relative to media and follow directly in the magnetic core", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#canvasShell")).toBeVisible();
  await addGenerator(page, 720, 400);
  const frame = page.locator(".media-frame");
  const shell = page.locator("#canvasShell");
  const slider = page.getByRole("slider");

  for (const zoom of [20, 50, 100, 200]) {
    await slider.focus();
    await slider.press("Home");
    if (zoom === 200) await slider.press("End");
    else for (let i = 20; i < zoom; i++) await slider.press("ArrowRight");
    await expect(slider).toHaveValue(String(zoom));
    const scale = zoom / 100;
    let media = (await frame.boundingBox())!;
    // Earlier pan checks accumulate world-space offsets. Recenter through the
    // real pan gesture so both scaled ports remain inside the test viewport.
    const recenterX = 720 - (media.x + media.width / 2);
    if (Math.abs(recenterX) > 1) {
      await page.keyboard.down("Space");
      await page.mouse.move(720, 150);
      await page.mouse.down();
      await page.mouse.move(720 + recenterX, 150, { steps: 3 });
      await page.mouse.up();
      await page.keyboard.up("Space");
      media = (await frame.boundingBox())!;
    }
    const y = media.y + media.height / 2;

    for (const [side, direction] of [["input", -1], ["output", 1]] as const) {
      const edge = side === "input" ? media.x : media.x + media.width;
      const port = page.locator(`.node-port-${side}`);
      const x = edge + direction * 38 * scale;
      const pointerY = y + 6 * scale;
      await page.mouse.move(x, pointerY);
      await expect(port).toHaveClass(/is-pointer-near/);
      await expect.poll(async () => {
        const box = (await port.boundingBox())!;
        return Math.hypot(box.x + box.width / 2 - x, box.y + box.height / 2 - pointerY);
      }).toBeLessThanOrEqual(0.2);
      const size = (await port.boundingBox())!;
      expect(size.width).toBeCloseTo(34 * scale, 0);
      expect(size.width / media.width).toBeCloseTo(34 / 460, 3);
      await page.mouse.down();
      await expect(shell).toHaveClass(/connecting/);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(shell).not.toHaveClass(/connecting/);
    }

    // The former 148px transparent field consumed this blank-canvas gesture.
    const blankX = media.x + media.width + Math.max(110, 85 * scale);
    await page.mouse.move(blankX, y);
    await page.mouse.down();
    await page.mouse.move(blankX + 12, y + 12);
    await expect(shell).not.toHaveClass(/connecting/);
    await page.mouse.up();

    const before = await page.locator("#canvasStage").getAttribute("style");
    await page.keyboard.down("Space");
    await page.mouse.move(media.x - 38 * scale, y);
    await page.mouse.down();
    await page.mouse.move(media.x - 38 * scale + 12, y, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up("Space");
    await expect(shell).not.toHaveClass(/connecting/);
    await expect(page.locator("#canvasStage")).not.toHaveAttribute("style", before!);
  }
});

test("connection targets accept the whole media body in either direction", async ({ page }) => {
  await page.goto("/index.html");
  await addGenerator(page, 320, 350);
  await addGenerator(page, 1000, 350);
  await page.mouse.click(650, 760);
  const frames = page.locator(".media-frame");
  await expect(frames).toHaveCount(2);
  const left = (await frames.nth(0).boundingBox())!;
  const right = (await frames.nth(1).boundingBox())!;
  const shell = page.locator("#canvasShell");
  const connections = page.locator(".connection-group");

  // Exercise top and bottom body projection, starting from output and input.
  for (const reverse of [false, true]) {
    const origin = reverse ? right : left;
    const target = reverse ? left : right;
    const x = reverse ? origin.x - 38 : origin.x + origin.width + 38;
    await page.mouse.move(x, origin.y + origin.height / 2);
    await page.mouse.down();
    await expect(shell).toHaveClass(/connecting/);
    await page.mouse.move(target.x + target.width / 2, target.y + (reverse ? target.height - 20 : 20), { steps: 5 });
    await expect(page.locator(".connection-preview")).toHaveClass(/is-snapped/);
    await page.mouse.up();
    await expect(connections).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await expect(connections).toHaveCount(0);
  }

  // Deliberately overlap the two transparent hit zones. The newer/right node
  // sits higher in DOM paint order, but the nearest visible port must win.
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2);
  await page.mouse.down();
  const gap = right.x - (left.x + left.width);
  await page.mouse.move(right.x + right.width / 2 - gap + 96, right.y + right.height / 2, { steps: 5 });
  await page.mouse.up();
  const sourceEdge = left.x + left.width;
  for (const [offset, side, index] of [[40, "output", 0], [56, "input", 1]] as const) {
    await page.mouse.move(sourceEdge + offset, left.y + left.height / 2);
    const node = page.locator(".canvas-node").nth(index);
    await expect(node.locator(`.node-port-${side}`)).toHaveClass(/is-pointer-near/);
    await page.mouse.down();
    await expect(node).toHaveClass(/connection-origin/);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  }

  // With only a 10px gap the higher node's invisible port field reaches over
  // the other media. That visible media must still select and drag normally.
  const movedRight = (await frames.nth(1).boundingBox())!;
  await page.mouse.move(movedRight.x + movedRight.width / 2, movedRight.y + movedRight.height / 2);
  await page.mouse.down();
  await page.mouse.move(movedRight.x + movedRight.width / 2 - 86, movedRight.y + movedRight.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.mouse.move(sourceEdge - 20, left.y + left.height / 2);
  await expect(page.locator(".is-pointer-near")).toHaveCount(0);
  await page.mouse.down();
  await page.mouse.move(sourceEdge - 30, left.y + left.height / 2 + 15, { steps: 3 });
  await expect(shell).not.toHaveClass(/connecting/);
  await page.mouse.up();
  expect((await frames.nth(0).boundingBox())!.x).toBeCloseTo(left.x - 10, 0);
});
