import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { APIResponse } from "@playwright/test";
import type { MediaLibraryCatalog } from "../../src/domain/asset/media-library";
import { test, expect, openCanvas, canvasFrameSelector } from "./fixtures";

async function body<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json() as Promise<T>;
}

test("organization subjects persist with their own media and tags, stay separate, and can be used on the canvas", async ({ page }) => {
  test.setTimeout(90_000);
  await openCanvas(page);
  const workspaceId = new URL(page.url()).pathname.split("/w/")[1].split("/")[0];
  const api = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
  const readCatalog = async () => (await body<{ catalog: MediaLibraryCatalog }>(await page.request.get(`${api}/media-library`))).catalog;
  const initialCatalog = await readCatalog();
  const initialPersonal = initialCatalog.entityEntries?.filter((entry) => entry.space === "personal") ?? [];

  // Only the isolated test API receives fixture writes. This upload creates an
  // organization placement directly, leaving the personal library unchanged.
  const file = await readFile("assets/reelay-logo.png");
  const upload = await body<{ uploadIntent: { id: string }; upload: { url: string; headers: Record<string, string> } }>(
    await page.request.post(`${api}/media-upload-intents`, { data: {
      idempotencyKey: randomUUID(), storageSpace: "organization", uploadPurpose: "library", mediaKind: "image",
      displayName: "组织视觉参考.png", contentType: "image/png", byteSize: file.length,
      checksumSha256: createHash("sha256").update(file).digest("hex"),
    } }),
  );
  await body(await page.request.put(upload.upload.url, { data: file, headers: upload.upload.headers }));
  const { asset } = await body<{ asset: { id: string } }>(await page.request.post(`${api}/media-upload-intents/${upload.uploadIntent.id}/finalize`));
  expect((await readCatalog()).entries.filter((entry) => entry.assetId === asset.id).map((entry) => entry.space)).toEqual(["organization"]);

  await page.reload();
  const canvas = page.frameLocator(canvasFrameSelector);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await canvas.locator("#railLibraryBtn").click();
  await canvas.getByRole("tab", { name: "组织", exact: true }).click();
  await canvas.locator("#assetLibrarySubjectsBtn").click();
  await canvas.locator("[data-library-commandbar] [data-library-create-entity]").click();
  const editor = canvas.locator('[data-entity-editor="true"]');
  await expect(editor).toBeVisible();
  const name = `组织主体 ${randomUUID()}`;
  await editor.locator("[data-entity-editor-name]").fill(name);
  await editor.locator("[data-entity-editor-description]").fill("团队统一使用的视觉设定");
  await editor.locator("[data-entity-editor-add-from-library]").click();
  const picker = canvas.locator("[data-entity-picker]");
  await expect(picker).toBeVisible();
  await expect(picker.locator(`[data-entity-picker-media="${asset.id}"]`)).toBeVisible();
  const privateAsset = initialCatalog.entries.find((entry) => entry.space === "personal");
  if (privateAsset) await expect(picker.locator(`[data-entity-picker-media="${privateAsset.assetId}"]`)).toHaveCount(0);
  await picker.locator(`[data-entity-picker-toggle="${asset.id}"]`).click();
  await picker.locator("[data-entity-picker-confirm]").click();
  await expect(picker).toBeHidden();
  await expect(editor.locator(`[data-entity-editor-media="${asset.id}"]`)).toBeVisible();

  await editor.locator("[data-entity-editor-tags-toggle]").click();
  await expect(editor.locator("[data-entity-editor-tag-query]")).toHaveCount(0);
  await editor.locator('[data-entity-editor-tag-toggle="builtin:character"]').click();
  await editor.locator("[data-entity-editor-tag-create]").click();
  const tagName = `团队设定 ${randomUUID().slice(0, 8)}`;
  await editor.locator("[data-entity-editor-tag-name]").fill(tagName);
  const newTagResponse = page.waitForResponse((response) => response.url().endsWith(`${api}/media-library/tags`) && response.request().method() === "POST");
  await editor.locator("[data-entity-editor-tag-create-submit]").click();
  const newTagResult = await newTagResponse;
  expect(newTagResult.ok(), await newTagResult.text()).toBe(true);
  const { tag } = await newTagResult.json() as { tag: { id: string; space: string } };
  expect(tag.space).toBe("organization");
  await expect(editor.locator(`[data-entity-editor-tag-toggle="${tag.id}"]`)).toHaveAttribute("aria-pressed", "true");
  await editor.locator("[data-entity-editor-tags-toggle]").click();
  const createResponse = page.waitForResponse((response) => response.url().endsWith(`${api}/entities`) && response.request().method() === "POST");
  await editor.locator("[data-entity-editor-submit]").click();
  const created = await createResponse;
  expect(created.ok(), await created.text()).toBe(true);
  const { entity } = await created.json() as { entity: { id: string; space: string } };
  expect(entity.space).toBe("organization");
  await expect(editor).toBeHidden();
  const subject = canvas.locator(`[data-library-entity="${entity.id}"]`);
  await expect(subject).toBeVisible();
  await expect(subject).toHaveAttribute("data-library-space", "organization");

  await canvas.getByRole("tab", { name: "个人", exact: true }).click();
  await canvas.locator("#assetLibrarySubjectsBtn").click();
  await expect(subject).toHaveCount(0);
  const persisted = await readCatalog();
  expect(persisted.entityEntries?.filter((entry) => entry.space === "personal")).toEqual(initialPersonal);
  expect(persisted.tags.some((entry) => entry.id === tag.id && entry.space === "personal")).toBe(false);

  await page.reload();
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await canvas.locator("#railLibraryBtn").click();
  await canvas.getByRole("tab", { name: "组织", exact: true }).click();
  await canvas.locator("#assetLibrarySubjectsBtn").click();
  await expect(subject.locator(".asset-library-card-name")).toHaveText(name);
  await subject.locator("[data-library-menu-toggle]").click();
  await canvas.locator('[data-library-menu-item="edit"]').click();
  await expect(editor.locator("[data-entity-editor-description]")).toHaveValue("团队统一使用的视觉设定");
  await expect(editor.locator("[data-entity-editor-tags-toggle]")).toContainText(tagName);
  await editor.locator(`[data-entity-editor-preview-name="${asset.id}"]`).dblclick();
  await editor.locator("[data-entity-editor-preview-rename]").fill("团队封面");
  const renameResponse = page.waitForResponse((response) => response.url().endsWith(`${api}/media-assets/${asset.id}`) && response.request().method() === "PATCH");
  await editor.locator("[data-entity-editor-preview-rename]").press("Enter");
  const renamed = await renameResponse;
  expect(renamed.ok(), await renamed.text()).toBe(true);
  expect((await readCatalog()).entries.find((entry) => entry.assetId === asset.id && entry.space === "organization")?.displayName).toBe("团队封面.png");
  expect((await readCatalog()).entries.some((entry) => entry.assetId === asset.id && entry.space === "personal")).toBe(false);
  await editor.locator("[data-entity-editor-name]").fill(`${name} 修订`);
  await editor.locator("[data-entity-editor-description]").fill("团队确认的新版视觉设定");
  const updateResponse = page.waitForResponse((response) => response.url().endsWith(`${api}/entities/${entity.id}`) && response.request().method() === "PATCH");
  await editor.locator("[data-entity-editor-submit]").click();
  const updated = await updateResponse;
  expect(updated.ok(), await updated.text()).toBe(true);
  await expect(editor).toBeHidden();
  await expect(subject.locator(".asset-library-card-name")).toHaveText(`${name} 修订`);

  const beforeNodes = await canvas.locator(".canvas-node").count();
  await canvas.locator("[data-library-selection-toggle]").click();
  await subject.locator("[data-library-select]").click();
  await canvas.locator("[data-library-batch-toggle]").click();
  await canvas.locator('[data-library-batch-action="add-canvas"]').click();
  await expect(canvas.locator(".canvas-node")).toHaveCount(beforeNodes + 1);
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await page.reload();
  await expect(page.locator(".legacy-canvas-host")).toHaveAttribute("data-persistence-status", "saved");
  await expect(canvas.locator(".canvas-node")).toHaveCount(beforeNodes + 1);
  const readback = await body<{ entity: { name: string; description: string; libraryTagIds: string[] } }>(await page.request.get(`${api}/entities/${entity.id}?scope=organization`));
  expect(readback.entity).toMatchObject({ name: `${name} 修订`, description: "团队确认的新版视觉设定", libraryTagIds: ["builtin:character", tag.id] });
});
