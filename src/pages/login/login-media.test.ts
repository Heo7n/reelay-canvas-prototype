// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { preload } from "react-dom";
import { firstLoginImagePlaceholder, loginSlides, preloadFirstLoginImage } from "./login-media";

vi.mock("react-dom", () => ({ preload: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("login image preloading", () => {
  it("preloads only the first image at low priority for a visible desktop visitor", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    preloadFirstLoginImage();
    expect(preload).toHaveBeenCalledExactlyOnceWith(loginSlides[0].image, { as: "image", fetchPriority: "low" });
    expect(firstLoginImagePlaceholder).toMatch(/^data:image\/webp;base64,/);
    expect(firstLoginImagePlaceholder.length).toBeLessThan(500);
  });

  it("does not preload a hidden page or a viewport with no login media panel", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    preloadFirstLoginImage();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    preloadFirstLoginImage();
    expect(preload).not.toHaveBeenCalled();
  });
});
