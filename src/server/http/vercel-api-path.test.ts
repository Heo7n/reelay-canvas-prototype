import { describe, expect, it } from "vitest";
import { normalizeVercelApiUrl } from "./vercel-api-path";
import { PersonalAssetQuerySchema } from "./asset-contracts";

describe("Vercel API rewrite boundary", () => {
  it.each([
    "/api/workspaces/demo/media-assets?apiPath=workspaces%2Fdemo%2Fmedia-assets&scope=personal",
    "/api?apiPath=workspaces%2Fdemo%2Fmedia-assets&scope=personal",
  ])("allows the real catalog query for both rewrite URL shapes", (input) => {
    const url = new URL(normalizeVercelApiUrl(input), "https://reelay.test");
    expect(url.pathname).toBe("/api/workspaces/demo/media-assets");
    expect(PersonalAssetQuerySchema.parse(Object.fromEntries(url.searchParams))).toEqual({ scope: "personal" });
  });

  it("preserves public paths and user query validation", () => {
    expect(normalizeVercelApiUrl("/api/session?apiPath=other&extra=value")).toBe("/api/session?extra=value");
    expect(normalizeVercelApiUrl("/api?apiPath=&scope=personal")).toBe("/api?scope=personal");
    expect(normalizeVercelApiUrl("/api/session")).toBe("/api/session");
    expect(normalizeVercelApiUrl()).toBe("/api");
    const url = new URL(normalizeVercelApiUrl("/api/list?apiPath=list&unexpected=1"), "https://reelay.test");
    expect(PersonalAssetQuerySchema.safeParse(Object.fromEntries(url.searchParams)).success).toBe(false);
  });
});
