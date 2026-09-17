import { test, expect, openCanvas } from './fixtures';

test('progressive filters combine with keyword search without shifting cards', async ({ page }) => {
  const canvas = await openCanvas(page);
  await canvas.locator('#railLibraryBtn').click();
  await canvas.getByRole('tab', { name: '平台', exact: true }).click();
  const cards = canvas.locator('.inspiration-card');
  await expect(cards).toHaveCount(12);
  const gridTop = (await canvas.locator('#assetLibraryGrid').boundingBox())!.y;
  await expect(canvas.locator('#inspirationDiscovery')).toBeHidden();
  await canvas.locator('[data-library-filter-toggle]').click();
  expect((await canvas.locator('#assetLibraryGrid').boundingBox())!.y).toBe(gridTop);
  await expect(canvas.locator('[data-discovery-group]')).toHaveCount(6);
  await expect(canvas.locator('[data-discovery-group="content"]')).toHaveCount(0);
  await canvas.locator('[data-discovery-group="movement"]').click();
  await canvas.locator('[data-discovery-facet="movement:tracking"]').click();
  await canvas.locator('[data-discovery-group="light"]').click();
  const optionSearch = canvas.getByRole('searchbox', { name: '搜索光影选项' });
  await optionSearch.fill('backlight');
  await expect(canvas.locator('[data-discovery-options="light"] button')).toHaveCount(1);
  await canvas.locator('[data-discovery-facet="light:backlight"]').click();
  await expect(cards).toHaveCount(2);
  await expect(canvas.locator('.inspiration-facet-heading.has-value')).toHaveCount(2);
  await canvas.locator('#assetLibrarySearchInput').fill('月面');
  await expect(cards).toHaveCount(1);
  await canvas.locator('#assetLibrarySearchInput').fill('不可能存在的查询');
  await expect(cards).toHaveCount(0);
  await expect(canvas.locator('.asset-library-empty')).toBeVisible();
  await canvas.locator('#assetLibrarySearchInput').fill('');
  await canvas.locator('[data-library-selection-toggle]').click();
  await canvas.locator('[data-library-select-all]').click();
  await expect(canvas.locator('.inspiration-card.selected')).toHaveCount(2);
  await expect(canvas.locator('[data-library-filter-toggle]')).toHaveCount(0);
  await canvas.locator('#assetLibrarySearchInput').fill('月面');
  await expect(canvas.locator('.inspiration-card.selected')).toHaveCount(0);
  await canvas.locator('#assetLibrarySearchInput').fill('');
  await canvas.locator('[data-library-selection-cancel]').click();
  await canvas.locator('[data-library-filter-toggle]').click();
  await optionSearch.fill('');
  await canvas.locator('[data-discovery-facet="light:soft"]').click();
  await canvas.getByRole('tab', { name: '个人', exact: true }).click();
  await expect(canvas.locator('#inspirationDiscovery')).toBeHidden();
  await canvas.getByRole('tab', { name: '平台', exact: true }).click();
  await expect(canvas.locator('#inspirationDiscovery')).toBeHidden();
  await canvas.locator('[data-library-filter-toggle]').click();
  await expect(canvas.locator('[data-discovery-group="light"]')).toContainText('逆光、柔光');
  await canvas.locator('[data-discovery-reset]').click();
  await expect(cards).toHaveCount(12);
  await canvas.locator('[data-discovery-done]').press('Escape');
  await expect(canvas.locator('#inspirationDiscovery')).toBeHidden();
  await expect(canvas.locator('[data-library-filter-toggle]')).toBeFocused();
  await expect(canvas.locator('#assetLibrarySearchInput')).toBeVisible();
  await canvas.locator('[data-discovery-card-facet="movement:tracking"]').first().click();
  await expect(cards).toHaveCount(6);
  await expect(canvas.locator('dialog.canvas-inspiration-dialog')).toBeHidden();
  await canvas.locator('[data-library-filter-toggle]').click();
  await expect(canvas.locator('[data-discovery-group="movement"]')).toContainText('跟拍');
});

test('platform clips keep search visible and release playback when details close', async ({ page }) => {
  const canvas = await openCanvas(page);
  await canvas.locator('#railLibraryBtn').click();
  await canvas.getByRole('tab', { name: '平台', exact: true }).click();
  const search = canvas.locator('#assetLibrarySearchInput');
  await expect(search).toBeVisible();
  await expect.poll(() => canvas.locator('.inspiration-card').count()).toBeGreaterThanOrEqual(12);
  await search.fill('海岸');
  await expect(canvas.locator('.inspiration-card')).toHaveCount(1);
  const card = canvas.getByRole('button', { name: '查看片段 海岸 · 跳水与归来', exact: true });
  await card.click();
  const dialog = canvas.locator('dialog.canvas-inspiration-dialog');
  await expect(dialog).toBeVisible();
  const video = dialog.locator('[data-inspiration-video]');
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((element: HTMLVideoElement) => element.duration)).toBeGreaterThan(3.5);
  await dialog.locator('[data-inspiration-analyze]').click();
  await expect(dialog.locator('[data-inspiration-analyze]')).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.locator('[data-inspiration-results]')).toBeVisible();
  await expect.poll(() => dialog.evaluate((root) => root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0);
  await expect(dialog.getByText('模拟', { exact: true })).toBeVisible();
  await dialog.locator('[data-inspiration-result-tab="prompt"]').click();
  await dialog.locator('[data-inspiration-prompt]').fill('保留我的镜头改写');
  // Retain the old media element so removal alone cannot conceal continuing playback.
  const media = await video.elementHandle();
  await dialog.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
  expect(await media!.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  expect(await media!.evaluate((element: HTMLVideoElement) => element.getAttribute('src'))).toBeNull();
  await card.click();
  await expect(dialog.locator('[data-inspiration-prompt]')).toHaveValue('保留我的镜头改写');
  await dialog.press('Escape');
  await search.fill('');
  await search.press('Escape');
  await expect(search).toBeVisible();
  await expect.poll(() => canvas.locator('.inspiration-card').count()).toBeGreaterThanOrEqual(12);
});

test('manual reference copy preserves the Agent draft and canvas placement remains undoable', async ({ page }) => {
  const canvas = await openCanvas(page);
  const draft = canvas.locator('#agentInput').getByRole('textbox', { name: '提示词', exact: true });
  const originalPrompt = '保留这个草稿：机器人在月球上行走。';
  await draft.fill(originalPrompt);
  await canvas.locator('#agentHistoryBtn').click();
  const originalConversationId = await canvas.locator('.history-item.active').getAttribute('data-chat-id');
  expect(originalConversationId).toBeTruthy();
  await canvas.locator('#agentHistoryBtn').press('Escape');
  const originalCredits = await canvas.locator('#railCreditValue').textContent();
  const beforeNodes = await canvas.locator('.canvas-node').count();

  await canvas.locator('#railLibraryBtn').click();
  await canvas.getByRole('tab', { name: '平台', exact: true }).click();
  const card = canvas.getByRole('button', { name: '查看片段 海岸 · 跳水与归来', exact: true });
  await card.click();
  const dialog = canvas.locator('dialog.canvas-inspiration-dialog');
  const start = dialog.locator('[data-inspiration-start]');
  const end = dialog.locator('[data-inspiration-end]');
  const copyAction = dialog.locator('[data-inspiration-action="copy"]');
  await expect.poll(() => dialog.locator('[data-inspiration-video]').evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  await start.fill('3.5');
  await end.fill('0.5');
  await end.press('Tab');
  await dialog.locator('[data-inspiration-analyze]').click();
  await expect(dialog.locator('[data-inspiration-error]')).toContainText('有效时间段');
  await expect(copyAction).toBeDisabled();
  await expect(dialog).toBeVisible();
  await expect(canvas.locator('.canvas-node')).toHaveCount(beforeNodes);
  await start.fill('0.5');
  await end.fill('3.5');
  await dialog.locator('[data-inspiration-analyze]').click();
  await expect(dialog.locator('[data-inspiration-analyze]')).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.locator('[data-inspiration-results]')).toBeVisible();
  await expect.poll(() => dialog.evaluate((root) => root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    const geometry = await dialog.evaluate((root) => {
      const panel = root.getBoundingClientRect();
      const footer = root.querySelector('[data-inspiration-draft-footer]')!.getBoundingClientRect();
      return { top: panel.top, bottom: panel.bottom, right: panel.right, footerBottom: footer.bottom, scroll: root.scrollWidth, width: root.clientWidth };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(size.height);
    expect(geometry.right).toBeLessThanOrEqual(size.width);
    expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.bottom);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    await dialog.getByRole('tab', { name: '镜头分析', exact: true }).click();
    const layout = () => dialog.evaluate((root) => {
      const box = (selector: string) => {
        const { x, y, width, height } = root.querySelector(selector)!.getBoundingClientRect();
        return { x, y, width, height };
      };
      return { dialog: { top: root.getBoundingClientRect().top, height: root.getBoundingClientRect().height },
        grid: box('.inspiration-shot-grid'), panels: box('.inspiration-result-panels'),
        bodyScroll: root.querySelector('.inspiration-body')!.scrollTop };
    });
    const beforeTab = await layout();
    await dialog.getByRole('tab', { name: '生成提示词', exact: true }).click();
    expect(await layout()).toEqual(beforeTab);
    await dialog.getByRole('tab', { name: '镜头分析', exact: true }).click();
    expect(await layout()).toEqual(beforeTab);
  }
  await dialog.locator('[data-inspiration-result-tab="prompt"]').click();
  const promptInput = dialog.locator('[data-inspiration-prompt]');
  await promptInput.fill(Array.from({ length: 40 }, (_, index) => `镜头 ${index + 1}：人物沿林间小路向前行走，侧向跟拍，柔和日光。`).join('\n'));
  await promptInput.press('ControlOrMeta+End');
  const promptScroll = await promptInput.evaluate((element) => element.scrollTop);
  expect(promptScroll).toBeGreaterThan(0);
  await dialog.getByRole('tab', { name: '镜头分析', exact: true }).click();
  await dialog.getByRole('tab', { name: '生成提示词', exact: true }).click();
  expect(await promptInput.evaluate((element) => element.scrollTop)).toBe(promptScroll);
  const intent = '借鉴镜头运动，换成我自己的角色和场景。';
  await dialog.locator('[data-inspiration-prompt]').fill(intent);
  // Editing the range makes this result stale without losing the custom prompt.
  await end.fill('3');
  await expect(copyAction).toBeDisabled();
  await dialog.locator('[data-inspiration-analyze]').click();
  await expect(dialog.locator('[data-inspiration-replace-confirm]')).toBeVisible();
  await dialog.locator('[data-inspiration-replace-cancel]').click();
  await end.fill('3.5');
  await expect(dialog.locator('[data-inspiration-prompt]')).toHaveValue(intent);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await copyAction.click();
  await expect(copyAction).toHaveText('已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(intent);
  await expect(dialog).toBeVisible();
  await expect(canvas.locator('#agentMessages .agent-message')).toHaveCount(0);
  await expect(canvas.locator('#agentGenerationRecords .generation-record')).toHaveCount(0);
  await expect(canvas.locator('#railCreditValue')).toHaveText(originalCredits!);
  await expect(canvas.locator('.canvas-node')).toHaveCount(beforeNodes);
  await dialog.press('Escape');
  await expect(draft).toHaveText(originalPrompt);

  // Canvas insertion keeps the complete original reference and remains undoable.
  await card.click();
  await dialog.locator('[data-inspiration-action="canvas"]').click();
  await expect(dialog).toBeHidden();
  await expect(canvas.locator('.canvas-node')).toHaveCount(beforeNodes + 1);
  await expect(canvas.locator('.canvas-node.selected video')).toHaveCount(1);
  await canvas.locator('#canvasShell').press('ControlOrMeta+z');
  await expect(canvas.locator('.canvas-node')).toHaveCount(beforeNodes);
  await expect(canvas.locator('#railCreditValue')).toHaveText(originalCredits!);
});


test('all platform excerpts load as real five-to-thirty-second videos', async ({ page }) => {
  const canvas = await openCanvas(page);
  await canvas.locator('#railLibraryBtn').click();
  await canvas.getByRole('tab', { name: '平台', exact: true }).click();
  const cards = canvas.locator('.inspiration-card-preview');
  await expect(cards).toHaveCount(12);
  const durations: number[] = [];
  for (let index = 0; index < 12; index += 1) {
    await cards.nth(index).click();
    const dialog = canvas.locator('dialog.canvas-inspiration-dialog');
    const video = dialog.locator('video');
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
    const actual = await video.evaluate((element: HTMLVideoElement) => ({ duration: element.duration, paused: element.paused, error: element.error?.code }));
    const declared = await dialog.locator('[data-inspiration-end]').inputValue();
    expect(actual.error).toBeUndefined();
    expect(actual.paused).toBe(true);
    expect(actual.duration).toBeGreaterThanOrEqual(5);
    expect(actual.duration).toBeLessThanOrEqual(30.1);
    expect(Math.abs(actual.duration - Number(declared))).toBeLessThan(.15);
    durations.push(Number(declared));
    await dialog.getByRole('button', { name: '关闭创作参考', exact: true }).click();
  }
  expect(durations.some((duration) => duration <= 6)).toBe(true);
  expect(durations.some((duration) => duration >= 20)).toBe(true);
  expect(durations.some((duration) => duration === 30)).toBe(true);
});


test('short desktop filter keeps completion inside the asset content clipping boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const canvas = await openCanvas(page);
  await canvas.locator('#railLibraryBtn').click();
  await canvas.getByRole('tab', { name: '平台', exact: true }).click();
  await canvas.getByRole('separator', { name: '调整资产库宽度' }).press('Home');
  await canvas.locator('[data-library-filter-toggle]').click();
  await canvas.locator('[data-discovery-group="scale"]').click();
  const boundary = (await canvas.locator('.asset-library-content').boundingBox())!;
  const completion = canvas.locator('[data-discovery-done]');
  const button = (await completion.boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(boundary.y + boundary.height);
  await completion.click();
  await expect(canvas.locator('#inspirationDiscovery')).toBeHidden();
});
