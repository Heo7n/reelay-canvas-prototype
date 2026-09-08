// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "./HeroCarousel";

let reducedMotion = false;
let hidden = false;
let preferenceChanged: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  hidden = false;
  preferenceChanged = undefined;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return reducedMotion; },
    addEventListener: (_event: string, callback: () => void) => { preferenceChanged = callback; },
    removeEventListener: () => { preferenceChanged = undefined; },
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function expectSelected(title: string) {
  expect(screen.getByRole("button", { name: `显示${title}` })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: title })).toHaveAttribute("aria-pressed", "true");
}

describe("HeroCarousel", () => {
  it("starts on the featured scene and advances every four seconds with wraparound", () => {
    render(<HeroCarousel />);
    expectSelected("场景构想");
    act(() => vi.advanceTimersByTime(3_999));
    expectSelected("场景构想");
    act(() => vi.advanceTimersByTime(1));
    expectSelected("人物塑造");
    act(() => vi.advanceTimersByTime(4_000));
    expectSelected("视觉探索");
  });

  it("keeps focus and pointer pauses independent and restarts a full interval on leaving", () => {
    render(<HeroCarousel />);
    const carousel = screen.getByRole("region", { name: "创作图景" });
    const segment = screen.getByRole("button", { name: "显示视觉探索" });
    fireEvent.pointerEnter(carousel);
    fireEvent.focus(segment);
    fireEvent.pointerLeave(carousel);
    act(() => vi.advanceTimersByTime(8_000));
    expectSelected("场景构想");
    fireEvent.blur(segment, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(3_999));
    expectSelected("场景构想");
    act(() => vi.advanceTimersByTime(1));
    expectSelected("人物塑造");
  });

  it("lets cards, segments, arrows and keyboard select images without leaving the carousel", () => {
    render(<HeroCarousel paused />);
    fireEvent.click(screen.getByRole("button", { name: "视觉探索" }));
    expectSelected("视觉探索");
    fireEvent.click(screen.getByRole("button", { name: "显示人物塑造" }));
    expectSelected("人物塑造");
    fireEvent.click(screen.getByRole("button", { name: "下一张展示图" }));
    expectSelected("视觉探索");
    fireEvent.click(screen.getByRole("button", { name: "上一张展示图" }));
    expectSelected("人物塑造");
    fireEvent.keyDown(screen.getByRole("button", { name: "显示人物塑造" }), { key: "ArrowRight" });
    expectSelected("视觉探索");
  });

  it("pauses behind the login dialog and discards the previous partial interval", () => {
    const { rerender, unmount } = render(<HeroCarousel />);
    act(() => vi.advanceTimersByTime(2_000));
    rerender(<HeroCarousel paused />);
    act(() => vi.advanceTimersByTime(8_000));
    expectSelected("场景构想");
    rerender(<HeroCarousel />);
    act(() => vi.advanceTimersByTime(3_999));
    expectSelected("场景构想");
    act(() => vi.advanceTimersByTime(1));
    expectSelected("人物塑造");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps focus on the selected image after a side card moves into the featured slot", () => {
    render(<HeroCarousel />);
    const sideCard = screen.getByRole("button", { name: "人物塑造" });
    sideCard.focus();
    fireEvent.click(sideCard);
    expectSelected("人物塑造");
    expect(screen.getByRole("button", { name: "人物塑造" })).toHaveFocus();
    act(() => vi.advanceTimersByTime(8_000));
    expectSelected("人物塑造");
  });

  it("suspends in the background and when reduced motion is requested", () => {
    render(<HeroCarousel />);
    hidden = true;
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(8_000));
    expectSelected("场景构想");
    hidden = false;
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(4_000));
    expectSelected("人物塑造");
    reducedMotion = true;
    act(() => preferenceChanged?.());
    act(() => vi.advanceTimersByTime(8_000));
    expectSelected("人物塑造");
    reducedMotion = false;
    act(() => preferenceChanged?.());
    act(() => vi.advanceTimersByTime(4_000));
    expectSelected("视觉探索");
  });
});
