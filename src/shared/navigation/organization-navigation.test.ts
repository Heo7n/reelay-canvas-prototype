import { describe, expect, it } from "vitest";

import {
  isOrganizationPath,
  organizationCanvasReturnTo,
  organizationNavigationState,
} from "./organization-navigation";

const workspaceId = "workspace-one";
const canvasPath = "/w/workspace-one/projects/project-one/canvases/main";
const origin = `${canvasPath}?layoutTune=1#selection`;

function organizationLocation(state: unknown, suffix = "") {
  return { pathname: `/w/workspace-one/organization${suffix}`, search: "", hash: "", state };
}

describe("organization navigation", () => {
  it.each([
    "/w/workspace-one",
    "/w/workspace-one/projects",
    canvasPath,
  ])("records the current workspace source %s with its search and hash", (pathname) => {
    expect(organizationNavigationState(workspaceId, {
      pathname, search: "?kind=collaborative", hash: "#content", state: null,
    })).toEqual({ organizationReturnTo: `${pathname}?kind=collaborative#content` });
  });

  it.each(["", "/credits", "/usage"])("retains the original source when reentering organization%s", (suffix) => {
    expect(organizationNavigationState(workspaceId, organizationLocation({ organizationReturnTo: origin }, suffix)))
      .toEqual({ organizationReturnTo: origin });
  });

  it("starts without a return target on a direct organization visit", () => {
    expect(organizationNavigationState(workspaceId, organizationLocation(null))).toEqual({});
  });

  it("identifies only canvas sources as a return-to-canvas destination", () => {
    expect(organizationCanvasReturnTo(workspaceId, { organizationReturnTo: origin })).toBe(origin);
    expect(organizationCanvasReturnTo(workspaceId, { organizationReturnTo: "/w/workspace-one" })).toBeUndefined();
    expect(organizationCanvasReturnTo(workspaceId, { organizationReturnTo: "/w/workspace-one/projects?kind=private" })).toBeUndefined();
  });

  it("matches encoded identifiers without losing the original address", () => {
    const encoded = "/w/workspace%20one/projects/project%20one/canvases/main%20canvas?selected=one#focus";
    expect(organizationCanvasReturnTo("workspace one", { organizationReturnTo: encoded })).toBe(encoded);
  });

  it.each([
    "https://other.example/w/workspace-one/projects/project-one/canvases/main",
    "//other.example/w/workspace-one/projects/project-one/canvases/main",
    "/w/workspace-two/projects/project-one/canvases/main",
    "/w/workspace-one-extra/projects/project-one/canvases/main",
    "/w/workspace-one/projects/project-one/canvases/main/extra",
    "/w/workspace-one/projects/project-one/canvases/main/",
    "/w/workspace-one/projects//canvases/main",
    "/w/workspace-one/projects/../canvases/main",
    "/w/workspace-one/projects/./canvases/main",
    "/w/workspace-one/projects/%2e%2e/canvases/main",
    "/w/workspace-one/projects/%252e%252e/canvases/main",
    "/w/workspace-one/projects/%2fother/canvases/main",
    "/w/workspace-one/projects/%252fother/canvases/main",
    "/w/workspace-one/projects/..\\other/canvases/main",
    "/w/workspace-one/projects/%5cother/canvases/main",
    "/w/workspace-one/projects/%00/canvases/main",
    "/w/workspace-one/projects/%zz/canvases/main",
    "/w/workspace-one/organization?tab=members",
    "/w/workspace-one/organization/credits#content",
    "/w/workspace-one/assets",
    `${canvasPath}\n`,
  ])("rejects an invalid or unrelated destination %s", (organizationReturnTo) => {
    const state = { organizationReturnTo };
    expect(organizationCanvasReturnTo(workspaceId, state)).toBeUndefined();
    expect(organizationNavigationState(workspaceId, organizationLocation(state))).toEqual({});
  });

  it.each([undefined, null, "invalid", 42, [], { organizationReturnTo: 42 }])("ignores malformed route state %j", (state) => {
    expect(organizationCanvasReturnTo(workspaceId, state)).toBeUndefined();
    expect(organizationNavigationState(workspaceId, organizationLocation(state))).toEqual({});
  });

  it("does not carry a stale canvas source after leaving the organization area", () => {
    expect(organizationNavigationState(workspaceId, {
      pathname: "/w/workspace-one/projects", search: "", hash: "", state: { organizationReturnTo: origin },
    })).toEqual({ organizationReturnTo: "/w/workspace-one/projects" });
  });

  it("recognizes the current organization's three routes without prefix collisions", () => {
    expect(isOrganizationPath(workspaceId, "/w/workspace-one/organization")).toBe(true);
    expect(isOrganizationPath(workspaceId, "/w/workspace-one/organization/credits")).toBe(true);
    expect(isOrganizationPath(workspaceId, "/w/workspace-one/organization/usage")).toBe(true);
    expect(isOrganizationPath(workspaceId, "/w/workspace-one/organization-extra")).toBe(false);
    expect(isOrganizationPath(workspaceId, "/w/workspace-one/organization/unknown")).toBe(false);
    expect(isOrganizationPath(workspaceId, "/w/workspace-two/organization")).toBe(false);
  });
});
