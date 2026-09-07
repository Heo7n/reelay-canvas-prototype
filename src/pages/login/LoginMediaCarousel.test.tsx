// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginMediaCarousel } from "./LoginMediaCarousel";
import { loginSlides } from "./login-media";

const media = new Map<string, MediaQueryList>();

async function renderReadyCarousel() {
  const view = render(<LoginMediaCarousel />);
  await act(async () => {
    view.container.querySelectorAll("img").forEach((image) => fireEvent.load(image));
  });
  return view;
}

function setMedia(query: string, matches: boolean) {
  const list = media.get(query)!;
  Object.defineProperty(list, "matches", { configurable: true, value: matches });
  list.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
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
  it("advances every 4.5 seconds and wraps around the three slides", async () => {
    await renderReadyCarousel();
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
  });

  it("holds a selected slide while its control has focus, then restarts on leaving the carousel", async () => {
    await renderReadyCarousel();
    const selected = screen.getByRole("button", { name: "显示角色叙事" });
    act(() => selected.focus());
    fireEvent.click(selected);
    act(() => vi.advanceTimersByTime(18_000));
    expect(selected).toHaveAttribute("aria-current", "true");
    act(() => selected.blur());
    act(() => vi.advanceTimersByTime(4_499));
    expect(selected).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
  });

  it("keeps keyboard navigation between segments paused without adding a playback control", async () => {
    await renderReadyCarousel();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    const first = screen.getByRole("button", { name: "显示想象世界" });
    const second = screen.getByRole("button", { name: "显示灵感展开" });
    act(() => first.focus());
    act(() => second.focus());
    act(() => vi.advanceTimersByTime(12_000));
    expect(first).toHaveAttribute("aria-current", "true");
    act(() => second.blur());
    act(() => vi.advanceTimersByTime(4_500));
    expect(second).toHaveAttribute("aria-current", "true");
  });

  it("pauses in a background document and restarts without catching up missed slides", async () => {
    await renderReadyCarousel();
    act(() => vi.advanceTimersByTime(3_000));
    act(() => {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    act(() => {
      vi.spyOn(document, "hidden", "get").mockReturnValue(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
  });

  it("stops autoplay when reduced motion is enabled or the media panel is hidden", async () => {
    await renderReadyCarousel();
    act(() => setMedia("(prefers-reduced-motion: reduce)", true));
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "显示角色叙事" }));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
    act(() => {
      setMedia("(prefers-reduced-motion: reduce)", false);
      setMedia("(max-width: 720px)", true);
    });
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
    act(() => setMedia("(max-width: 720px)", false));
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
  });

  it("pauses on pointer hover and keyboard focus, and clears timers when unmounted", async () => {
    const { unmount } = await renderReadyCarousel();
    const region = screen.getByRole("region", { name: "Reelay 创作展示" });
    fireEvent.pointerEnter(region);
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    fireEvent.pointerLeave(region);
    fireEvent.focus(screen.getByRole("button", { name: "显示灵感展开" }));
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows a request-free first-frame placeholder and waits for the first full image to decode", async () => {
    let finish!: () => void;
    vi.mocked(HTMLImageElement.prototype.decode).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { container } = render(<LoginMediaCarousel />);
    const image = screen.getByAltText(loginSlides[0].alt);
    expect(container.querySelector('[style*="data:image/webp;base64,"]')).toBeInTheDocument();
    fireEvent.load(image);
    act(() => vi.advanceTimersByTime(12_000));
    expect(image.className).not.toContain("imageReady");
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    await act(async () => finish());
    expect(image.className).toContain("imageReady");
  });

  it("retains the current frame until the requested next frame is decoded", async () => {
    let finish!: () => void;
    render(<LoginMediaCarousel />);
    await act(async () => fireEvent.load(screen.getByAltText(loginSlides[0].alt)));
    vi.mocked(HTMLImageElement.prototype.decode).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    fireEvent.load(screen.getByAltText(loginSlides[1].alt));
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByAltText(loginSlides[0].alt).closest('[role="group"]')?.className).toContain("previous");
  });

  it("cancels a waiting automatic switch on pause and ignores a superseded manual request", async () => {
    render(<LoginMediaCarousel />);
    await act(async () => fireEvent.load(screen.getByAltText(loginSlides[0].alt)));
    act(() => vi.advanceTimersByTime(4_500));
    const region = screen.getByRole("region", { name: "Reelay 创作展示" });
    fireEvent.pointerEnter(region);
    await act(async () => fireEvent.load(screen.getByAltText(loginSlides[1].alt)));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "显示角色叙事" }));
    fireEvent.click(screen.getByRole("button", { name: "显示灵感展开" }));
    await act(async () => fireEvent.load(screen.getByAltText(loginSlides[2].alt)));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    fireEvent.pointerLeave(region);
    act(() => vi.advanceTimersByTime(4_499));
    expect(screen.getByRole("button", { name: "显示灵感展开" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
  });

  it("keeps a good frame when another image fails and skips it on autoplay", async () => {
    render(<LoginMediaCarousel />);
    await act(async () => {
      fireEvent.load(screen.getByAltText(loginSlides[0].alt));
      fireEvent.load(screen.getByAltText(loginSlides[2].alt));
    });
    fireEvent.click(screen.getByRole("button", { name: "显示灵感展开" }));
    fireEvent.error(screen.getByAltText(loginSlides[1].alt));
    expect(screen.getByRole("button", { name: "显示想象世界" })).toHaveAttribute("aria-current", "true");
    act(() => vi.advanceTimersByTime(4_500));
    expect(screen.getByRole("button", { name: "显示角色叙事" })).toHaveAttribute("aria-current", "true");
  });
});
