import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { APIResponse } from "@playwright/test";
import type { MediaLibraryCatalog } from "../../src/domain/asset/media-library";
import { test, expect, openCanvas, canvasFrameSelector } from "./fixtures";

async function responseBody<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}

test("subjects have a central area, retain member placement and restore nested material browsing", async ({ page }) => {
  test.setTimeout(90_000);
  await openCanvas(page);
  const path = new URL(page.url()).pathname;
  const workspaceId = path.split("/w/")[1].split("/")[0];
  const projectId = path.split("/projects/")[1].split("/")[0];
  const api = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
  const readCatalog = async () => (await responseBody<{ catalog: MediaLibraryCatalog }>(await page.request.get(`${api}/media-library`))).catalog;

  // Fixture preparation uses only the isolated HTTP server. Four nested folders
  // plus the default directory exercise the supported fifth navigation level.
  const folders: { id: string; name: string }[] = [];
  for (const name of ["拍摄资料", "角色设定", "服装", "造型参考"]) {
    const { folder } = await responseBody<{ folder: { id: string; name: string } }>(
      await page.request.post(`${api}/media-library/folders`, { data: {
        space: "personal", parentId: folders.at(-1)?.id ?? null, name,
      } }),
    );
    folders.push(folder);
  }
  const sourceFolder = folders.at(-1)!;
  const file = await readFile("assets/reelay-logo.png");
  const fileName = "角色参考.png";
  const upload = await responseBody<{ uploadIntent: { id: string }; upload: { url: string; headers: Record<string, string> } }>(
    await page.request.post(`${api}/media-upload-intents`, { data: {
      idempotencyKey: randomUUID(), uploadPurpose: "library", storageSpace: "personal",
      mediaKind: "image", displayName: fileName, contentType: "image/png",
      byteSize: file.length, checksumSha256: createHash("sha256").update(file).digest("hex"),
    } }),
  );
  await responseBody(await page.request.put(upload.upload.url, { data: file, headers: upload.upload.headers }));
  const { asset } = await responseBody<{ asset: { id: string } }>(
    await page.request.post(`${api}/media-upload-intents/${upload.uploadIntent.id}/finalize`),
  );
  await responseBody(await page.request.post(`${api}/media-library/save`, { data: {
    projectId, space: "personal", folderId: sourceFolder.id, tagIds: ["builtin:character"],
    items: [{ assetId: asset.id, displayName: fileName, action: "move", expectedFolderId: null }],
  } }));
  const originalMember = (await readCatalog()).entries.find((entry) => entry.assetId === asset.id);
  expect(originalMember?.folderId).toBe(sourceFolder.id);

  await page.reload();
  let canvas = page.frameLocator(canvasFrameSelector);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await canvas.locator("#railLibraryBtn").click();
  await expect(canvas.locator("#assetLibrarySubjectsBtn")).toBeVisible();
  for (const folder of folders) await canvas.locator(`[data-library-folder-open="${folder.id}"]`).click();
  await expect(canvas.locator("#assetLibraryDirectoryName")).toHaveText(sourceFolder.name);
  await canvas.locator('[data-library-add-toggle]').click();
  await expect(canvas.getByRole('menuitem', { name: '新建文件夹' })).toBeDisabled();
  await expect(canvas.getByRole('menuitem', { name: '上传资产' })).toBeEnabled();
  await canvas.getByRole('menuitem', { name: '上传资产' }).press('Escape');
  await expect(canvas.locator('[data-library-add-toggle]')).toBeFocused();
  const media = canvas.locator(`[data-library-media="${asset.id}"]`);
  await expect(media).toBeVisible();
  await canvas.locator('[data-library-selection-toggle]').click();
  await media.locator('[data-library-select]').click();
  await canvas.locator('[data-library-batch-toggle]').click();
  await canvas.locator('[data-library-batch-action="create-group"]').click();
  const editor = canvas.locator('[data-entity-editor="true"]');
  await expect(editor).toBeVisible();
  // The editor keeps metadata beside a two-column, two-row media viewport.
  // Its full-width preview and footer remain usable on a short desktop.
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    const layout = await editor.evaluate((root) => {
      const rect = (selector: string) => {
        const box = root.querySelector(selector)!.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, bottom: box.bottom, height: box.height };
      };
      const grid = root.querySelector('.entity-editor-media-grid')!;
      const gridStyle = getComputedStyle(grid);
      return { panel: root.getBoundingClientRect().width,
        workspace: rect('.entity-editor-workspace'), metadata: rect('.entity-editor-metadata'),
        media: rect('.entity-editor-media-section'), actions: rect('.entity-editor-media-actions'),
        name: rect('.entity-editor-name-field'), tags: rect('.entity-editor-tags-field'),
        description: rect('[data-entity-editor-description]'), card: rect('.entity-editor-media-card'),
        grid: rect('.entity-editor-media-grid'), preview: rect('.entity-editor-preview'), footer: rect('.entity-editor-footer'),
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        rowGap: parseFloat(gridStyle.rowGap), overflowY: gridStyle.overflowY,
      };
    });
    expect(layout.panel).toBeCloseTo(760, 0);
    expect(layout.columns).toBe(2);
    expect(layout.metadata.width / (layout.metadata.width + layout.media.width)).toBeCloseTo(0.38, 1);
    expect(layout.media.x).toBeGreaterThanOrEqual(layout.metadata.x + layout.metadata.width);
    expect(layout.name.x).toBeCloseTo(layout.tags.x, 0);
    expect(layout.tags.x).toBeCloseTo(layout.description.x, 0);
    expect(layout.tags.y).toBeGreaterThanOrEqual(layout.name.bottom);
    expect(layout.description.y).toBeGreaterThanOrEqual(layout.tags.bottom);
    expect(Math.abs(layout.description.bottom - layout.actions.bottom)).toBeLessThanOrEqual(1);
    expect(layout.actions.y).toBeGreaterThanOrEqual(layout.grid.bottom);
    expect(layout.overflowY).toBe('auto');
    expect(layout.grid.height).toBeGreaterThanOrEqual(layout.card.height * 2 + layout.rowGap - 1);
    expect(layout.grid.height).toBeLessThan(layout.card.height * 3 + layout.rowGap * 2);
    expect(layout.preview.y).toBeGreaterThanOrEqual(layout.workspace.bottom);
    expect(layout.preview.x).toBeCloseTo(layout.workspace.x, 0);
    expect(layout.preview.width).toBeCloseTo(layout.workspace.width, 0);
    expect(layout.preview.height).toBeGreaterThanOrEqual(130);
    expect(layout.footer.y).toBeGreaterThanOrEqual(layout.preview.bottom);
    expect(layout.footer.bottom).toBeLessThanOrEqual(size.height);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const subjectName = `角色设定 ${randomUUID()}`;
  await editor.locator('[data-entity-editor-name]').fill(subjectName);
  await expect(editor.locator(`[data-entity-editor-media="${asset.id}"]`)).toBeVisible();
  await expect(editor.locator('[data-entity-editor-location-toggle]')).toHaveCount(0);
  await editor.locator('[data-entity-editor-tags-toggle]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').press('Escape');
  const createdResponse = page.waitForResponse((response) => response.url().endsWith(`${api}/entities`) && response.request().method() === "POST");
  await editor.locator('[data-entity-editor-submit]').click();
  const created = await createdResponse;
  expect(created.ok(), await created.text()).toBe(true);
  const { entity } = await created.json() as { entity: { id: string } };
  await expect(editor).toBeHidden();
  await expect(canvas.locator('#assetLibraryPanel')).toHaveAttribute('data-library-section', 'entity');
  const subject = canvas.locator(`[data-library-entity="${entity.id}"]`);
  await expect(subject).toBeVisible();
  expect((await readCatalog()).entityEntries?.find((entry) => entry.entityId === entity.id)?.folderId).toBeNull();
  expect((await readCatalog()).entries.find((entry) => entry.assetId === asset.id)).toEqual(originalMember);

  expect((await readCatalog()).entityEntries?.find((entry) => entry.entityId === entity.id)?.tagIds).toEqual(['builtin:character']);
  // Card clicks open the original editor. Draft tag changes can be discarded;
  // saving an empty selection updates only the subject placement.
  await subject.locator('[data-library-preview]').click();
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-entity-editor-tags-toggle]')).toHaveText("角色");
  await editor.locator('[data-entity-editor-tags-toggle]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').press('Escape');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await canvas.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(editor).toBeHidden();
  expect((await readCatalog()).entityEntries?.find((entry) => entry.entityId === entity.id)?.tagIds).toEqual(['builtin:character']);
  await subject.locator('[data-library-preview]').click();
  await expect(editor.locator('[data-entity-editor-tags-toggle]')).toHaveText("角色");
  await editor.locator('[data-entity-editor-tags-toggle]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').press('Escape');
  await editor.locator('[data-entity-editor-description]').fill('主体描述与标签一起保存');
  await editor.locator('[data-entity-editor-submit]').click();
  await expect(editor).toBeHidden();
  expect((await readCatalog()).entityEntries?.find((entry) => entry.entityId === entity.id)?.tagIds).toEqual([]);
  expect((await readCatalog()).entries.find((entry) => entry.assetId === asset.id)).toEqual(originalMember);

  // Returning after creation restores the fifth-level source directory. Its
  // media filters survive a global search and entering the subject area.
  await canvas.locator('#assetLibraryDirectoryButton').click();
  await expect(canvas.locator("#assetLibraryDirectoryName")).toHaveText(sourceFolder.name);
  await expect(subject).toHaveCount(0);
  await expect(media).toBeVisible();
  await canvas.locator('[data-library-filter-toggle]').click();
  await canvas.locator('[data-library-filter="image"]').click();
  await canvas.locator('[data-library-filter-tag="builtin:character"]').click();
  await canvas.locator('[data-library-filter-apply]').click();
  await expect(canvas.locator('#assetLibraryDirectoryBackBtn')).toHaveCount(0);
  await canvas.locator('[data-library-search-toggle]').click();
  await expect(canvas.locator('#assetLibrarySearchInput')).toBeFocused();
  await expect(canvas.locator('[data-library-upload]')).toBeHidden();
  await expect(canvas.locator('[data-library-filter-toggle]')).toBeVisible();
  await canvas.locator('[data-library-filter-toggle]').click();
  await canvas.locator('[data-library-filter-reset]').click();
  await canvas.locator('[data-library-filter-apply]').click();
  await canvas.locator('#assetLibrarySearchInput').fill('角色');
  await expect(media).toBeVisible();
  await expect(subject).toBeVisible();
  await expect(canvas.locator('[data-library-result-heading]')).toHaveCount(3);
  await canvas.locator(`[data-library-folder-open="${folders[1].id}"]`).click();
  await expect(canvas.locator('#assetLibrarySearchRegion')).toHaveAttribute('aria-hidden', 'true');
  await canvas.locator(`[data-library-folder-open="${folders[2].id}"]`).click();
  await canvas.locator('[data-library-search-toggle]').click();
  await expect(canvas.locator('#assetLibrarySearchInput')).toHaveValue('角色');
  await subject.hover();
  await subject.locator('[data-library-menu-toggle]').click();
  await subject.locator('[data-library-menu-item="view-media"]').click();
  await expect(canvas.locator('[data-library-clear-entity-filter]')).toHaveText('搜索结果');
  await canvas.locator('[data-library-clear-entity-filter]').click();
  await expect(canvas.locator('#assetLibrarySearchInput')).toHaveValue('角色');
  await canvas.locator('[data-library-selection-toggle]').click();
  await canvas.locator('[data-library-select-all]').click();
  await canvas.locator('[data-library-select-kind="entity"]').click();
  await expect(media.locator('[data-library-select]')).toBeDisabled();
  await canvas.locator('[data-library-batch-toggle]').click();
  await expect(canvas.locator('[data-library-batch-action="add-canvas"]')).toBeVisible();
  await expect(canvas.locator('[data-library-batch-action="create-group"]')).toHaveCount(0);
  await canvas.locator('[data-library-selection-cancel]').click();
  await canvas.locator('#assetLibrarySearchClearBtn').click();
  await expect(canvas.locator('#assetLibraryDirectoryName')).toHaveText(sourceFolder.name);
  await expect(canvas.locator('[data-library-search-toggle]')).toBeFocused();
  await canvas.locator('#assetLibrarySubjectsBtn').click();
  await expect(canvas.locator('#assetLibraryPanel')).toHaveAttribute('data-library-section', 'entity');
  await expect(canvas.locator('#assetLibrarySearchInput')).toHaveValue('');
  await expect(subject).toBeVisible();
  await expect(canvas.locator('[data-library-create-entity]')).toBeVisible();
  await expect(canvas.locator('#assetLibraryCreateFolderBtn')).toBeHidden();
  await canvas.locator('[data-library-filter-toggle]').click();
  await expect(canvas.locator('[data-library-filter]')).toHaveCount(0);
  await expect(canvas.locator('[data-library-filter-item-kind]')).toHaveCount(0);
  await canvas.locator('[data-library-filter-untagged]').click();
  await canvas.locator('[data-library-filter-apply]').click();
  await expect(subject).toBeVisible();
  await subject.hover();
  await subject.locator('[data-library-menu-toggle]').click();
  await subject.locator('[data-library-menu-item="view-media"]').click();
  await expect(canvas.locator(`[data-library-media="${asset.id}"]`)).toBeVisible();
  await canvas.locator('[data-library-clear-entity-filter]').click();
  await expect(subject).toBeVisible();
  await canvas.locator('[data-library-filter-toggle]').click();
  await expect(canvas.locator('[data-library-filter-untagged]')).toHaveAttribute('aria-pressed', 'true');
  await canvas.locator('[data-library-filter-cancel]').click();
  await subject.hover();
  await subject.locator('[data-library-menu-toggle]').click();
  await expect(subject.locator('[data-library-menu-item="move"]')).toHaveCount(0);
  await canvas.locator('#assetLibraryDirectoryButton').click();
  await expect(canvas.locator("#assetLibraryDirectoryName")).toHaveText(sourceFolder.name);
  await expect(canvas.locator('#assetLibrarySearchInput')).toHaveValue('');
  await expect(media).toBeVisible();
  await canvas.locator('[data-library-filter-toggle]').click();
  await expect(canvas.locator('[data-library-filter="image"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas.locator('[data-library-filter-tag="builtin:character"]')).toHaveAttribute('aria-pressed', 'true');
  await canvas.locator('[data-library-filter-cancel]').click();

  // Reload resolves the saved entity and placements from the repository. The
  // subject is never mixed back into the default directory's material cards.
  await page.reload();
  canvas = page.frameLocator(canvasFrameSelector);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await canvas.locator("#railLibraryBtn").click();
  await expect(canvas.locator(`[data-library-entity="${entity.id}"]`)).toHaveCount(0);
  await canvas.locator('#assetLibrarySubjectsBtn').click();
  const restoredSubject = canvas.locator(`[data-library-entity="${entity.id}"]`);
  await expect(restoredSubject).toBeVisible();
  await expect(restoredSubject.locator('.asset-library-group-count')).toHaveCount(0);
  await expect(restoredSubject.locator('.asset-library-card-namebar .asset-library-subject-mark')).toBeVisible();
  await expect(restoredSubject.locator('.asset-library-card-name')).toHaveText(subjectName);
  expect((await readCatalog()).entries.find((entry) => entry.assetId === asset.id)).toEqual(originalMember);
  await restoredSubject.locator('[data-library-preview]').click();
  await expect(editor.locator('[data-entity-editor-description]')).toHaveValue('主体描述与标签一起保存');
  await expect(editor.locator('[data-entity-editor-tags-toggle]')).toHaveText("选择标签");
  await editor.locator('[data-entity-editor-tags-toggle]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:scene"]').click();
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').press('Escape');
  await editor.locator('[data-entity-editor-submit]').click();
  await expect(editor).toBeHidden();
  expect((await readCatalog()).entityEntries?.find((entry) => entry.entityId === entity.id)?.tagIds).toEqual(['builtin:scene']);
  await restoredSubject.locator('[data-library-preview]').click();
  await expect(editor.locator('[data-entity-editor-tags-toggle]')).toHaveText("场景");
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  expect((await readCatalog()).entries.find((entry) => entry.assetId === asset.id)).toEqual(originalMember);
  // The unified directory control first restores media context, then opens
  // its menu. Returning clears subject selection before creating a directory.
  await canvas.locator('[data-library-selection-toggle]').click();
  await restoredSubject.locator('[data-library-select]').click();
  await canvas.locator('#assetLibraryDirectoryButton').click();
  await expect(canvas.locator('#assetLibraryDirectoryTreePopover')).toBeHidden();
  await expect(canvas.locator('#assetLibrarySubjectsBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas.locator('[data-library-commandbar]')).toHaveAttribute('data-library-selection-mode', 'false');
  await canvas.locator('[data-library-add-toggle]').press('ArrowDown');
  await expect(canvas.getByRole('menuitem', { name: '新建文件夹' })).toBeFocused();
  await canvas.getByRole('menuitem', { name: '新建文件夹' }).press('ArrowDown');
  await expect(canvas.getByRole('menuitem', { name: '上传资产' })).toBeFocused();
  await canvas.getByRole('menuitem', { name: '上传资产' }).click();
  const uploadDialog = canvas.getByRole('dialog', { name: '上传资产', exact: true });
  await expect(uploadDialog).toBeVisible();
  await expect(canvas.getByRole('menu', { name: '添加资产' })).toBeHidden();
  await uploadDialog.getByRole('button', { name: '取消', exact: true }).click();
  await canvas.locator('[data-library-add-toggle]').click();
  await canvas.getByRole('menuitem', { name: '新建文件夹' }).click();
  await expect(canvas.locator('[data-library-directory-draft-input]')).toBeFocused();
  const newFolderName = `新目录 ${randomUUID()}`;
  await canvas.locator('[data-library-directory-draft-input]').fill(newFolderName);
  await canvas.locator('[data-library-directory-draft-input]').press('Enter');
  await expect(canvas.locator('#assetLibraryDirectoryName')).toHaveText(newFolderName);
  await expect(canvas.locator('[data-library-commandbar]')).toHaveAttribute('data-library-selection-mode', 'false');
  await expect(canvas.locator('#assetLibrarySubjectsBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas.getByRole('button', { name: newFolderName, exact: true })).toBeFocused();
});
