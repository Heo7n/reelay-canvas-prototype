import { resolve } from 'node:path';
import type { Locator } from '@playwright/test';
import { test, expect, openCanvas } from './fixtures';

async function readEditor(editor: Locator) {
  return {
    paragraphs: await editor.locator('p').allTextContents(),
    references: await editor.locator('.prompt-reference').evaluateAll((chips) => chips.map((chip) => ({
      key: chip.getAttribute('data-reference-key'),
      mediaType: chip.getAttribute('data-media-type'),
      label: chip.textContent,
      missing: chip.classList.contains('is-missing'),
    }))),
  };
}

test('优化建议需手动填入，撤销后保留原文、引用与当前草稿', async ({ page }) => {
  const canvas = await openCanvas(page, '科幻预告片_初剪版');
  const draft = canvas.locator('#agentInput').getByRole('textbox', { name: '提示词', exact: true });
  const model = canvas.locator('#agentModelBtn');
  const parameters = canvas.locator('#agentParamSummary');
  const records = canvas.locator('.generation-record');
  await expect(draft).toBeEmpty();

  await model.click();
  await canvas.getByRole('dialog', { name: '选择模型', exact: true })
    .getByRole('button', { name: 'Seedance 2.5', exact: true }).click();
  await expect(model).toHaveAccessibleName('当前模型：Seedance 2.5');

  await canvas.getByRole('button', { name: '添加附件', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await canvas.getByRole('menuitem', { name: '本地上传', exact: true }).click();
  await (await chooser).setFiles([
    resolve('assets/reelay-logo.png'),
    resolve('assets/canvas-empty-cursor.png'),
  ]);
  const shelf = canvas.locator('#agentReferenceShelf [data-reference-key]');
  await expect(shelf).toHaveCount(2);
  const shelfKeys = await shelf.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-reference-key')));

  await draft.pressSequentially('参照 @');
  await canvas.getByRole('listbox', { name: '参考素材', exact: true })
    .getByRole('option').filter({ hasText: 'reelay-logo' }).click();
  await draft.pressSequentially('，并参考 @');
  await canvas.getByRole('listbox', { name: '参考素材', exact: true })
    .getByRole('option').filter({ hasText: 'canvas-empty-cursor' }).click();
  await draft.pressSequentially('，让主体缓慢靠近镜头，保留原有构图。');
  await expect(draft).toHaveText('参照 图片1，并参考 图片2，让主体缓慢靠近镜头，保留原有构图。');

  const original = await readEditor(draft);
  const originalText = original.paragraphs.join('\n');
  expect(original.references.map((reference) => reference.key)).toEqual(shelfKeys);
  expect(original.references.every((reference) => reference.mediaType === 'image' && !reference.missing)).toBe(true);
  const originalParameters = await parameters.getAttribute('aria-label') ?? '';
  expect(originalParameters).toContain('当前生成参数：');
  const recordCount = await records.count();
  const optimize = canvas.locator('#agentPromptOptimizationBtn');

  await expect(optimize).toBeEnabled();
  await optimize.click();
  await expect(optimize).toHaveAttribute('aria-busy', 'true');
  await expect(optimize).toHaveAccessibleName('查看提示词优化', { timeout: 10_000 });
  // Completion only publishes a suggestion; it must not submit or rewrite the draft.
  expect(await readEditor(draft)).toEqual(original);
  await expect(records).toHaveCount(recordCount);
  await optimize.click();

  const dialog = canvas.getByRole('dialog', { name: '提示词优化', exact: true });
  const source = dialog.locator('[data-source]');
  const suggestion = dialog.getByRole('textbox', { name: '提示词', exact: true });
  await expect(dialog).toBeVisible();
  await expect(source).toHaveText(originalText);
  expect(await source.locator('.prompt-reference').evaluateAll((chips) =>
    chips.map((chip) => chip.getAttribute('data-reference-key')))).toEqual(shelfKeys);
  const optimized = await readEditor(suggestion);
  expect(optimized.references).toEqual(original.references);
  expect(optimized.paragraphs).not.toEqual(original.paragraphs);

  const manualAddition = ' 手动补充：维持原有机位，不增加新的角色。';
  await suggestion.press('ControlOrMeta+End');
  await suggestion.pressSequentially(manualAddition);
  await expect(suggestion).toContainText(manualAddition.trim());
  const editedSuggestion = await readEditor(suggestion);
  expect(editedSuggestion.references).toEqual(original.references);
  expect(await readEditor(draft)).toEqual(original);
  await expect(source).toHaveText(originalText);
  await dialog.getByRole('button', { name: '填入输入框', exact: true }).click();

  await expect(dialog).not.toBeVisible();
  expect(await readEditor(draft)).toEqual(editedSuggestion);
  await expect(model).toHaveAccessibleName('当前模型：Seedance 2.5');
  await expect(parameters).toHaveAccessibleName(originalParameters);
  expect(await shelf.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-reference-key')))).toEqual(shelfKeys);
  await expect(records).toHaveCount(recordCount);

  await canvas.locator('.prompt-optimization-toast').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(canvas.locator('.prompt-optimization-toast')).toContainText('已还原填入前的提示词');
  expect(await readEditor(draft)).toEqual(original);
  await expect(model).toHaveAccessibleName('当前模型：Seedance 2.5');
  await expect(parameters).toHaveAccessibleName(originalParameters);
  expect(await shelf.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-reference-key')))).toEqual(shelfKeys);

  // Reopening the retained result must preserve both its original and the edited suggestion.
  await optimize.click();
  await expect(dialog).toBeVisible();
  await expect(source).toHaveText(originalText);
  expect(await readEditor(suggestion)).toEqual(editedSuggestion);
  await expect(dialog.getByRole('button', { name: '填入输入框', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭提示词优化', exact: true }).click();
  await canvas.getByRole('button', { name: '收起 Reelay Agent', exact: true }).click();
  await canvas.getByRole('button', { name: '展开 Reelay Agent', exact: true }).click();
  await expect(draft).toBeVisible();
  expect(await readEditor(draft)).toEqual(original);
  await expect(records).toHaveCount(recordCount);
});
