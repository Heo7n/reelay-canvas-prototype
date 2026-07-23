// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HeroSlide } from "./home-content";
import { HeroCarousel } from "./HeroCarousel";

const slides: HeroSlide[] = [
  { id: "one", title: "第一项", description: "第一项说明", image: "/one.webp" },
  { id: "two", title: "第二项", description: "第二项说明", image: "/two.webp" },
  { id: "three", title: "第三项", description: "第三项说明", image: "/three.webp" },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HeroCarousel autoplay", () => {
  it("advances to the next slide after the autoplay interval", () => {
    const onActiveIndexChange = vi.fn();

    render(
      <HeroCarousel
        slides={slides}
        activeIndex={0}
        onActiveIndexChange={onActiveIndexChange}
        onChooseSlide={vi.fn()}
      />,
    );

    act(() => vi.advanceTimersByTime(4_000));

    expect(onActiveIndexChange).toHaveBeenCalledWith(1);
  });

  it("pauses while the pointer is over the carousel and resumes after leaving", () => {
    const onActiveIndexChange = vi.fn();

    render(
      <HeroCarousel
        slides={slides}
        activeIndex={0}
        onActiveIndexChange={onActiveIndexChange}
        onChooseSlide={vi.fn()}
      />,
    );

    const carousel = screen.getByRole("region", { name: "Reelay 创作能力" });
    fireEvent.pointerEnter(carousel);
    act(() => vi.advanceTimersByTime(6_000));
    expect(onActiveIndexChange).not.toHaveBeenCalled();

    fireEvent.pointerLeave(carousel);
    act(() => vi.advanceTimersByTime(4_000));
    expect(onActiveIndexChange).toHaveBeenCalledWith(1);
  });
});
