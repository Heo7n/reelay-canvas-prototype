// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Circle } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Capability } from "./home-content";
import { CapabilityStrip } from "./CapabilityStrip";

afterEach(cleanup);

const capabilities: Capability[] = [
  { id: "storyboard", label: "AI 分镜", icon: Circle, prompt: "分镜" },
  { id: "text-video", label: "文生视频", icon: Circle, prompt: "文生视频" },
  { id: "image-video", label: "图生视频", icon: Circle, prompt: "图生视频" },
  { id: "character", label: "角色一致性", icon: Circle, prompt: "角色一致性" },
  { id: "canvas", label: "画布编排", icon: Circle, prompt: "画布编排" },
  { id: "assets", label: "项目资产", icon: Circle, prompt: "项目资产" },
  { id: "agent", label: "Reelay Agent", icon: Circle, prompt: "Agent" },
  { id: "all", label: "全部能力", icon: Circle, prompt: "" },
];

describe("CapabilityStrip", () => {
  it("presents capabilities in workflow groups and preserves their actions", () => {
    const onChoose = vi.fn();
    const { container } = render(<CapabilityStrip capabilities={capabilities} onChoose={onChoose} />);

    expect(container.textContent).toMatch(
      /快速开始.*策划.*AI 分镜.*Reelay Agent.*生成.*文生视频.*图生视频.*角色一致性.*制作.*画布编排.*项目资产.*全部能力/,
    );

    fireEvent.click(screen.getByRole("button", { name: "图生视频" }));
    expect(onChoose).toHaveBeenCalledWith(capabilities[2]);
  });
});
