import { describe, expect, it } from "vitest";

import { canvasLayoutTunerPlugin, canvasLayoutTunerTags } from "./canvas-layout-tuner-plugin";

describe("canvas layout tuner development plugin", () => {
  it("injects the tuner only into the legacy canvas document", () => {
    expect(canvasLayoutTunerTags("/index.html")).toEqual([
      expect.objectContaining({ tag: "link", injectTo: "head" }),
      expect.objectContaining({ tag: "script", injectTo: "head" }),
    ]);
    expect(canvasLayoutTunerTags("/app-shell.html")).toEqual([]);
  });

  it("is excluded from production builds", () => {
    expect(canvasLayoutTunerPlugin().apply).toBe("serve");
  });
});
