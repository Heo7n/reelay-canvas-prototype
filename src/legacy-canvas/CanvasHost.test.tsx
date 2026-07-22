// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "../infrastructure/http/HttpApiClient";
import { CanvasHost } from "./CanvasHost";

afterEach(cleanup);

const document = {
  id: "main",
  projectId: "project-1",
  schemaVersion: 1,
  revision: 2,
  content: { opaque: true },
};

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
  workspaceId: "organization-1",
  projectId: "project-1",
  projectName: "品牌故事",
  canvasId: "main",
  theme: "light" as const,
  writable: true,
};

function dispatchCanvasMessage(frame: HTMLIFrameElement, data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", {
    data,
    origin: window.location.origin,
    source: frame.contentWindow,
  }));
}

function saveMessage(requestId: string): unknown {
  return {
    source: "reelay-legacy-canvas",
    type: "canvas:save",
    protocolVersion: 1,
    requestId,
    schemaVersion: document.schemaVersion,
    expectedRevision: document.revision,
    content: document.content,
  };
}

describe("CanvasHost", () => {
  it("keeps workspace, project, and canvas identity on the isolated legacy URL", () => {
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

    expect(screen.getByTitle("Reelay 项目画布")).toHaveAttribute(
      "src",
      "/index.html?workspaceId=organization+1&projectId=project%2F1&canvasId=main+canvas",
    );
  });

  it("loads the scoped document and sends context plus document after iframe load", async () => {
    const getCanvasDocument = vi.fn(async () => document);
    render(
      <CanvasHost
        repository={{ getCanvasDocument, save: repository.save }}
        context={{ ...editableContext, theme: "dark", writable: false }}
      />,
    );
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    fireEvent.load(frame);

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
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
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

  it.each([
    [409, "conflict"],
    [403, "forbidden"],
  ] as const)("maps HTTP %s saves to a %s bridge error", async (status, code) => {
    const save = vi.fn(async () => {
      throw new HttpRequestError(status, "save_rejected", "Rejected");
    });
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={editableContext}
      />,
    );
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow!, "postMessage");
    dispatchCanvasMessage(frame, saveMessage(`save-${status}`));

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        source: "reelay-shell",
        type: "host:save-error",
        protocolVersion: 1,
        requestId: `save-${status}`,
        code,
      },
      window.location.origin,
    ));
  });

  it("rejects save requests locally when loader-derived access is read-only", async () => {
    const save = vi.fn();
    render(
      <CanvasHost
        repository={{ getCanvasDocument: vi.fn(async () => document), save }}
        context={{ ...editableContext, writable: false }}
      />,
    );
    const frame = screen.getByTitle("Reelay 项目画布") as HTMLIFrameElement;
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
});
