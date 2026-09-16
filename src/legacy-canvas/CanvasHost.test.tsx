// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor } from "@testing-library/react";
import { StrictMode, useState, type ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../application/shared/ApplicationError";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
import type { MediaLibraryCatalog } from "../domain/asset/media-library";
import { buildMediaUploadPolicy } from "../domain/asset/media-upload-policy";
import { CanvasHost } from "./CanvasHost";

afterEach(cleanup);

const document = {
  id: "main",
  projectId: "project-1",
  schemaVersion: 1,
  revision: 2,
  content: { opaque: true },
};
const canvasInstanceId = "canvas-instance-1";

const repository = {
  getCanvasDocument: vi.fn(async () => null),
  save: vi.fn(async (input: {
    projectId: string;
    canvasId: string;
    schemaVersion: number;
    expectedRevision: number;
    content: unknown;
  }) => ({
    id: input.canvasId,
    projectId: input.projectId,
    schemaVersion: input.schemaVersion,
    revision: input.expectedRevision + 1,
    content: input.content,
  })),
};

const editableContext = {
  protocolVersion: 1 as const,
  capabilities: { accountSections: true, projectSwitcher: true },
  workspaceId: "organization-1",
  projectId: "project-1",
  projectName: "品牌故事",
  projects: [
    { id: "project-1", name: "品牌故事", coverUrl: null },
    { id: "project-2", name: "产品短片", coverUrl: "/assets/product.webp" },
  ],
  canvasId: "main",
  theme: "light" as const,
  writable: true,
  actor: {
    account: "creator@reelay.test",
    displayName: "Hoo",
  },
  workspace: {
    name: "星海视觉工作室",
    role: "owner" as const,
  },
};

function routed(ui: ReactElement): ReactElement {
  return (
    <MemoryRouter initialEntries={["/w/organization-1/projects/project-1/canvases/main"]}>
      {ui}
      <LocationProbe />
    </MemoryRouter>
  );
}

function render(ui: ReactElement) {
  return renderTestingLibrary(routed(ui));
}

function LocationProbe() {
  const location = useLocation();
  const state = location.state as { organizationReturnTo?: string } | null;
  return (
    <>
      <output data-testid="location">{location.pathname}</output>
      <output data-testid="organization-return-to">{state?.organizationReturnTo ?? ""}</output>
    </>
  );
}

function dispatchCanvasMessage(frame: HTMLIFrameElement, data: unknown): void {
  if ((data as { type?: string } | null)?.type !== "canvas:ready") {
    const instanceId = (data as { instanceId?: string } | null)?.instanceId ?? canvasInstanceId;
    window.dispatchEvent(new MessageEvent("message", {
      data: { ...readyMessage, instanceId },
      origin: window.location.origin,
      source: frame.contentWindow,
    }));
  }
  window.dispatchEvent(new MessageEvent("message", {
    data,
    origin: window.location.origin,
    source: frame.contentWindow,
  }));
}

function dispatchProgressiveReady(frame: HTMLIFrameElement, instanceId = canvasInstanceId): void {
  window.dispatchEvent(new MessageEvent("message", {
    origin: window.location.origin, source: frame.contentWindow,
    data: { source: "reelay-legacy-canvas", type: "canvas:capabilities", protocolVersion: 1,
      instanceId, capabilities: { progressiveAssetLoading: true } },
  }));
  dispatchCanvasMessage(frame, { ...readyMessage, instanceId });
}

function pendingResult<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

const progressiveContext = {
  ...editableContext,
  capabilities: { ...editableContext.capabilities, assetPersistence: true, entityPersistence: true },
};

describe("CanvasHost media library", () => {
  function libraryFixture() {
    const catalog: MediaLibraryCatalog = { folders: [{ id: "folder-1", name: "参考", parentId: null, space: "personal" }], tags: [], entries: [] };
    const library = { moveEntities: vi.fn(async () => catalog), list: vi.fn(async () => catalog), delete: vi.fn(async () => catalog), save: vi.fn(async () => catalog), updateTags: vi.fn(async () => catalog), deleteTag: vi.fn(async () => catalog),
      createFolder: vi.fn(async () => catalog.folders[0]!), renameFolder: vi.fn(async () => ({ ...catalog.folders[0]!, name: "更新目录" })), createTag: vi.fn(async () => ({ id: "tag", name: "自定义", space: "personal" as const })) };
    const media = { library, listProjectAssets: vi.fn(async () => []), listPersonalAssets: vi.fn(async () => []) };
    return { catalog, library, media };
  }

  it("moves group placements through the authorized scope and publishes the full catalog", async () => {
    const { catalog, library, media } = libraryFixture();
    const moved = { ...catalog, entityEntries: [{ entityId: "group", space: "personal" as const, folderId: "folder-1", addedAt: "2026-09-16T00:00:00.000Z", tagIds: [] }] };
    library.moveEntities.mockResolvedValue(moved);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId,
      requestId: "move-group", command: "move-entities", space: "personal", folderId: "folder-1", items: [{ entityId: "group", expectedFolderId: null }] };
    act(() => dispatchCanvasMessage(frame, { ...command, workspaceId: "forged" }));
    expect(library.moveEntities).not.toHaveBeenCalled();
    act(() => dispatchCanvasMessage(frame, command));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result", requestId: "move-group", command: "move-entities", result: moved }), window.location.origin));
    expect(library.moveEntities).toHaveBeenCalledExactlyOnceWith({ workspaceId: "organization-1", space: "personal", folderId: "folder-1", items: command.items });
  });

  it.each([
    { space: "personal", role: "member", writable: true, allowed: true },
    { space: "organization", role: "member", writable: true, allowed: false },
    { space: "organization", role: "owner", writable: true, allowed: true },
    { space: "organization", role: "admin", writable: true, allowed: true },
    { space: "personal", role: "owner", writable: false, allowed: false },
  ] as const)("authorizes custom tag deletion: $space / $role / writable=$writable", async ({ space, role, writable, allowed }) => {
    const { catalog, library, media } = libraryFixture();
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never}
      context={{ ...progressiveContext, writable, workspace: { ...progressiveContext.workspace, role } }} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "delete-label", command: "delete-tag", space, tagId: "custom", expectedUsageCount: 2 };
    act(() => dispatchCanvasMessage(frame, { ...command, workspaceId: "forged" }));
    expect(library.deleteTag).not.toHaveBeenCalled();
    act(() => dispatchCanvasMessage(frame, command));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining(allowed
      ? { type: "host:media-library-result", requestId: "delete-label", command: "delete-tag", result: catalog }
      : { type: "host:asset-command-error", requestId: "delete-label", code: "forbidden" }), window.location.origin));
    if (allowed) expect(library.deleteTag).toHaveBeenCalledExactlyOnceWith({ workspaceId: "organization-1", space, tagId: "custom", expectedUsageCount: 2 });
    else expect(library.deleteTag).not.toHaveBeenCalled();
  });

  it("publishes the committed tag removal before queued reads and retains deletion conflict details", async () => {
    const { catalog, library, media } = libraryFixture();
    const before = { ...catalog, tags: [{ id: "custom", space: "personal" as const, name: "精选" }] };
    const pending = pendingResult<MediaLibraryCatalog>();
    library.list.mockResolvedValueOnce(before).mockResolvedValue(catalog);
    library.deleteTag.mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new ApplicationError("conflict", "标签使用情况已更新", { serviceCode: "tag_usage_changed" }));
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(1));
    const base = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId };
    const command = { ...base, command: "delete-tag", space: "personal", tagId: "custom", expectedUsageCount: 1 };
    act(() => {
      dispatchCanvasMessage(frame, { ...command, requestId: "delete-first" });
      dispatchCanvasMessage(frame, { ...base, requestId: "read-next", command: "list" });
    });
    await waitFor(() => expect(library.deleteTag).toHaveBeenCalledTimes(1));
    expect(library.list).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(catalog));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result", requestId: "read-next", result: catalog }), window.location.origin));
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:media-library-result").map(([message]) => message.requestId))
      .toEqual(["delete-first", "read-next"]);
    act(() => dispatchCanvasMessage(frame, { ...command, requestId: "delete-conflict" }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:asset-command-error", requestId: "delete-conflict", code: "conflict", serviceCode: "tag_usage_changed", message: "标签使用情况已更新" }), window.location.origin));
  });

  it("orders deletion before catalog reads and suppresses late deletion results after workspace changes", async () => {
    const { catalog, library, media } = libraryFixture();
    const pending = pendingResult<MediaLibraryCatalog>();
    library.deleteTag.mockReturnValueOnce(pending.promise);
    const entities = { listPersonal: vi.fn(async () => []) };
    const { rerender } = render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={entities as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(1));
    const base = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId };
    act(() => {
      dispatchCanvasMessage(frame, { ...base, requestId: "delete-old", command: "delete-tag", space: "personal", tagId: "custom", expectedUsageCount: 1 });
      dispatchCanvasMessage(frame, { ...base, requestId: "read-old", command: "list" });
    });
    await waitFor(() => expect(library.deleteTag).toHaveBeenCalledTimes(1));
    expect(library.list).toHaveBeenCalledTimes(1);
    rerender(routed(<CanvasHost repository={repository} mediaAssetRepository={media as never} entityRepository={entities as never}
      context={{ ...progressiveContext, workspaceId: "other-workspace" }} />));
    await act(async () => pending.resolve(catalog));
    expect(postMessage.mock.calls.some(([message]) => message.type === "host:media-library-result"
      && ["delete-old", "read-old"].includes(message.requestId))).toBe(false);
  });

  it("uses Host workspace authority for tag deltas and publishes the confirmed group tags without editing the document", async () => {
    const { catalog, library, media } = libraryFixture();
    const latest: MediaLibraryCatalog = { ...catalog, entityEntries: [{ entityId: "group", space: "personal", tagIds: ["builtin:scene"] }] };
    library.updateTags.mockResolvedValueOnce(latest);
    const saveDocument = vi.fn();
    render(<CanvasHost repository={{ ...repository, save: saveDocument }} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "tag-edit", command: "update-tags", space: "personal", operation: "add",
      tagIds: ["builtin:scene"], items: [{ kind: "entity", id: "group" }] };
    act(() => dispatchCanvasMessage(frame, { ...command, workspaceId: "forged" }));
    expect(library.updateTags).not.toHaveBeenCalled();
    act(() => dispatchCanvasMessage(frame, command));
    await waitFor(() => expect(library.updateTags).toHaveBeenCalledExactlyOnceWith({ workspaceId: "organization-1",
      space: "personal", operation: "add", tagIds: command.tagIds, items: command.items }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result",
      requestId: "tag-edit", command: "update-tags", result: latest }), window.location.origin));
    act(() => dispatchProgressiveReady(frame, "tagged-frame"));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog",
      instanceId: "tagged-frame", libraryCatalog: latest }), window.location.origin));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it.each([
    { space: "personal", role: "member", writable: true, allowed: true },
    { space: "organization", role: "member", writable: true, allowed: false },
    { space: "organization", role: "owner", writable: true, allowed: true },
    { space: "organization", role: "admin", writable: true, allowed: true },
    { space: "organization", role: "owner", writable: false, allowed: false },
    { space: "personal", role: "member", writable: false, allowed: false },
  ] as const)("enforces tag edit scope and project access: $space / $role / writable=$writable", async ({ space, role, writable, allowed }) => {
    const { library, media } = libraryFixture();
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never}
      context={{ ...progressiveContext, writable, workspace: { ...progressiveContext.workspace, role } }} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "scoped-tags", command: "update-tags", space, operation: "remove",
      tagIds: ["builtin:scene"], items: [{ kind: "media", id: "asset" }] }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining(allowed
      ? { type: "host:media-library-result", requestId: "scoped-tags" }
      : { type: "host:asset-command-error", requestId: "scoped-tags", code: "forbidden" }), window.location.origin));
    expect(library.updateTags).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });

  it("sequences tag edits with saves and catalog reads while ignoring a late initial snapshot", async () => {
    const { catalog, library, media } = libraryFixture();
    const initialRead = pendingResult<MediaLibraryCatalog>();
    const saving = pendingResult<MediaLibraryCatalog>();
    const latest: MediaLibraryCatalog = { ...catalog, entityEntries: [{ entityId: "group", space: "personal", tagIds: ["builtin:scene"] }] };
    library.list.mockReturnValueOnce(initialRead.promise).mockResolvedValueOnce(latest);
    library.save.mockReturnValueOnce(saving.promise);
    library.updateTags.mockResolvedValueOnce(latest);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(1));
    const base = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId };
    act(() => {
      dispatchCanvasMessage(frame, { ...base, requestId: "save-first", command: "save", space: "personal", folderId: null,
        tagIds: [], items: [{ assetId: "asset", displayName: "素材", action: "save" }] });
      dispatchCanvasMessage(frame, { ...base, requestId: "tag-second", command: "update-tags", space: "personal", operation: "add",
        tagIds: ["builtin:scene"], items: [{ kind: "entity", id: "group" }] });
      dispatchCanvasMessage(frame, { ...base, requestId: "list-third", command: "list" });
    });
    await waitFor(() => expect(library.save).toHaveBeenCalledTimes(1));
    expect(library.updateTags).not.toHaveBeenCalled();
    expect(library.list).toHaveBeenCalledTimes(1);
    await act(async () => saving.resolve(catalog));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result",
      command: "list", requestId: "list-third", result: latest }), window.location.origin));
    await act(async () => initialRead.resolve(catalog));
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:media-library-result")
      .map(([message]) => [message.requestId, message.result])).toEqual([["save-first", catalog], ["tag-second", latest], ["list-third", latest]]);
    const snapshots = postMessage.mock.calls.filter(([message]) => message.type === "host:workspace-asset-catalog");
    expect(snapshots.at(-1)![0].libraryCatalog).toEqual(latest);
  });

  it.each(["instance", "scope", "permission"] as const)("drops late tag results and queued writes after a %s change", async (kind) => {
    const { catalog, library, media } = libraryFixture();
    const pending = pendingResult<MediaLibraryCatalog>();
    library.updateTags.mockReturnValueOnce(pending.promise);
    const entities = { listPersonal: vi.fn(async () => []) };
    const { rerender } = render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={entities as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, command: "update-tags", space: "personal", operation: "add", tagIds: ["builtin:scene"],
      items: [{ kind: "entity", id: "group" }] };
    act(() => {
      dispatchCanvasMessage(frame, { ...command, requestId: "old-tags" });
      dispatchCanvasMessage(frame, { ...command, requestId: "queued-tags" });
    });
    await waitFor(() => expect(library.updateTags).toHaveBeenCalledTimes(1));
    if (kind === "instance") act(() => dispatchProgressiveReady(frame, "replacement-tags"));
    else rerender(routed(<CanvasHost repository={repository} mediaAssetRepository={media as never} entityRepository={entities as never}
      context={kind === "permission" ? { ...progressiveContext, writable: false } : { ...progressiveContext, workspaceId: "different-workspace" }} />));
    const stale = { ...catalog, entityEntries: [{ entityId: "old-group", space: "personal" as const, tagIds: ["builtin:scene"] }] };
    await act(async () => pending.resolve(stale));
    expect(library.updateTags).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls.some(([message]) => message.type === "host:media-library-result"
      && ["old-tags", "queued-tags"].includes(message.requestId))).toBe(false);
    expect(postMessage.mock.calls.some(([message]) => message.libraryCatalog?.entityEntries?.some((entry: { entityId: string }) => entry.entityId === "old-group"))).toBe(false);
  });

  it("delivers server upload policy after init without delaying the canvas document", async () => {
    const { media } = libraryFixture();
    const loading = pendingResult<ReturnType<typeof buildMediaUploadPolicy>>();
    const getUploadPolicy = vi.fn(() => loading.promise);
    render(<CanvasHost repository={repository} context={progressiveContext}
      mediaAssetRepository={{ ...media, getUploadPolicy } as never} entityRepository={{ listPersonal: async () => [] } as never} />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchProgressiveReady(frame);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:init" }), window.location.origin));
    expect(getUploadPolicy).toHaveBeenCalledWith("organization-1");
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-upload-policy", status: "loading", policy: null }), window.location.origin));
    const policy = buildMediaUploadPolicy(64 * 1024 * 1024);
    await act(async () => loading.resolve(policy));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-upload-policy", status: "ready", policy }), window.location.origin));
  });

  it("cancels only the active granted upload and exposes terminal service codes for safe retry", async () => {
    const { media } = libraryFixture();
    const createUploadIntent = vi.fn().mockResolvedValueOnce({ uploadIntent: { id: "granted", expiresAt: "2026-09-20T00:00:00Z" },
      upload: { url: "/upload", method: "PUT", headers: {} } }).mockRejectedValueOnce(
      new ApplicationError("conflict", "旧上传已取消", { serviceCode: "asset_upload_cancelled" }));
    const cancelUpload = vi.fn(async () => ({ id: "granted", status: "cancelled" as const }));
    render(<CanvasHost repository={repository} context={progressiveContext}
      mediaAssetRepository={{ ...media, createUploadIntent, cancelUpload } as never} entityRepository={{ listPersonal: async () => [] } as never} />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:init" }), window.location.origin));
    const upload = { source: "reelay-legacy-canvas", type: "canvas:create-media-upload", protocolVersion: 1, instanceId: canvasInstanceId,
      requestId: "original", idempotencyKey: "original-key", target: "personal", mediaKind: "image", displayName: "cover.png",
      contentType: "image/png", byteSize: 42, checksumSha256: "a".repeat(64) };
    dispatchCanvasMessage(frame, upload);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-upload-grant" }), window.location.origin));
    const cancel = { source: "reelay-legacy-canvas", type: "canvas:cancel-media-upload", protocolVersion: 1, instanceId: canvasInstanceId,
      requestId: "original", uploadId: "forged" };
    dispatchCanvasMessage(frame, cancel);
    expect(cancelUpload).not.toHaveBeenCalled();
    dispatchCanvasMessage(frame, { ...cancel, uploadId: "granted" });
    await waitFor(() => expect(cancelUpload).toHaveBeenCalledWith("organization-1", "granted"));
    dispatchCanvasMessage(frame, { ...upload, requestId: "retry" });
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:asset-command-error",
      requestId: "retry", serviceCode: "asset_upload_cancelled", message: "旧上传已取消" }), window.location.origin));
  });

  it("renames a folder in Host-owned scope and publishes the confirmed updated folder", async () => {
    const { library, media } = libraryFixture();
    const saveDocument = vi.fn();
    render(<CanvasHost repository={{ ...repository, save: saveDocument }} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId,
      requestId: "rename-directory", command: "rename-folder", space: "personal", folderId: "folder-1", name: "更新目录", expectedName: "参考" };
    act(() => dispatchCanvasMessage(frame, command));
    await waitFor(() => expect(library.renameFolder).toHaveBeenCalledExactlyOnceWith({ workspaceId: "organization-1", space: "personal", folderId: "folder-1", name: "更新目录", expectedName: "参考" }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result", command: "rename-folder", requestId: "rename-directory", result: { id: "folder-1", space: "personal", name: "更新目录", parentId: null } }), window.location.origin));
    act(() => dispatchProgressiveReady(frame, "renamed-frame"));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog", instanceId: "renamed-frame", libraryCatalog: expect.objectContaining({ folders: [{ id: "folder-1", space: "personal", name: "更新目录", parentId: null }] }) }), window.location.origin));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it("does not forward organization folder renaming by a regular member", async () => {
    const { library, media } = libraryFixture();
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never}
      context={{ ...progressiveContext, workspace: { ...progressiveContext.workspace, role: "member" } }} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "rename-denied", command: "rename-folder", space: "organization", folderId: "folder-1", name: "New", expectedName: "Original" }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:asset-command-error", requestId: "rename-denied", code: "forbidden" }), window.location.origin));
    expect(library.renameFolder).not.toHaveBeenCalled();
  });

  it("refreshes personal groups after deletion and reports the confirmed scoped catalog without saving the canvas", async () => {
    const { catalog, library, media } = libraryFixture();
    const listPersonal = vi.fn(async () => []);
    const saveDocument = vi.fn();
    render(<CanvasHost repository={{ ...repository, save: saveDocument }} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(listPersonal).toHaveBeenCalledTimes(1));
    const items = [{ kind: "entity", id: "group", expectedVersion: 2 }, { kind: "folder", id: "folder-1" }];
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "delete-library", command: "delete", space: "personal", items }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result",
      requestId: "delete-library", command: "delete", result: catalog }), window.location.origin));
    expect(library.delete).toHaveBeenCalledExactlyOnceWith({ workspaceId: "organization-1", space: "personal", items });
    expect(listPersonal).toHaveBeenCalledTimes(2);
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it("keeps subjects and publishes their detached location after deleting a historical folder", async () => {
    const { catalog, library, media } = libraryFixture();
    const group = { id: "group", name: "主体", description: "", version: 1, mediaRefs: [{ assetId: "asset", order: 0 }], coverAssetId: "asset" };
    catalog.entries.push({ assetId: "asset", assetVersion: 1, mediaKind: "image", displayName: "素材",
      contentType: "image/png", byteSize: 8, checksumSha256: "a".repeat(64), contentUrl: "/api/media/asset/content",
      createdAt: "2026-09-15T00:00:00.000Z", space: "personal", folderId: null, tagIds: [] });
    media.listPersonalAssets.mockRejectedValueOnce(new Error("use complete library projection"));
    catalog.entityEntries = [{ entityId: group.id, space: "personal", folderId: "folder-1", tagIds: ["builtin:character"], addedAt: "2026-09-16T00:00:00.000Z" }];
    const updated = { ...catalog, folders: [], entityEntries: catalog.entityEntries.map((entry) => ({ ...entry, folderId: null })) };
    library.delete.mockResolvedValue(updated);
    const listPersonal = vi.fn().mockResolvedValue([group]);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never} entityRepository={{ listPersonal } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog", entities: [group] }), window.location.origin));
    postMessage.mockClear();
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "delete-old-directory", command: "delete", space: "personal", items: [{ kind: "folder", id: "folder-1" }] }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result", command: "delete", result: updated }), window.location.origin));
    expect(listPersonal).toHaveBeenCalledTimes(2);
    expect(library.delete).toHaveBeenCalledExactlyOnceWith({ workspaceId: "organization-1", space: "personal", items: [{ kind: "folder", id: "folder-1" }] });
  });

  it("does not restore deleted groups or media when the initial personal catalog arrives late", async () => {
    const { library, media } = libraryFixture();
    const group = { id: "group", name: "组", description: "", version: 1, mediaRefs: [{ assetId: "asset", order: 0 }], coverAssetId: "asset" };
    const initialEntities = pendingResult<typeof group[]>();
    const listPersonal = vi.fn().mockReturnValueOnce(initialEntities.promise).mockResolvedValue([]);
    media.listPersonalAssets.mockResolvedValueOnce([{ id: "asset", workspaceId: "organization-1", objectVersion: 1, mediaKind: "image", displayName: "素材",
      contentType: "image/png", byteSize: 8, checksumSha256: "a".repeat(64), contentUrl: "/api/media/asset/content", createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z" }] as never);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never} entityRepository={{ listPersonal } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "delete-before-load", command: "delete", space: "personal", items: [{ kind: "entity", id: "group", expectedVersion: 1 }, { kind: "media", id: "asset" }] }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result", command: "delete" }), window.location.origin));
    postMessage.mockClear();
    await act(async () => initialEntities.resolve([group]));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog", entities: [], assets: [] }), window.location.origin));
    const catalogMessages = postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === "host:workspace-asset-catalog");
    expect(catalogMessages.every((message) => message.entities.length === 0 && message.assets.length === 0)).toBe(true);
  });

  it("rejects organization deletion by a member before forwarding the request", async () => {
    const { library, media } = libraryFixture();
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never}
      context={{ ...progressiveContext, workspace: { ...progressiveContext.workspace, role: "member" } }} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "delete-denied", command: "delete", space: "organization", items: [{ kind: "media", id: "asset" }] }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:asset-command-error", requestId: "delete-denied", code: "forbidden" }), window.location.origin));
    expect(library.delete).not.toHaveBeenCalled();
  });

  it("delivers the library when the separate entity catalog fails", async () => {
    const { catalog, media } = libraryFixture();
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => { throw new Error("entity unavailable"); }) } as never}
      context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:workspace-asset-catalog", libraryCatalog: catalog,
    }), window.location.origin));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:asset-availability", workspaceCatalog: "unavailable", mediaLibrary: "ready",
    }), window.location.origin);
  });

  it("recovers personal media from the library projection when the older personal-list endpoint fails", async () => {
    const { catalog, media } = libraryFixture();
    catalog.entries.push({ assetId: "asset", assetVersion: 1, mediaKind: "image", displayName: "素材",
      contentType: "image/png", byteSize: 8, checksumSha256: "a".repeat(64), contentUrl: "/api/media/asset/content",
      createdAt: "2026-09-15T00:00:00.000Z", space: "personal", folderId: null, tagIds: [] });
    media.listPersonalAssets.mockRejectedValueOnce(new Error("personal list unavailable"));
    const entity = { id: "entity", name: "素材组", description: "", version: 1,
      mediaRefs: [{ assetId: "asset", order: 0 }], coverAssetId: "asset" };
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => [entity]) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:workspace-asset-catalog", libraryCatalog: catalog,
      assets: [expect.objectContaining({ assetId: "asset" })], entities: [entity],
    }), window.location.origin));
  });

  it("uses host-owned scope and returns confirmed data without writing the canvas document", async () => {
    const { catalog, library, media } = libraryFixture();
    const saveDocument = vi.fn();
    render(<CanvasHost repository={{ ...repository, save: saveDocument }} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalledWith("organization-1"));
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "save-library", command: "save", space: "organization", folderId: null,
      tagIds: ["builtin:scene"], items: [{ assetId: "asset", displayName: "库名称", action: "save" }] };
    act(() => dispatchCanvasMessage(frame, command));
    await waitFor(() => expect(library.save).toHaveBeenCalledExactlyOnceWith({ workspaceId: "organization-1", projectId: "project-1",
      space: "organization", folderId: null, tagIds: command.tagIds, items: command.items }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:media-library-result", requestId: "save-library", command: "save", result: catalog,
    }), window.location.origin);
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it("does not replay the initial library over a save completed while Entity loading is pending", async () => {
    const { library, media } = libraryFixture();
    const entities = pendingResult<[]>();
    const latest = { folders: [{ id: "saved-folder", name: "新目录", parentId: null, space: "personal" as const }], tags: [], entries: [] };
    library.save.mockResolvedValueOnce(latest);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(() => entities.promise) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(1));
    act(() => dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "save-before-entities", command: "save", space: "personal", folderId: null,
      tagIds: [], items: [{ assetId: "asset", displayName: "素材", action: "save" }],
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result", result: latest }), window.location.origin));
    await act(async () => entities.resolve([]));
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:workspace-asset-catalog").map(([message]) => message.libraryCatalog)).toEqual([latest]);
  });

  it.each(["success", "failure"] as const)("settles an earlier list %s before a later save and keeps the confirmed saved snapshot", async (outcome) => {
    const { library, media } = libraryFixture();
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    const oldRead = pendingResult<MediaLibraryCatalog>();
    library.list.mockReturnValueOnce(oldRead.promise);
    const latest: MediaLibraryCatalog = { folders: [{ id: "latest", name: "最新", parentId: null, space: "personal" }], tags: [], entries: [] };
    library.save.mockResolvedValueOnce(latest);
    const base = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId };
    act(() => dispatchCanvasMessage(frame, { ...base, requestId: "old-read", command: "list" }));
    act(() => dispatchCanvasMessage(frame, { ...base, requestId: "latest-save", command: "save", space: "personal", folderId: null,
      tagIds: [], items: [{ assetId: "asset", displayName: "素材", action: "save" }] }));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(2));
    expect(library.save).not.toHaveBeenCalled();
    await act(async () => outcome === "success" ? oldRead.resolve({ folders: [], tags: [], entries: [] }) : oldRead.reject(new Error("old failure")));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-library-result", requestId: "latest-save", result: latest }), window.location.origin));
    expect(postMessage.mock.calls.filter(([message]) => message.requestId === "old-read" || message.requestId === "latest-save")
      .map(([message]) => message.requestId)).toEqual(["old-read", "latest-save"]);
    act(() => dispatchProgressiveReady(frame, "replacement-after-save"));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:workspace-asset-catalog", instanceId: "replacement-after-save", libraryCatalog: latest,
    }), window.location.origin));
    expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-availability", mediaLibrary: "ready" });
  });

  it.each(["create-folder", "rename-folder"] as const)("includes a cancelled draft's confirmed %s in the next draft's list", async (command) => {
    const { library, media, catalog } = libraryFixture();
    const write = pendingResult<typeof catalog.folders[0]>();
    const folder = { id: command === "create-folder" ? "new-folder" : "folder-1", name: "已确认目录", space: "personal" as const, parentId: null };
    const latest = { ...catalog, folders: [...catalog.folders.filter((item) => item.id !== folder.id), folder] };
    if (command === "create-folder") library.createFolder.mockReturnValueOnce(write.promise);
    else library.renameFolder.mockReturnValueOnce(write.promise);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    const base = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId };
    act(() => dispatchCanvasMessage(frame, { ...base, requestId: "draft-a-write", command, space: "personal", name: folder.name,
      ...(command === "create-folder" ? { parentId: null } : { folderId: "folder-1", expectedName: "参考" }) }));
    await waitFor(() => expect(command === "create-folder" ? library.createFolder : library.renameFolder).toHaveBeenCalledTimes(1));
    // A's modal can close while its write is pending; B must read after that write settles.
    await act(async () => dispatchCanvasMessage(frame, { ...base, requestId: "draft-b-list", command: "list" }));
    expect(library.list).toHaveBeenCalledTimes(1);
    library.list.mockResolvedValueOnce(latest);
    await act(async () => write.resolve(folder));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:media-library-result", requestId: "draft-b-list", command: "list", result: latest,
    }), window.location.origin));
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:media-library-result")
      .map(([message]) => message.requestId)).toEqual(["draft-a-write", "draft-b-list"]);
  });

  it.each(["instance", "project"] as const)("does not execute a queued library read after its %s is replaced", async (replacement) => {
    const { library, media, catalog } = libraryFixture();
    const write = pendingResult<typeof catalog.folders[0]>();
    library.createFolder.mockReturnValueOnce(write.promise);
    const entityRepository = { listPersonal: vi.fn(async () => []) };
    const view = render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={entityRepository as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    const base = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1, instanceId: canvasInstanceId };
    act(() => dispatchCanvasMessage(frame, { ...base, requestId: "old-write", command: "create-folder", space: "personal", name: "新目录", parentId: null }));
    await waitFor(() => expect(library.createFolder).toHaveBeenCalledTimes(1));
    await act(async () => dispatchCanvasMessage(frame, { ...base, requestId: "old-queued-list", command: "list" }));
    expect(library.list).toHaveBeenCalledTimes(1);
    if (replacement === "instance") act(() => dispatchProgressiveReady(frame, "new-library-instance"));
    else {
      view.rerender(routed(<CanvasHost repository={repository} mediaAssetRepository={media as never}
        entityRepository={entityRepository as never} context={{ ...progressiveContext, projectId: "project-2" }} />));
      await waitFor(() => expect(library.list).toHaveBeenCalledTimes(2));
    }
    const readsBeforeCompletion = library.list.mock.calls.length;
    await act(async () => write.resolve(catalog.folders[0]!));
    expect(library.list).toHaveBeenCalledTimes(readsBeforeCompletion);
    expect(postMessage.mock.calls.some(([message]) => message.requestId === "old-write" || message.requestId === "old-queued-list")).toBe(false);
  });

  it("rereads a command list invalidated by upload discovery before replying to the draft", async () => {
    const { library, media, catalog } = libraryFixture();
    const importFile = vi.fn(async () => ({ projectAsset: null, asset: {
      id: "import", workspaceId: "organization-1", objectVersion: 1, mediaKind: "image" as const,
      displayName: "素材", contentType: "image/png", byteSize: 4, checksumSha256: "a".repeat(64),
      contentUrl: "/api/media/content", createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
    } }));
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      transientMediaRepository={{ importFile }} entityRepository={{ listPersonal: vi.fn(async () => []) } as never}
      context={{ ...progressiveContext, capabilities: { ...progressiveContext.capabilities, transientMediaUpload: true } }} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    const oldRead = pendingResult<MediaLibraryCatalog>();
    const latest: MediaLibraryCatalog = { folders: [{ id: "latest", name: "最新", space: "personal", parentId: null }], entries: [], tags: [] };
    library.list.mockReturnValueOnce(oldRead.promise).mockResolvedValue(latest);
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "draft-list", command: "list" }));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(2));
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:import-transient-media", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "new-import", target: "personal", displayName: "素材", mediaKind: "image", contentType: "image/png", body: new ArrayBuffer(4) }));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(3));
    await act(async () => oldRead.resolve(catalog));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:media-library-result", requestId: "draft-list", command: "list", result: latest,
    }), window.location.origin));
    expect(library.list).toHaveBeenCalledTimes(4);
    expect(postMessage.mock.calls.filter(([message]) => message.requestId === "draft-list")).toHaveLength(1);
  });

  it("sequences overlapping write requests so later metadata cannot be replaced by an older save result", async () => {
    const { library, media, catalog } = libraryFixture();
    const first = pendingResult<MediaLibraryCatalog>();
    const latest: MediaLibraryCatalog = { folders: [{ id: "latest", name: "最新", parentId: null, space: "personal" }], tags: [], entries: [] };
    library.save.mockReturnValueOnce(first.promise).mockResolvedValueOnce(latest);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, command: "save", space: "personal", folderId: null, tagIds: [],
      items: [{ assetId: "asset", displayName: "素材", action: "save" }] };
    act(() => {
      dispatchCanvasMessage(frame, { ...command, requestId: "first-save" });
      dispatchCanvasMessage(frame, { ...command, requestId: "second-save" });
    });
    await waitFor(() => expect(library.save).toHaveBeenCalledTimes(1));
    await act(async () => first.resolve(catalog));
    await waitFor(() => expect(library.save).toHaveBeenCalledTimes(2));
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:media-library-result").map(([message]) => [message.requestId, message.result])).toEqual([
      ["first-save", catalog], ["second-save", latest],
    ]);
  });

  it("keeps batch imports writable while refreshing and ignores an older concurrent refresh", async () => {
    const { library, media } = libraryFixture();
    let importCount = 0;
    const importFile = vi.fn(async () => ({ projectAsset: null, asset: {
      id: `import-${++importCount}`, workspaceId: "organization-1", objectVersion: 1,
      mediaKind: "image" as const, displayName: "素材", contentType: "image/png", byteSize: 4,
      checksumSha256: "a".repeat(64), contentUrl: "/api/media/content", createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:00:00.000Z",
    } }));
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      transientMediaRepository={{ importFile }} entityRepository={{ listPersonal: vi.fn(async () => []) } as never}
      context={{ ...progressiveContext, capabilities: { ...progressiveContext.capabilities, transientMediaUpload: true } }} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    const first = pendingResult<MediaLibraryCatalog>();
    const second = pendingResult<MediaLibraryCatalog>();
    library.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const upload = { source: "reelay-legacy-canvas", type: "canvas:import-transient-media", protocolVersion: 1,
      instanceId: canvasInstanceId, target: "personal", displayName: "素材", mediaKind: "image", contentType: "image/png", body: new ArrayBuffer(4) };
    act(() => dispatchCanvasMessage(frame, { ...upload, requestId: "first-import" }));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(2));
    act(() => dispatchCanvasMessage(frame, { ...upload, requestId: "second-import" }));
    await waitFor(() => expect(importFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(3));
    const latest: MediaLibraryCatalog = { folders: [{ id: "latest", name: "最新", space: "personal", parentId: null }], entries: [], tags: [] };
    await act(async () => second.resolve(latest));
    await act(async () => first.resolve({ folders: [], tags: [], entries: [] }));
    const snapshots = postMessage.mock.calls.filter(([message]) => message.type === "host:workspace-asset-catalog");
    expect(snapshots.at(-1)![0].libraryCatalog).toEqual(latest);
  });

  it("permits listing but refuses mutations for a read-only canvas", async () => {
    const { library, media } = libraryFixture();
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={{ ...progressiveContext, writable: false }} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(1));
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "folder", command: "create-folder", space: "personal", parentId: null, name: "参考" };
    act(() => dispatchCanvasMessage(frame, command));
    expect(library.createFolder).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:asset-command-error", code: "forbidden", requestId: "folder" }), window.location.origin);
    act(() => dispatchCanvasMessage(frame, { source: command.source, type: command.type, protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "read", command: "list" }));
    await waitFor(() => expect(library.list).toHaveBeenCalledTimes(2));
  });

  it("drops completion after instance replacement and preserves server validation text", async () => {
    const { media, library, catalog } = libraryFixture();
    const pending = pendingResult<typeof catalog.folders[0]>();
    library.createFolder.mockImplementationOnce(() => pending.promise);
    render(<CanvasHost repository={repository} mediaAssetRepository={media as never}
      entityRepository={{ listPersonal: vi.fn(async () => []) } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(library.list).toHaveBeenCalled());
    const command = { source: "reelay-legacy-canvas", type: "canvas:media-library-command", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "old-folder", command: "create-folder", space: "personal", parentId: null, name: "参考" };
    act(() => dispatchCanvasMessage(frame, command));
    await waitFor(() => expect(library.createFolder).toHaveBeenCalledTimes(1));
    act(() => dispatchProgressiveReady(frame, "replacement"));
    await act(async () => pending.resolve(catalog.folders[0]!));
    expect(postMessage.mock.calls.some(([message]) => message.type === "host:media-library-result" && message.requestId === "old-folder")).toBe(false);
    library.createFolder.mockRejectedValueOnce(new ApplicationError("conflict", "当前目录已有同名文件夹。", { serviceCode: "folder_name_conflict" }));
    act(() => dispatchCanvasMessage(frame, { ...command, instanceId: "replacement", requestId: "retry-folder" }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:asset-command-error", requestId: "retry-folder", code: "conflict", message: "当前目录已有同名文件夹。",
    }), window.location.origin));
  });
});

describe("CanvasHost progressive asset loading", () => {
  it.each([document, null])("starts catalogs only after a successful document read, including empty canvases: %j", async (loadedDocument) => {
    const initialDocument = pendingResult<CanvasDocument | null>();
    const catalog = pendingResult<[]>();
    const saved = pendingResult<CanvasDocument>();
    const listProjectAssets = vi.fn(() => catalog.promise);
    const listPersonalAssets = vi.fn(() => catalog.promise);
    const listPersonal = vi.fn(() => catalog.promise);
    const save = vi.fn(() => saved.promise);
    render(<CanvasHost
      repository={{ getCanvasDocument: vi.fn(() => initialDocument.promise), save }}
      mediaAssetRepository={{ listProjectAssets, listPersonalAssets } as never}
      entityRepository={{ listPersonal } as never} context={progressiveContext} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    expect(listProjectAssets).not.toHaveBeenCalled();
    expect(listPersonalAssets).not.toHaveBeenCalled();
    expect(listPersonal).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();

    await act(async () => initialDocument.resolve(loadedDocument));
    expect(listProjectAssets).toHaveBeenCalledExactlyOnceWith("project-1");
    expect(listPersonalAssets).toHaveBeenCalledExactlyOnceWith("organization-1");
    expect(listPersonal).toHaveBeenCalledExactlyOnceWith("organization-1");
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:document", document: loadedDocument }), window.location.origin);
    expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-availability", projectAssets: "loading", workspaceCatalog: "loading" });

    act(() => {
      dispatchCanvasMessage(frame, dirtyMessage(true));
      dispatchCanvasMessage(frame, saveMessage("while-catalogs-load", canvasInstanceId, loadedDocument?.revision ?? 0));
    });
    expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saving");
    await act(async () => catalog.resolve([]));
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:init")).toHaveLength(1);
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:document")).toHaveLength(1);
    expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saving");
    await act(async () => saved.resolve({ ...document, revision: (loadedDocument?.revision ?? 0) + 1 }));
  });

  it.each([new Error("offline"), new ApplicationError("not_found", "missing")])("does not read catalogs after document failure and keeps retry document-first: %s", async (error) => {
    const initialDocument = pendingResult<CanvasDocument | null>();
    const retriedDocument = pendingResult<CanvasDocument | null>();
    const getCanvasDocument = vi.fn().mockReturnValueOnce(initialDocument.promise).mockReturnValueOnce(retriedDocument.promise);
    const listProjectAssets = vi.fn(async () => []);
    const listPersonalAssets = vi.fn(async () => []);
    const listPersonal = vi.fn(async () => []);
    render(<CanvasHost repository={{ ...repository, getCanvasDocument }}
      mediaAssetRepository={{ listProjectAssets, listPersonalAssets } as never}
      entityRepository={{ listPersonal } as never} context={progressiveContext} />);
    await act(async () => initialDocument.reject(error));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(listProjectAssets).not.toHaveBeenCalled();
    expect(listPersonalAssets).not.toHaveBeenCalled();
    expect(listPersonal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重试加载" }));
    expect(getCanvasDocument).toHaveBeenCalledTimes(2);
    expect(listProjectAssets).not.toHaveBeenCalled();
    expect(listPersonalAssets).not.toHaveBeenCalled();
    expect(listPersonal).not.toHaveBeenCalled();
    await act(async () => retriedDocument.resolve(document));
    expect(listProjectAssets).toHaveBeenCalledExactlyOnceWith("project-1");
    expect(listPersonalAssets).toHaveBeenCalledExactlyOnceWith("organization-1");
    expect(listPersonal).toHaveBeenCalledExactlyOnceWith("organization-1");
  });

  it.each([
    { field: "project", nextContext: { ...progressiveContext, projectId: "project-2" } },
    { field: "canvas", nextContext: { ...progressiveContext, canvasId: "second" } },
    { field: "workspace", nextContext: { ...progressiveContext, workspaceId: "organization-2" } },
  ])("does not start obsolete catalogs when a document resolves after changing $field", async ({ nextContext }) => {
    const previous = pendingResult<CanvasDocument | null>();
    const current = pendingResult<CanvasDocument | null>();
    const documents = { ...repository, getCanvasDocument: vi.fn().mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise) };
    const listProjectAssets = vi.fn(async () => []);
    const listPersonalAssets = vi.fn(async () => []);
    const listPersonal = vi.fn(async () => []);
    const mediaAssetRepository = { listProjectAssets, listPersonalAssets } as never;
    const entityRepository = { listPersonal } as never;
    const ui = (context: typeof progressiveContext) => <CanvasHost repository={documents}
      mediaAssetRepository={mediaAssetRepository} entityRepository={entityRepository} context={context} />;
    const view = render(ui(progressiveContext));
    view.rerender(routed(ui(nextContext)));
    await act(async () => previous.resolve(document));
    expect(listProjectAssets).not.toHaveBeenCalled();
    expect(listPersonalAssets).not.toHaveBeenCalled();
    expect(listPersonal).not.toHaveBeenCalled();
    await act(async () => current.resolve({ ...document, projectId: nextContext.projectId, id: nextContext.canvasId }));
    expect(listProjectAssets).toHaveBeenCalledExactlyOnceWith(nextContext.projectId);
    expect(listPersonalAssets).toHaveBeenCalledExactlyOnceWith(nextContext.workspaceId);
    expect(listPersonal).toHaveBeenCalledExactlyOnceWith(nextContext.workspaceId);
  });

  it("does not start catalogs when the host unmounts before its document arrives", async () => {
    const initialDocument = pendingResult<CanvasDocument | null>();
    const listProjectAssets = vi.fn(async () => []);
    const listPersonalAssets = vi.fn(async () => []);
    const listPersonal = vi.fn(async () => []);
    const view = render(<CanvasHost repository={{ ...repository, getCanvasDocument: () => initialDocument.promise }}
      mediaAssetRepository={{ listProjectAssets, listPersonalAssets } as never}
      entityRepository={{ listPersonal } as never} context={progressiveContext} />);
    view.unmount();
    await act(async () => initialDocument.resolve(document));
    expect(listProjectAssets).not.toHaveBeenCalled();
    expect(listPersonalAssets).not.toHaveBeenCalled();
    expect(listPersonal).not.toHaveBeenCalled();
  });

  it("starts only the live effect's catalogs when StrictMode replays a shared document read", async () => {
    const initialDocument = pendingResult<CanvasDocument | null>();
    const getCanvasDocument = vi.fn(() => initialDocument.promise);
    const listProjectAssets = vi.fn(async () => []);
    const listPersonalAssets = vi.fn(async () => []);
    const listPersonal = vi.fn(async () => []);
    renderTestingLibrary(<StrictMode>{routed(<CanvasHost repository={{ ...repository, getCanvasDocument }}
      mediaAssetRepository={{ listProjectAssets, listPersonalAssets } as never}
      entityRepository={{ listPersonal } as never} context={progressiveContext} />)}</StrictMode>);
    expect(getCanvasDocument).toHaveBeenCalledTimes(2);
    expect(listProjectAssets).not.toHaveBeenCalled();
    expect(listPersonalAssets).not.toHaveBeenCalled();
    expect(listPersonal).not.toHaveBeenCalled();
    await act(async () => initialDocument.resolve(document));
    expect(listProjectAssets).toHaveBeenCalledExactlyOnceWith("project-1");
    expect(listPersonalAssets).toHaveBeenCalledExactlyOnceWith("organization-1");
    expect(listPersonal).toHaveBeenCalledExactlyOnceWith("organization-1");
  });

  it("rejects late discovery from a replaced project and only sends the current scope to its new instance", async () => {
    const oldProject = pendingResult<[]>();
    const oldPersonal = pendingResult<[]>();
    const oldEntities = pendingResult<[]>();
    const mediaAssetRepository = { listProjectAssets: vi.fn().mockReturnValueOnce(oldProject.promise).mockResolvedValue([]),
      listPersonalAssets: vi.fn().mockReturnValueOnce(oldPersonal.promise).mockResolvedValue([]) } as never;
    const entityRepository = { listPersonal: vi.fn().mockReturnValueOnce(oldEntities.promise).mockResolvedValue([]) } as never;
    const documents = { ...repository, getCanvasDocument: vi.fn(async (projectId: string) => ({ ...document, projectId })) };
    const ui = (projectId: string) => <CanvasHost repository={documents} mediaAssetRepository={mediaAssetRepository}
      entityRepository={entityRepository} context={{ ...progressiveContext, projectId }} />;
    const view = render(ui("project-1"));
    const oldFrame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    act(() => dispatchProgressiveReady(oldFrame));
    view.rerender(routed(ui("project-2")));
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame, "replacement"));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:document", document: expect.objectContaining({ projectId: "project-2" }) }), window.location.origin));
    await waitFor(() => expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-availability", instanceId: "replacement", workspaceCatalog: "ready" }));
    const count = postMessage.mock.calls.length;
    await act(async () => { oldProject.resolve([]); oldPersonal.resolve([]); oldEntities.resolve([]); });
    expect(postMessage.mock.calls).toHaveLength(count);
  });

  it.each([true, false])("initializes before catalogs only for a negotiated iframe: %s", async (progressive) => {
    const project = pendingResult<[]>();
    const personal = pendingResult<[]>();
    const entities = pendingResult<[]>();
    render(<CanvasHost repository={{ ...repository, getCanvasDocument: vi.fn(async () => document) }}
      mediaAssetRepository={{ listProjectAssets: () => project.promise, listPersonalAssets: () => personal.promise } as never}
      entityRepository={{ listPersonal: () => entities.promise } as never} context={progressiveContext} />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => progressive ? dispatchProgressiveReady(frame) : dispatchCanvasMessage(frame, readyMessage));
    if (progressive) {
      await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:document", document }), window.location.origin));
      expect(postMessage.mock.calls[0]![0]).toMatchObject({ type: "host:init",
        context: { capabilities: { progressiveAssetLoading: true, assetPersistence: false, entityPersistence: false } } });
      expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-availability", projectAssets: "loading", workspaceCatalog: "loading" });
    } else expect(postMessage).not.toHaveBeenCalled();

    await act(async () => { project.resolve([]); await project.promise; });
    if (progressive) {
      expect(postMessage.mock.calls.at(-2)![0]).toMatchObject({ type: "host:project-assets", projectAssets: [] });
      expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-availability", projectAssets: "ready", workspaceCatalog: "loading" });
    } else expect(postMessage).not.toHaveBeenCalled();
    await act(async () => { personal.resolve([]); entities.resolve([]); await Promise.all([personal.promise, entities.promise]); });
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    const types = postMessage.mock.calls.map(([message]) => message.type);
    expect(types.filter((type) => type === "host:init")).toHaveLength(1);
    expect(types.filter((type) => type === "host:document")).toHaveLength(1);
    if (progressive) {
      expect(types.at(-2)).toBe("host:workspace-asset-catalog");
      expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-availability", projectAssets: "ready", workspaceCatalog: "ready" });
    } else expect(types).not.toContain("host:asset-availability");
    const count = postMessage.mock.calls.length;
    act(() => dispatchProgressiveReady(frame));
    expect(postMessage.mock.calls).toHaveLength(count);
  });

  it("keeps failed catalogs unavailable without sending a writable empty replacement", async () => {
    const project = pendingResult<[]>();
    const personal = pendingResult<[]>();
    const createUploadIntent = vi.fn();
    render(<CanvasHost repository={{ ...repository, getCanvasDocument: vi.fn(async () => document) }}
      mediaAssetRepository={{ listProjectAssets: () => project.promise, listPersonalAssets: () => personal.promise, createUploadIntent } as never}
      entityRepository={{ listPersonal: async () => [] } as never} context={progressiveContext} />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:document" }), window.location.origin));
    await act(async () => { project.reject(new Error("offline")); personal.reject(new Error("offline")); });
    expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-availability", projectAssets: "unavailable", workspaceCatalog: "unavailable" });
    expect(postMessage.mock.calls.some(([message]) => ["host:project-assets", "host:workspace-asset-catalog"].includes(message.type))).toBe(false);
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:document")).toHaveLength(1);
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:create-media-upload", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "unavailable", idempotencyKey: "unavailable", target: "personal",
      mediaKind: "image", displayName: "file.png", contentType: "image/png", byteSize: 42, checksumSha256: "a".repeat(64) }));
    expect(createUploadIntent).not.toHaveBeenCalled();
    expect(postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: "host:asset-command-error", code: "unsupported" });
  });

  it("blocks even project uploads until personal discovery settles, then never replays the initial catalogs", async () => {
    const personal = pendingResult<[]>();
    const asset = { id: "new-asset", workspaceId: "organization-1", objectVersion: 1, mediaKind: "image", displayName: "file.png",
      contentType: "image/png", byteSize: 42, checksumSha256: "a".repeat(64) };
    const projectAsset = { referenceId: "new-reference", assetId: asset.id, assetVersion: 1, mediaKind: asset.mediaKind,
      displayName: asset.displayName, contentType: asset.contentType, byteSize: asset.byteSize, checksumSha256: asset.checksumSha256,
      contentUrl: "/api/workspaces/organization-1/media-assets/new-asset/content" };
    const createUploadIntent = vi.fn(async () => ({ uploadIntent: { id: "upload", expiresAt: "2026-09-08T00:00:00Z" },
      upload: { url: "/api/upload", method: "PUT", headers: {} } }));
    render(<CanvasHost repository={{ ...repository, getCanvasDocument: vi.fn(async () => document) }}
      mediaAssetRepository={{ listProjectAssets: async () => [], listPersonalAssets: () => personal.promise, createUploadIntent,
        finalizeUpload: async () => asset, attachToProject: async () => projectAsset } as never}
      entityRepository={{ listPersonal: async () => [] } as never} context={progressiveContext} />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:project-assets" }), window.location.origin));
    const upload = { source: "reelay-legacy-canvas", type: "canvas:create-media-upload", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "upload", idempotencyKey: "upload", target: "project",
      mediaKind: "image", displayName: "file.png", contentType: "image/png", byteSize: 42, checksumSha256: "a".repeat(64) };
    act(() => dispatchCanvasMessage(frame, upload));
    expect(createUploadIntent).not.toHaveBeenCalled();
    await act(async () => { personal.resolve([]); await personal.promise; });
    act(() => dispatchCanvasMessage(frame, upload));
    await waitFor(() => expect(createUploadIntent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-upload-grant" }), window.location.origin));
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:finalize-media-upload", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "upload", uploadId: "upload" }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:media-upload-result", projectAsset }), window.location.origin));
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:workspace-asset-catalog")).toHaveLength(1);
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:document")).toHaveLength(1);
    act(() => dispatchProgressiveReady(frame, "after-upload"));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog",
      instanceId: "after-upload", assets: [expect.objectContaining({ assetId: "new-asset" })] }), window.location.origin));
  });

  it("delivers an in-flight entity result when project discovery finishes without rebinding its handler", async () => {
    const project = pendingResult<[]>();
    const updateResult = pendingResult<unknown>();
    const update = vi.fn(() => updateResult.promise);
    render(<CanvasHost repository={{ ...repository, getCanvasDocument: vi.fn(async () => document) }}
      mediaAssetRepository={{ listProjectAssets: () => project.promise, listPersonalAssets: async () => [] } as never}
      entityRepository={{ listPersonal: async () => [], update } as never} context={progressiveContext} />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchProgressiveReady(frame));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:workspace-asset-catalog" }), window.location.origin));
    act(() => dispatchCanvasMessage(frame, { source: "reelay-legacy-canvas", type: "canvas:update-entity", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "entity-update", entityId: "entity", expectedVersion: 1,
      name: "主体", description: "", assetIds: ["asset"], coverAssetId: "asset" }));
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => { project.resolve([]); await project.promise; });
    await act(async () => { updateResult.resolve({ id: "entity", name: "主体", description: "", mediaRefs: [{ assetId: "asset", order: 0 }],
      coverAssetId: "asset", version: 2 }); await updateResult.promise; });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:entity-command-result", requestId: "entity-update" }), window.location.origin);
    expect(postMessage.mock.calls.filter(([message]) => message.type === "host:workspace-asset-catalog")).toHaveLength(1);
  });
});

function saveMessage(
  requestId: string,
  instanceId = canvasInstanceId,
  expectedRevision = document.revision,
): unknown {
  return {
    source: "reelay-legacy-canvas",
    type: "canvas:save",
    protocolVersion: 1,
    instanceId,
    requestId,
    schemaVersion: document.schemaVersion,
    expectedRevision,
    content: document.content,
  };
}

const readyMessage = {
  source: "reelay-legacy-canvas",
  type: "canvas:ready",
  protocolVersion: 1,
  instanceId: canvasInstanceId,
};

const dirtyMessage = (dirty: boolean, instanceId = canvasInstanceId) => ({
  source: "reelay-legacy-canvas",
  type: "canvas:dirty",
  protocolVersion: 1,
  instanceId,
  dirty,
});

const navigateMessage = (
  target: "home" | "projects" | "organization" | "logout",
  instanceId = canvasInstanceId,
) => ({
  source: "reelay-legacy-canvas",
  type: "canvas:navigate",
  protocolVersion: 1,
  instanceId,
  target,
});

const openProjectMessage = (projectId: string) => ({
  source: "reelay-legacy-canvas",
  type: "canvas:open-project",
  protocolVersion: 1,
  instanceId: canvasInstanceId,
  projectId,
});

const createProjectMessage = {
  source: "reelay-legacy-canvas",
  type: "canvas:create-project",
  protocolVersion: 1,
  instanceId: canvasInstanceId,
};

describe("CanvasHost", () => {
  it("consumes a launch prompt after initialization without hydrating again or replaying it to a new iframe instance", async () => {
    const consumed = vi.fn();
    function LaunchHost() {
      const [launchPrompt, setLaunchPrompt] = useState("一支香水广告");
      return <CanvasHost repository={repository} context={{ ...editableContext, launchPrompt }}
        onLaunchPromptConsumed={() => { consumed(); setLaunchPrompt(""); }} />;
    }
    render(<LaunchHost />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    consumed.mockImplementation(() => {
      expect(postMessage.mock.calls.at(-1)?.[0]).toMatchObject({ type: "host:document" });
    });
    act(() => dispatchCanvasMessage(frame, readyMessage));
    await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
    expect(postMessage.mock.calls.map(([message]) => message.type)).toEqual(["host:init", "host:document"]);
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "host:init", context: { launchPrompt: "一支香水广告" },
    });

    act(() => dispatchCanvasMessage(frame, readyMessage));
    expect(postMessage).toHaveBeenCalledTimes(2);
    act(() => dispatchCanvasMessage(frame, { ...readyMessage, instanceId: "replacement-instance" }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(4));
    expect(postMessage.mock.calls[2]?.[0]).toMatchObject({ type: "host:init", context: { launchPrompt: "" } });
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it("imports transient bytes once in host scope and ignores completion from a replaced iframe instance", async () => {
    const asset = { id: "memory-1", workspaceId: "organization-1", mediaKind: "image" as const,
      displayName: "memory.png", objectVersion: 1, contentType: "image/png", byteSize: 16,
      checksumSha256: "a".repeat(64), createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
      contentUrl: `blob:${window.location.origin}/memory-1` };
    const projectAsset = { referenceId: "reference-memory", assetId: asset.id, assetVersion: 1,
      mediaKind: asset.mediaKind, displayName: asset.displayName, contentType: asset.contentType,
      byteSize: asset.byteSize, checksumSha256: asset.checksumSha256, contentUrl: asset.contentUrl };
    let complete!: (result: { asset: typeof asset; projectAsset: typeof projectAsset | null }) => void;
    const importFile = vi.fn(() => new Promise<{ asset: typeof asset; projectAsset: typeof projectAsset | null }>((resolve) => { complete = resolve; }));
    const createUploadIntent = vi.fn();
    const mediaAssetRepository = { listProjectAssets: vi.fn(async () => []), createUploadIntent } as never;
    render(<CanvasHost repository={repository} mediaAssetRepository={mediaAssetRepository}
      transientMediaRepository={{ importFile }} context={{ ...editableContext,
        capabilities: { ...editableContext.capabilities, assetPersistence: true, transientMediaUpload: true } }} />);
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchCanvasMessage(frame, readyMessage));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:init",
      context: expect.objectContaining({ capabilities: expect.objectContaining({ transientMediaUpload: true }) }) }), window.location.origin));
    const message = { source: "reelay-legacy-canvas", type: "canvas:import-transient-media", protocolVersion: 1,
      instanceId: canvasInstanceId, requestId: "transient-1", target: "project", mediaKind: "image",
      displayName: "memory.png", contentType: "image/png", body: new ArrayBuffer(16) };
    act(() => { dispatchCanvasMessage(frame, message); dispatchCanvasMessage(frame, message); });
    expect(importFile).toHaveBeenCalledTimes(1);
    expect(importFile).toHaveBeenCalledWith({ workspaceId: "organization-1", projectId: "project-1", target: "project",
      uploadPurpose: "canvas", storageSpace: "personal",
      displayName: "memory.png", contentType: "image/png", mediaKind: "image", body: message.body });
    await act(async () => complete({ asset, projectAsset }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "host:transient-media-result", requestId: "transient-1", projectAsset }), window.location.origin);
    act(() => dispatchCanvasMessage(frame, message));
    expect(importFile).toHaveBeenCalledTimes(1);
    act(() => dispatchCanvasMessage(frame, { ...message, requestId: "transient-2", target: "personal" }));
    act(() => dispatchCanvasMessage(frame, { ...readyMessage, instanceId: "replacement-instance" }));
    await act(async () => complete({ asset, projectAsset: null }));
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "host:transient-media-result", requestId: "transient-2" }), window.location.origin);
    expect(createUploadIntent).not.toHaveBeenCalled();
  });
  it("keeps workspace, project, and canvas identity on the isolated legacy URL", async () => {
    render(
      <CanvasHost
        repository={repository}
        context={{
          ...editableContext,
          workspaceId: "organization 1",
          projectId: "project/1",
          canvasId: "main canvas",
        }}
      />,
    );

    expect(await screen.findByTitle("Reelay 项目画布")).toHaveAttribute(
      "src",
      "/index.html?workspaceId=organization+1&projectId=project%2F1&canvasId=main+canvas",
    );
  });

  it("forwards the explicit development layout tuner flag without leaking other route queries", async () => {
    renderTestingLibrary(
      <MemoryRouter initialEntries={["/w/organization-1/projects/project-1/canvases/main?layoutTune=1&draft=private"]}>
        <CanvasHost repository={repository} context={editableContext} />
      </MemoryRouter>,
    );

    expect(await screen.findByTitle("Reelay 项目画布")).toHaveAttribute(
      "src",
      "/index.html?workspaceId=organization-1&projectId=project-1&canvasId=main&layoutTune=1",
    );
  });

  it("starts the iframe while the document loads and supports retry after failure", async () => {
    let attempt = 0;
    const getCanvasDocument = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("offline");
      return document;
    });
    render(
      <CanvasHost
        repository={{ getCanvasDocument, save: repository.save }}
        context={editableContext}
      />,
    );

    expect(screen.getByTitle("Reelay 项目画布")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法加载此项目画布");
    expect(screen.getByTitle("Reelay 项目画布")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试加载" }));

    expect(await screen.findByTitle("Reelay 项目画布")).toBeInTheDocument();
    expect(getCanvasDocument).toHaveBeenCalledTimes(2);
  });

  it("stops the iframe when the application reports that the canvas is unavailable", async () => {
    const getCanvasDocument = vi.fn(async () => {
      throw new ApplicationError("not_found", "项目不存在或已删除。", {
        serviceCode: "project_not_found",
      });
    });
    render(
      <CanvasHost
        repository={{ getCanvasDocument, save: repository.save }}
        context={editableContext}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("项目已删除或无法访问");
    expect(screen.queryByTitle("Reelay 项目画布")).toBeNull();
  });

  it("does not wait for the document request before mounting the iframe", () => {
    const getCanvasDocument = vi.fn(() => new Promise<CanvasDocument | null>(() => undefined));
    render(
      <CanvasHost
        repository={{ getCanvasDocument, save: repository.save }}
        context={editableContext}
      />,
    );

    expect(screen.getByTitle("Reelay 项目画布")).toBeInTheDocument();
    expect(screen.getByText("正在加载项目画布…")).toBeInTheDocument();
    expect(getCanvasDocument).toHaveBeenCalledWith("project-1", "main");
  });

  it("initializes each iframe instance exactly once when ready is repeated", async () => {
    const getCanvasDocument = vi.fn(async () => document);
    render(
      <CanvasHost
        repository={{ getCanvasDocument, save: repository.save }}
        context={{ ...editableContext, theme: "dark", writable: false }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:init",
        context: { ...editableContext, theme: "dark", writable: false },
      },
      window.location.origin,
    ));
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:document",
        protocolVersion: 1,
        document,
        writable: false,
      },
      window.location.origin,
    );
    expect(getCanvasDocument).toHaveBeenCalledWith("project-1", "main");
    expect(postMessage).toHaveBeenCalledTimes(2);

    act(() => dispatchCanvasMessage(frame, readyMessage));
    expect(postMessage).toHaveBeenCalledTimes(2);

    act(() => dispatchCanvasMessage(frame, {
      ...readyMessage,
      instanceId: "canvas-instance-2",
    }));
    expect(postMessage).toHaveBeenCalledTimes(4);

    act(() => dispatchCanvasMessage(frame, readyMessage));
    expect(postMessage).toHaveBeenCalledTimes(4);
  });

  it("downgrades asset persistence when project asset discovery fails without blocking the canvas", async () => {
    const mediaAssetRepository = {
      listProjectAssets: vi.fn(async () => { throw new ApplicationError("not_found", "missing"); }),
    } as never;
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        mediaAssetRepository={mediaAssetRepository}
        context={{
          ...editableContext,
          capabilities: { ...editableContext.capabilities, assetPersistence: true },
        }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:init",
        context: expect.objectContaining({
          capabilities: expect.objectContaining({ assetPersistence: false }),
        }),
      }),
      window.location.origin,
    ));
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document", document }),
      window.location.origin,
    );
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:project-assets" }),
      window.location.origin,
    );
  });

  it("uses host workspace and project scope for upload finalize and explicit attach", async () => {
    const projectAsset = {
      referenceId: "reference-1",
      assetId: "asset-1",
      assetVersion: 1,
      mediaKind: "image" as const,
      displayName: "cover.png",
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "a".repeat(64),
      contentUrl: "/api/assets/asset-1/content",
    };
    const createUploadIntent = vi.fn(async () => ({
      uploadIntent: { id: "upload-1", expiresAt: "2026-08-31T12:00:00.000Z" },
      upload: { url: "/api/uploads/upload-1", method: "PUT" as const, headers: {} },
    }));
    const finalizeUpload = vi.fn(async () => ({ id: "asset-1" }));
    const attachToProject = vi.fn(async () => projectAsset);
    const mediaAssetRepository = {
      listProjectAssets: vi.fn(async () => [projectAsset]),
      createUploadIntent,
      finalizeUpload,
      attachToProject,
    } as never;
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        mediaAssetRepository={mediaAssetRepository}
        context={{
          ...editableContext,
          capabilities: { ...editableContext.capabilities, assetPersistence: true },
        }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:project-assets", projectAssets: [projectAsset] }),
      window.location.origin,
    ));
    dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:create-media-upload",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: "request-1",
      idempotencyKey: "attempt-1",
      mediaKind: "image",
      displayName: "cover.png",
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "a".repeat(64),
    });
    await waitFor(() => expect(createUploadIntent).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "organization-1",
      idempotencyKey: "attempt-1",
      uploadPurpose: "canvas",
      projectId: "project-1",
    })));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:media-upload-grant", requestId: "request-1" }),
      window.location.origin,
    ));
    dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:finalize-media-upload",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: "request-1",
      uploadId: "upload-1",
    });
    await waitFor(() => expect(finalizeUpload).toHaveBeenCalledWith("organization-1", "upload-1"));
    expect(attachToProject).toHaveBeenCalledWith("project-1", "asset-1");
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:media-upload-result", requestId: "request-1", projectAsset }),
      window.location.origin,
    ));
  });

  it("finalizes personal-only uploads without creating a project reference", async () => {
    const finalizedAsset = {
      id: "asset-personal",
      workspaceId: "organization-1",
      mediaKind: "image" as const,
      displayName: "portrait.png",
      objectVersion: 1,
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "b".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const createUploadIntent = vi.fn(async () => ({
      uploadIntent: { id: "upload-personal", expiresAt: "2026-08-31T12:00:00.000Z", status: "finalized" as const },
      upload: { url: "/api/uploads/upload-personal", method: "PUT" as const, headers: {} },
    }));
    const finalizeUpload = vi.fn(async () => finalizedAsset);
    const attachToProject = vi.fn();
    const mediaAssetRepository = {
      listProjectAssets: vi.fn(async () => []),
      createUploadIntent,
      finalizeUpload,
      attachToProject,
    } as never;
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        mediaAssetRepository={mediaAssetRepository}
        context={{
          ...editableContext,
          capabilities: { ...editableContext.capabilities, assetPersistence: true },
        }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:init" }),
      window.location.origin,
    ));
    dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:create-media-upload",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: "request-personal",
      idempotencyKey: "attempt-personal",
      target: "personal",
      uploadPurpose: "library",
      storageSpace: "organization",
      mediaKind: "image",
      displayName: "portrait.png",
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "b".repeat(64),
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:media-upload-grant", requestId: "request-personal",
        uploadIntent: expect.objectContaining({ status: "finalized" }) }),
      window.location.origin,
    ));
    expect(createUploadIntent).toHaveBeenCalledWith(expect.objectContaining({ uploadPurpose: "library", storageSpace: "organization" }));
    expect(createUploadIntent).not.toHaveBeenCalledWith(expect.objectContaining({ projectId: expect.anything() }));
    dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:finalize-media-upload",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: "request-personal",
      uploadId: "upload-personal",
    });
    await waitFor(() => expect(finalizeUpload).toHaveBeenCalledWith("organization-1", "upload-personal"));
    expect(attachToProject).not.toHaveBeenCalled();
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:media-upload-result",
        requestId: "request-personal",
        target: "personal",
        workspaceAsset: expect.objectContaining({ assetId: "asset-personal", createdAt: finalizedAsset.createdAt }),
      }),
      window.location.origin,
    ));
  });

  it("renames the personal placement while preserving project source names", async () => {
    const projectAsset = {
      referenceId: "reference-rename",
      assetId: "asset-rename",
      assetVersion: 1,
      mediaKind: "image" as const,
      displayName: "before.png",
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "c".repeat(64),
      contentUrl: "/api/assets/asset-rename/content",
    };
    const personalAsset = {
      id: "asset-rename",
      workspaceId: "organization-1",
      mediaKind: "image" as const,
      displayName: "before.png",
      objectVersion: 1,
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "c".repeat(64),
      contentUrl: "/api/workspaces/organization-1/media-assets/asset-rename/content",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const renamedAsset = {
      id: "asset-rename",
      workspaceId: "organization-1",
      mediaKind: "image" as const,
      displayName: "after.png",
      objectVersion: 1,
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "c".repeat(64),
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
      contentUrl: "blob:http://localhost/renamed-file",
    };
    let resolveRename!: (asset: typeof renamedAsset) => void;
    const renamePersonalAsset = vi.fn(() => new Promise<typeof renamedAsset>((resolve) => {
      resolveRename = resolve;
    }));
    const mediaAssetRepository = {
      listPersonalAssets: vi.fn(async () => [personalAsset]),
      listProjectAssets: vi.fn(async () => [projectAsset]),
      renamePersonalAsset,
    } as never;
    const entityRepository = { listPersonal: vi.fn(async () => []) } as never;
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        entityRepository={entityRepository}
        mediaAssetRepository={mediaAssetRepository}
        context={{
          ...editableContext,
          capabilities: {
            ...editableContext.capabilities,
            assetPersistence: true,
            entityPersistence: true,
          },
        }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:workspace-asset-catalog",
        assets: [expect.objectContaining({ assetId: "asset-rename", displayName: "before.png", createdAt: personalAsset.createdAt })],
      }),
      window.location.origin,
    ));

    const renameMessage = {
      source: "reelay-legacy-canvas",
      type: "canvas:rename-media",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: "media-rename-1",
      assetId: "asset-rename",
      displayName: "after.png",
    };
    dispatchCanvasMessage(frame, renameMessage);
    await waitFor(() => expect(renamePersonalAsset).toHaveBeenCalledWith(
      "organization-1",
      "asset-rename",
      "after.png",
    ));
    dispatchCanvasMessage(frame, renameMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:asset-command-error",
        requestId: "media-rename-1",
        code: "invalid",
      }),
      window.location.origin,
    ));
    expect(renamePersonalAsset).toHaveBeenCalledTimes(1);

    resolveRename(renamedAsset);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:media-rename-result",
        requestId: "media-rename-1",
        workspaceAsset: expect.objectContaining({ assetId: "asset-rename", displayName: "after.png", createdAt: personalAsset.createdAt }),
      }),
      window.location.origin,
    ));

    postMessage.mockClear();
    dispatchCanvasMessage(frame, { ...readyMessage, instanceId: "canvas-instance-2" });
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:project-assets",
        instanceId: "canvas-instance-2",
        projectAssets: [expect.objectContaining({ assetId: "asset-rename", displayName: "before.png" })],
      }),
      window.location.origin,
    ));
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:workspace-asset-catalog",
        instanceId: "canvas-instance-2",
        assets: [expect.objectContaining({ assetId: "asset-rename", displayName: "after.png", createdAt: personalAsset.createdAt })],
      }),
      window.location.origin,
    );
  });

  it.each([
    { label: "missing capability", assetPersistence: false, writable: true, code: "unsupported" },
    { label: "read-only access", assetPersistence: true, writable: false, code: "forbidden" },
  ] as const)("rejects Media rename for $label", async ({ assetPersistence, writable, code }) => {
    const renamePersonalAsset = vi.fn();
    const mediaAssetRepository = {
      listProjectAssets: vi.fn(async () => []),
      renamePersonalAsset,
    } as never;
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        mediaAssetRepository={mediaAssetRepository}
        context={{
          ...editableContext,
          writable,
          capabilities: { ...editableContext.capabilities, assetPersistence },
        }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:init" }),
      window.location.origin,
    ));
    dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:rename-media",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: `rename-${code}`,
      assetId: "asset-rename",
      displayName: "after.png",
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:asset-command-error",
        requestId: `rename-${code}`,
        code,
      }),
      window.location.origin,
    ));
    expect(renamePersonalAsset).not.toHaveBeenCalled();
  });

  it("loads the personal Entity catalog and scopes create/update commands through the host", async () => {
    const personalAsset = {
      id: "asset-front",
      workspaceId: "organization-1",
      mediaKind: "image" as const,
      displayName: "front.png",
      objectVersion: 1,
      contentType: "image/png",
      byteSize: 42,
      checksumSha256: "a".repeat(64),
      contentUrl: "/api/workspaces/organization-1/media-assets/asset-front/content",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const entity = {
      id: "entity-lirael",
      libraryTagIds: ["builtin:character"],
      workspaceId: "organization-1",
      name: "莉瑞尔",
      description: "精灵感角色",
      mediaRefs: [{ assetId: "asset-front", order: 0 }],
      coverAssetId: "asset-front",
      version: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const create = vi.fn(async () => entity);
    const update = vi.fn(async () => {
      throw new ApplicationError("conflict", "stale entity", { serviceCode: "entity_version_conflict" });
    });
    const entityRepository = {
      create,
      update,
      listPersonal: vi.fn(async () => [entity]),
    } as never;
    const mediaAssetRepository = {
      listPersonalAssets: vi.fn(async () => [personalAsset]),
      listProjectAssets: vi.fn(async () => []),
    } as never;
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        entityRepository={entityRepository}
        mediaAssetRepository={mediaAssetRepository}
        context={{
          ...editableContext,
          capabilities: {
            ...editableContext.capabilities,
            assetPersistence: true,
            entityPersistence: true,
          },
        }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, readyMessage);

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:init",
        context: expect.objectContaining({
          capabilities: expect.objectContaining({ assetPersistence: true, entityPersistence: true }),
        }),
      }),
      window.location.origin,
    ));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:workspace-asset-catalog",
        assets: [expect.objectContaining({ assetId: "asset-front", assetVersion: 1 })],
        entities: [expect.objectContaining({ id: "entity-lirael", coverAssetId: "asset-front" })],
      }),
      window.location.origin,
    ));

    dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:create-entity",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: "entity-create-1",
      idempotencyKey: "create-lirael-1",
      tagIds: ["builtin:character"],
      name: "莉瑞尔",
      description: "精灵感角色",
      assetIds: ["asset-front"],
      coverAssetId: "asset-front",
    });
    await waitFor(() => expect(create).toHaveBeenCalledWith({
      workspaceId: "organization-1",
      idempotencyKey: "create-lirael-1",
      tagIds: ["builtin:character"],
      name: "莉瑞尔",
      description: "精灵感角色",
      assetIds: ["asset-front"],
      coverAssetId: "asset-front",
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:entity-command-result",
        requestId: "entity-create-1",
        entity: expect.objectContaining({ id: "entity-lirael", version: 1, libraryTagIds: ["builtin:character"] }),
      }),
      window.location.origin,
    ));

    dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:update-entity",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      requestId: "entity-update-stale",
      entityId: "entity-lirael",
      expectedVersion: 1,
      tagIds: [],
      expectedTagIds: ["builtin:character"],
      name: "莉瑞尔新版",
      description: "",
      assetIds: ["asset-front"],
      coverAssetId: null,
    });
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "organization-1",
      entityId: "entity-lirael",
      expectedVersion: 1,
      tagIds: [],
      expectedTagIds: ["builtin:character"],
    })));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:asset-command-error",
        requestId: "entity-update-stale",
        code: "conflict",
      }),
      window.location.origin,
    ));
  });

  it("ignores ready and save messages from the wrong origin or window", async () => {
    const save = vi.fn(async () => document);
    const getCanvasDocument = vi.fn(async () => document);
    render(
      <CanvasHost
        repository={{ getCanvasDocument, save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    await waitFor(() => expect(getCanvasDocument).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        data: readyMessage,
        origin: "https://attacker.example",
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent("message", {
        data: readyMessage,
        origin: window.location.origin,
        source: window,
      }));
      window.dispatchEvent(new MessageEvent("message", {
        data: saveMessage("wrong-origin"),
        origin: "https://attacker.example",
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent("message", {
        data: saveMessage("wrong-source"),
        origin: window.location.origin,
        source: window,
      }));
    });

    expect(postMessage).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves opaque content within the route scope and returns the new revision", async () => {
    const savedDocument = { ...document, revision: 3 };
    const save = vi.fn(async () => savedDocument);
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, saveMessage("save-1"));

    await waitFor(() => expect(save).toHaveBeenCalledWith({
      projectId: "project-1",
      canvasId: "main",
      schemaVersion: 1,
      expectedRevision: 2,
      content: document.content,
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:save-result",
        protocolVersion: 1,
        requestId: "save-1",
        document: savedDocument,
      },
      window.location.origin,
    ));
  });

  it.each([false, true])("waits for an old same-route save before hydrating a new iframe instance (progressive: %s)", async (progressive) => {
    const replacementInstanceId = "canvas-instance-2";
    const savedDocument = { ...document, revision: 3 };
    let resolveOldSave: (value: typeof savedDocument) => void = () => undefined;
    const save = vi.fn(() => new Promise<typeof savedDocument>((resolve) => {
      resolveOldSave = resolve;
    }));
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => progressive ? dispatchProgressiveReady(frame) : dispatchCanvasMessage(frame, readyMessage));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document", document }),
      window.location.origin,
    ));

    act(() => dispatchCanvasMessage(frame, saveMessage("save-before-reload")));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saving");

    act(() => progressive ? dispatchProgressiveReady(frame, replacementInstanceId) : dispatchCanvasMessage(frame, {
      ...readyMessage,
      instanceId: replacementInstanceId,
    }));
    expect(postMessage.mock.calls.filter(([message]) => (
      (message as { type?: string }).type === "host:document"
    ))).toHaveLength(1);

    await act(async () => resolveOldSave(savedDocument));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document", document: savedDocument }),
      window.location.origin,
    ));
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:save-result", requestId: "save-before-reload" }),
      window.location.origin,
    );
    expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved");
    if (progressive) expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:asset-availability", instanceId: replacementInstanceId,
    }), window.location.origin);

    act(() => {
      dispatchCanvasMessage(frame, dirtyMessage(false, replacementInstanceId));
      dispatchCanvasMessage(frame, navigateMessage("home", replacementInstanceId));
    });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/w/organization-1"));
  });

  it.each([false, true])("refetches the authoritative document before replacing an iframe after an old save error (progressive: %s)", async (progressive) => {
    const replacementInstanceId = "canvas-instance-2";
    const refreshedDocument = { ...document, revision: 4, content: { refreshed: true } };
    let rejectOldSave: (reason: unknown) => void = () => undefined;
    const save = vi.fn(() => new Promise<typeof document>((_resolve, reject) => {
      rejectOldSave = reject;
    }));
    const getCanvasDocument = vi.fn()
      .mockResolvedValueOnce(document)
      .mockResolvedValueOnce(refreshedDocument);
    render(
      <CanvasHost
        repository={{ getCanvasDocument, save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => progressive ? dispatchProgressiveReady(frame) : dispatchCanvasMessage(frame, readyMessage));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document", document }),
      window.location.origin,
    ));
    act(() => dispatchCanvasMessage(frame, saveMessage("save-that-conflicts")));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    act(() => progressive ? dispatchProgressiveReady(frame, replacementInstanceId) : dispatchCanvasMessage(frame, {
      ...readyMessage,
      instanceId: replacementInstanceId,
    }));
    expect(postMessage.mock.calls.filter(([message]) => (
      (message as { type?: string }).type === "host:document"
    ))).toHaveLength(1);
    await act(async () => rejectOldSave(new ApplicationError("conflict", "Rejected")));

    await waitFor(() => expect(getCanvasDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document", document: refreshedDocument }),
      window.location.origin,
    ));
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:save-error", requestId: "save-that-conflicts" }),
      window.location.origin,
    );
    expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved");
    if (progressive) expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "host:asset-availability", instanceId: replacementInstanceId,
    }), window.location.origin);
  });

  it("does not deliver an old scope save completion to a replacement iframe", async () => {
    const documentB = {
      ...document,
      projectId: "project-2",
      revision: 7,
      content: { scope: "project-2" },
    };
    let resolveOldSave: (value: typeof document) => void = () => undefined;
    const save = vi.fn(() => new Promise<typeof document>((resolve) => {
      resolveOldSave = resolve;
    }));
    const getCanvasDocument = vi.fn(async (projectId: string) => (
      projectId === "project-2" ? documentB : document
    ));
    const view = render(
      <CanvasHost
        repository={{ getCanvasDocument, save }}
        context={editableContext}
      />,
    );
    const frameA = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    dispatchCanvasMessage(frameA, saveMessage("save-project-a"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    const contextB = {
      ...editableContext,
      projectId: "project-2",
      projectName: "第二个项目",
    };
    view.rerender(routed(
      <CanvasHost
        repository={{ getCanvasDocument, save }}
        context={contextB}
      />,
    ));
    const frameB = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    expect(frameB).not.toBe(frameA);
    await waitFor(() => expect(getCanvasDocument).toHaveBeenCalledWith("project-2", "main"));
    const postMessageB = vi.spyOn(frameB.contentWindow!, "postMessage");

    await act(async () => resolveOldSave({ ...document, revision: 3 }));

    expect(postMessageB).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:save-result",
        requestId: "save-project-a",
      }),
      window.location.origin,
    );
    expect(frameB.closest("section")).toHaveAttribute("data-persistence-status", "saved");
  });

  it.each([
    ["conflict", "conflict"],
    ["forbidden", "forbidden"],
  ] as const)("maps application %s saves to a %s bridge error", async (applicationCode, code) => {
    const save = vi.fn(async () => {
      throw new ApplicationError(applicationCode, "Rejected", {
        serviceCode: "save_rejected",
      });
    });
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, saveMessage(`save-${applicationCode}`));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:save-error",
        protocolVersion: 1,
        requestId: `save-${applicationCode}`,
        code,
      },
      window.location.origin,
    ));
  });

  it("stops the iframe after a deleted project rejects an in-flight save", async () => {
    const save = vi.fn(async () => {
      throw new ApplicationError("not_found", "项目不存在或已删除。", {
        serviceCode: "project_not_found",
      });
    });
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, saveMessage("save-after-delete"));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:save-error",
        protocolVersion: 1,
        requestId: "save-after-delete",
        code: "missing",
      },
      window.location.origin,
    ));
    expect(await screen.findByRole("alert")).toHaveTextContent("项目已删除或无法访问");
    expect(screen.queryByTitle("Reelay 项目画布")).toBeNull();
  });

  it("rejects save requests locally when loader-derived access is read-only", async () => {
    const save = vi.fn();
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={{ ...editableContext, writable: false }}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, saveMessage("save-readonly"));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:save-error",
        protocolVersion: 1,
        requestId: "save-readonly",
        code: "forbidden",
      },
      window.location.origin,
    ));
    expect(save).not.toHaveBeenCalled();
  });

  it("tracks dirty state, requests an early flush when hidden, and warns before unloading", async () => {
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const host = frame.closest("section");
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");

    act(() => dispatchCanvasMessage(frame, dirtyMessage(true)));
    expect(host).toHaveAttribute("data-persistence-status", "dirty");

    const visibilityDescriptor = Object.getOwnPropertyDescriptor(globalThis.document, "visibilityState");
    Object.defineProperty(globalThis.document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => globalThis.document.dispatchEvent(new Event("visibilitychange")));
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:flush",
        protocolVersion: 1,
      },
      window.location.origin,
    );

    const dirtyUnload = new Event("beforeunload", { cancelable: true });
    act(() => window.dispatchEvent(dirtyUnload));
    expect(dirtyUnload.defaultPrevented).toBe(true);

    act(() => dispatchCanvasMessage(frame, dirtyMessage(false)));
    expect(host).toHaveAttribute("data-persistence-status", "saved");
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    act(() => window.dispatchEvent(cleanUnload));
    expect(cleanUnload.defaultPrevented).toBe(false);

    if (visibilityDescriptor) {
      Object.defineProperty(globalThis.document, "visibilityState", visibilityDescriptor);
    } else {
      Reflect.deleteProperty(globalThis.document, "visibilityState");
    }
  });

  it("waits for the current save to settle before React navigation", async () => {
    let resolveSave: (value: typeof document) => void = () => undefined;
    const save = vi.fn(() => new Promise<typeof document>((resolve) => {
      resolveSave = resolve;
    }));
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    await waitFor(() => expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved"));

    act(() => {
      dispatchCanvasMessage(frame, dirtyMessage(true));
      dispatchCanvasMessage(frame, navigateMessage("home"));
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/w/organization-1/projects/project-1/canvases/main");
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:flush",
        protocolVersion: 1,
      },
      window.location.origin,
    );

    act(() => dispatchCanvasMessage(frame, saveMessage("save-before-navigation")));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saving");
    await act(async () => resolveSave({ ...document, revision: 3 }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "host:save-result",
        requestId: "save-before-navigation",
      }),
      window.location.origin,
    ));
    expect(screen.getByTestId("location")).toHaveTextContent("/w/organization-1/projects/project-1/canvases/main");

    act(() => dispatchCanvasMessage(frame, dirtyMessage(false)));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/w/organization-1"));
  });

  it("hands a clean logout request back to the routed application", async () => {
    const onLogout = vi.fn();
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        context={editableContext}
        onLogout={onLogout}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;

    act(() => dispatchCanvasMessage(frame, navigateMessage("logout")));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it.each(["logout", "create-project"] as const)("defers %s until both dirty content and active saves settle, once", async (target) => {
    const saved = pendingResult<typeof document>();
    const onNavigate = vi.fn();
    render(<CanvasHost
      repository={{ getCanvasDocument: vi.fn(async () => document), save: vi.fn(() => saved.promise) }}
      context={editableContext}
      onLogout={onNavigate}
      onCreateProject={onNavigate}
    />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    await waitFor(() => expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved"));
    act(() => {
      dispatchCanvasMessage(frame, dirtyMessage(true));
      dispatchCanvasMessage(frame, saveMessage("save-before-side-effect"));
      dispatchCanvasMessage(frame, target === "logout" ? navigateMessage("logout") : createProjectMessage);
      dispatchCanvasMessage(frame, dirtyMessage(false));
    });
    expect(onNavigate).not.toHaveBeenCalled();
    await act(async () => saved.resolve({ ...document, revision: 3 }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    act(() => dispatchCanvasMessage(frame, dirtyMessage(false)));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("expires pending navigation without executing it after a late save", async () => {
    const saved = pendingResult<typeof document>();
    const onLogout = vi.fn();
    render(<CanvasHost
      repository={{ getCanvasDocument: vi.fn(async () => document), save: vi.fn(() => saved.promise) }}
      context={editableContext} onLogout={onLogout}
    />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    await waitFor(() => expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved"));
    vi.useFakeTimers();
    try {
      act(() => {
        dispatchCanvasMessage(frame, dirtyMessage(true));
        dispatchCanvasMessage(frame, saveMessage("late-save"));
        dispatchCanvasMessage(frame, navigateMessage("logout"));
        vi.advanceTimersByTime(9_999);
      });
      expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saving");
      act(() => vi.advanceTimersByTime(1));
      expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "error");
      await act(async () => saved.resolve({ ...document, revision: 3 }));
      act(() => dispatchCanvasMessage(frame, dirtyMessage(false)));
      expect(onLogout).not.toHaveBeenCalled();
      act(() => dispatchCanvasMessage(frame, navigateMessage("logout")));
      expect(onLogout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["document", "iframe"] as const)("drops queued navigation when the %s owner is replaced", async (replacement) => {
    const saved = pendingResult<typeof document>();
    const onLogout = vi.fn();
    const scopedRepository = {
      getCanvasDocument: vi.fn(async (projectId: string) => ({ ...document, projectId })),
      save: vi.fn(() => saved.promise),
    };
    const view = render(<CanvasHost repository={scopedRepository} context={editableContext} onLogout={onLogout} />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    await waitFor(() => expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved"));
    act(() => {
      dispatchCanvasMessage(frame, dirtyMessage(true));
      dispatchCanvasMessage(frame, saveMessage("old-owner-save"));
      dispatchCanvasMessage(frame, navigateMessage("logout"));
    });
    if (replacement === "document") {
      view.rerender(routed(<CanvasHost repository={scopedRepository}
        context={{ ...editableContext, projectId: "project-2" }} onLogout={onLogout} />));
    }
    const currentFrame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    act(() => dispatchCanvasMessage(currentFrame, { ...readyMessage, instanceId: "replacement-navigation-owner" }));
    await act(async () => saved.resolve({ ...document, revision: 3 }));
    act(() => dispatchCanvasMessage(currentFrame, dirtyMessage(false, "replacement-navigation-owner")));
    expect(onLogout).not.toHaveBeenCalled();
    act(() => dispatchCanvasMessage(currentFrame, navigateMessage("logout", "replacement-navigation-owner")));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("clears the pending navigation deadline when the host unmounts", async () => {
    const onLogout = vi.fn();
    const view = render(<CanvasHost
      repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
      context={editableContext} onLogout={onLogout}
    />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    await waitFor(() => expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved"));
    const schedule = vi.spyOn(window, "setTimeout");
    const clear = vi.spyOn(window, "clearTimeout");
    try {
      act(() => {
        dispatchCanvasMessage(frame, dirtyMessage(true));
        dispatchCanvasMessage(frame, navigateMessage("logout"));
      });
      const deadlineIndex = schedule.mock.calls.findIndex(([, delay]) => delay === 10_000);
      expect(deadlineIndex).toBeGreaterThanOrEqual(0);
      const deadline = schedule.mock.results[deadlineIndex].value;
      view.unmount();
      expect(clear).toHaveBeenCalledWith(deadline);
      expect(onLogout).not.toHaveBeenCalled();
    } finally {
      schedule.mockRestore();
      clear.mockRestore();
    }
  });

  it("opens only authorized projected projects and delegates project creation", async () => {
    const onCreateProject = vi.fn();
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        context={editableContext}
        onCreateProject={onCreateProject}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;

    act(() => dispatchCanvasMessage(frame, openProjectMessage("project-outside-scope")));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/w/organization-1/projects/project-1/canvases/main",
    );

    act(() => dispatchCanvasMessage(frame, openProjectMessage("project-2")));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/w/organization-1/projects/project-2/canvases/main",
    );

    act(() => dispatchCanvasMessage(frame, createProjectMessage));
    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });

  it("opens organization center with the current canvas recorded as its return target", async () => {
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        context={editableContext}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;
    await waitFor(() => expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved"));

    act(() => dispatchCanvasMessage(frame, navigateMessage("organization")));

    expect(screen.getByTestId("location")).toHaveTextContent("/w/organization-1/organization");
    expect(screen.getByTestId("organization-return-to")).toHaveTextContent(
      "/w/organization-1/projects/project-1/canvases/main",
    );
  });

  it("hands explicit and legacy-default account sections to the routed dialog", async () => {
    const onOpenAccountSettings = vi.fn();
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save: repository.save }}
        context={editableContext}
        onOpenAccountSettings={onOpenAccountSettings}
      />,
    );
    const frame = await screen.findByTitle("Reelay 项目画布") as HTMLIFrameElement;

    act(() => dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
      section: "credits",
    }));

    expect(onOpenAccountSettings).toHaveBeenLastCalledWith("credits");

    act(() => dispatchCanvasMessage(frame, {
      source: "reelay-legacy-canvas",
      type: "canvas:open-account",
      protocolVersion: 1,
      instanceId: canvasInstanceId,
    }));

    expect(onOpenAccountSettings).toHaveBeenNthCalledWith(2, "profile");
  });

  it.each([true, false])("updates the routed theme without reloading or saving the canvas when writable=%s", async (writable) => {
    const getCanvasDocument = vi.fn(async () => document);
    const save = vi.fn();
    const themeRepository = { getCanvasDocument, save };
    const onThemeChange = vi.fn();
    function RoutedThemeHost() {
      const [theme, setTheme] = useState<"light" | "dark">("light");
      return <CanvasHost
        repository={themeRepository}
        context={{ ...editableContext, theme, writable }}
        onThemeChange={(nextTheme) => {
          onThemeChange(nextTheme);
          setTheme(nextTheme);
        }}
      />;
    }
    render(<RoutedThemeHost />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    act(() => dispatchCanvasMessage(frame, readyMessage));
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document" }), window.location.origin,
    ));
    postMessage.mockClear();

    for (const theme of ["dark", "light"] as const) {
      act(() => dispatchCanvasMessage(frame, {
        source: "reelay-legacy-canvas", type: "canvas:theme-change", protocolVersion: 1,
        instanceId: canvasInstanceId, theme,
      }));
      expect(onThemeChange).toHaveBeenLastCalledWith(theme);
      expect(screen.getByTitle("Reelay 项目画布")).toBe(frame);
      expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved");
    }
    expect(onThemeChange).toHaveBeenCalledTimes(2);
    expect(getCanvasDocument).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("ignores foreign, invalid, not-ready, and stale-instance theme changes", async () => {
    const onThemeChange = vi.fn();
    const getCanvasDocument = vi.fn(async () => document);
    const save = vi.fn();
    render(<CanvasHost
      repository={{ getCanvasDocument, save }}
      context={editableContext}
      onThemeChange={onThemeChange}
    />);
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const message = {
      source: "reelay-legacy-canvas", type: "canvas:theme-change", protocolVersion: 1,
      instanceId: canvasInstanceId, theme: "dark",
    };
    const send = (data: unknown, origin = window.location.origin, source: MessageEventSource | null = frame.contentWindow) => {
      window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
    };
    act(() => send(message));
    expect(onThemeChange).not.toHaveBeenCalled();
    act(() => send(readyMessage));
    await waitFor(() => expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saved"));

    act(() => {
      send(message, "https://foreign.example");
      send(message, window.location.origin, window);
      send({ ...message, source: "foreign" });
      send({ ...message, theme: "system" });
      send({ ...message, protocolVersion: 2 });
      send({ ...readyMessage, instanceId: "canvas-instance-2" });
      send(message);
    });
    expect(onThemeChange).not.toHaveBeenCalled();
    act(() => send({ ...message, instanceId: "canvas-instance-2", theme: "light" }));
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith("light");
    expect(getCanvasDocument).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
