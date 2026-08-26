// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "../application/shared/ApplicationError";
import type { CanvasDocument } from "../domain/canvas/canvas-document";
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
  workspaceId: "organization-1",
  projectId: "project-1",
  projectName: "品牌故事",
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

describe("CanvasHost", () => {
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

  it("waits for an old same-route save before hydrating a new iframe instance", async () => {
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
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document", document }),
      window.location.origin,
    ));

    act(() => dispatchCanvasMessage(frame, saveMessage("save-before-reload")));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(frame.closest("section")).toHaveAttribute("data-persistence-status", "saving");

    act(() => dispatchCanvasMessage(frame, {
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

    act(() => {
      dispatchCanvasMessage(frame, dirtyMessage(false, replacementInstanceId));
      dispatchCanvasMessage(frame, navigateMessage("home", replacementInstanceId));
    });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/w/organization-1"));
  });

  it("refetches the authoritative document before replacing an iframe after an old save error", async () => {
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
    dispatchCanvasMessage(frame, readyMessage);
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "host:document", document }),
      window.location.origin,
    ));
    act(() => dispatchCanvasMessage(frame, saveMessage("save-that-conflicts")));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    act(() => dispatchCanvasMessage(frame, {
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

  it("hands the legacy account action to the routed account dialog", async () => {
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
    }));

    expect(onOpenAccountSettings).toHaveBeenCalledTimes(1);
  });
});
