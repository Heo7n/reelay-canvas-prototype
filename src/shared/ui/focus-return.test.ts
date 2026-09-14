// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureFocusReturn } from "./focus-return";

afterEach(() => document.body.replaceChildren());

describe("dialog focus return", () => {
  it("restores the same-origin iframe control rather than only its outer frame", () => {
    const frame = document.createElement("iframe");
    const dialogButton = document.createElement("button");
    document.body.append(frame, dialogButton);
    const inside = frame.contentDocument!.createElement("button");
    frame.contentDocument!.body.append(inside);
    inside.focus();
    expect(document.activeElement).toBe(frame);
    const restore = captureFocusReturn();
    dialogButton.focus();
    const focus = vi.spyOn(inside, "focus");
    restore();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(frame.contentDocument!.activeElement).toBe(inside);
  });

  it("uses a persistent explicit opener instead of a transient menu item", () => {
    const trigger = document.createElement("button");
    const menuItem = document.createElement("button");
    document.body.append(trigger, menuItem);
    menuItem.focus();
    const restore = captureFocusReturn(trigger);
    menuItem.remove();
    restore();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not revive a disconnected frame control", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const inside = frame.contentDocument!.createElement("button");
    frame.contentDocument!.body.append(inside);
    inside.focus();
    const restore = captureFocusReturn();
    inside.remove();
    const focus = vi.spyOn(inside, "focus");
    restore();
    expect(focus).not.toHaveBeenCalled();
  });
});
