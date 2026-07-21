// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasHost } from "./CanvasHost";

describe("CanvasHost", () => {
  it("keeps workspace, project, and canvas identity on the isolated legacy URL", () => {
    render(
      <CanvasHost
        context={{
          protocolVersion: 1,
          workspaceId: "organization 1",
          projectId: "project/1",
          canvasId: "main canvas",
          theme: "light",
        }}
      />,
    );

    expect(screen.getByTitle("Reelay 项目画布")).toHaveAttribute(
      "src",
      "/index.html?workspaceId=organization+1&projectId=project%2F1&canvasId=main+canvas",
    );
  });
});
