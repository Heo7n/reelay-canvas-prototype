// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromptExamples } from "./PromptExamples";

let hidden = false;
let reducedMotion = false;
let preferenceChanged: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  reducedMotion = false;
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

async function advanceTime(milliseconds: number) {
  // Flush each character's render before the next phase schedules its timer.
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 5) {
    await act(() => vi.advanceTimersByTimeAsync(Math.min(5, milliseconds - elapsed)));
  }
}

describe("PromptExamples", () => {
  it("types progressively, holds a full example, then erases before a different example", async () => {
    const { container } = render(<PromptExamples active />);
    const hint = container.firstElementChild!;
    expect(hint).toHaveAttribute("aria-hidden", "true");
    expect(hint.textContent).toBe("");
    await advanceTime(260);
    const partial = hint.textContent!;
    expect(partial.length).toBeGreaterThan(0);
    await advanceTime(1_500);
    const complete = hint.textContent!;
    expect(complete.startsWith(partial)).toBe(true);
    expect(complete.length).toBeGreaterThan(partial.length);
    await advanceTime(1_000);
    expect(hint.textContent).toBe(complete);
    await advanceTime(1_000);
    expect(complete.startsWith(hint.textContent!)).toBe(true);
    expect(hint.textContent!.length).toBeLessThan(complete.length);
    await advanceTime(1_000);
    expect(hint.textContent!.length).toBeGreaterThan(0);
    expect(complete.startsWith(hint.textContent!)).toBe(false);
  });

  it("stops timers when inactive and resumes without resetting the displayed example", async () => {
    const { container, rerender, unmount } = render(<PromptExamples active />);
    await advanceTime(390);
    const partial = container.textContent!;
    rerender(<PromptExamples active={false} />);
    expect(vi.getTimerCount()).toBe(0);
    await advanceTime(2_000);
    expect(container.textContent).toBe(partial);
    rerender(<PromptExamples active />);
    await advanceTime(130);
    expect(container.textContent!.startsWith(partial)).toBe(true);
    expect(container.textContent!.length).toBeGreaterThan(partial.length);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(preferenceChanged).toBeUndefined();
  });

  it("pauses in the background independently of parent activity", async () => {
    const { container, rerender } = render(<PromptExamples active />);
    await advanceTime(260);
    const partial = container.textContent!;
    hidden = true;
    fireEvent(document, new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    rerender(<PromptExamples active={false} />);
    hidden = false;
    fireEvent(document, new Event("visibilitychange"));
    await advanceTime(2_000);
    expect(container.textContent).toBe(partial);
    expect(vi.getTimerCount()).toBe(0);
    rerender(<PromptExamples active />);
    await advanceTime(130);
    expect(container.textContent!.length).toBeGreaterThan(partial.length);
  });

  it("uses a static helper with no timers for reduced motion, including preference changes", async () => {
    reducedMotion = true;
    const { container } = render(<PromptExamples active />);
    const helper = container.textContent!;
    expect(helper).toContain("主体");
    expect(helper).toContain("场景");
    expect(vi.getTimerCount()).toBe(0);
    await advanceTime(5_000);
    expect(container.textContent).toBe(helper);
    reducedMotion = false;
    act(() => preferenceChanged?.());
    await advanceTime(260);
    expect(container.textContent).not.toBe(helper);
    reducedMotion = true;
    act(() => preferenceChanged?.());
    expect(container.textContent).toBe(helper);
    expect(vi.getTimerCount()).toBe(0);
  });
});
