// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginMediaCarousel } from "./LoginMediaCarousel";

const media = new Map<string, MediaQueryList>();

function setMedia(query: string, matches: boolean) {
  const list = media.get(query)!;
  Object.defineProperty(list, "matches", { configurable: true, value: matches });
  list.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  vi.useFakeTimers();
  media.clear();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("matchMedia", (query: string) => {
    const list = Object.assign(new EventTarget(), { media: query, matches: false }) as MediaQueryList;
    media.set(query, list);
    return list;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LoginMediaCarousel", () => {
  it("advances every 4.5 seconds and wraps around the three slides", () => {
    render(<LoginMediaCarousel />);
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
  });

  it("holds a selected slide while its control has focus, then restarts on leaving the carousel", () => {
    render(<LoginMediaCarousel />);
    const selected = screen.getByRole("button", { name: "显示想象世界" });
    act(() => selected.focus());
    fireEvent.click(selected);
    act(() => vi.advanceTimersByTime(18_000));
    expect(selected).toHaveAttribute("aria-current", "true");
    act(() => selected.blur());
    act(() => vi.advanceTimersByTime(4_499));
    expect(selected).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
  });

  it("keeps keyboard navigation between segments paused without adding a playback control", () => {
    render(<LoginMediaCarousel />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    const first = screen.getByRole("button", { name: "显示灵感展开" });
    const second = screen.getByRole("button", { name: "显示角色叙事" });
    act(() => first.focus());
    act(() => second.focus());
    act(() => vi.advanceTimersByTime(12_000));
    expect(first).toHaveAttribute("aria-current", "true");
    act(() => second.blur());
    act(() => vi.advanceTimersByTime(4_500));
    expect(second).toHaveAttribute("aria-current", "true");
  });

  it("pauses in a background document and restarts without catching up missed slides", () => {
    render(<LoginMediaCarousel />);
    act(() => vi.advanceTimersByTime(3_000));
    act(() => {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    act(() => {
      vi.spyOn(document, "hidden", "get").mockReturnValue(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
  });

  it("stops autoplay when reduced motion is enabled or the media panel is hidden", () => {
    render(<LoginMediaCarousel />);
    act(() => setMedia("(prefers-reduced-motion: reduce)", true));
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "显示想象世界" }));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    act(() => {
      setMedia("(prefers-reduced-motion: reduce)", false);
      setMedia("(max-width: 720px)", true);
    });
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    act(() => setMedia("(max-width: 720px)", false));
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
  });

  it("pauses on pointer hover and keyboard focus, and clears timers when unmounted", () => {
    const { unmount } = render(<LoginMediaCarousel />);
    const region = screen.getByRole("region", { name: "Reelay 创作展示" });
    fireEvent.pointerEnter(region);
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    fireEvent.pointerLeave(region);
    fireEvent.focus(screen.getByRole("button", { name: "显示角色叙事" }));
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
