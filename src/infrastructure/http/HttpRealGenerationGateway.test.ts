import { describe, expect, it, vi } from "vitest";

import { REAL_GENERATION_PROBE_SPEC } from "../../contracts/real-generation";
import { ApplicationError } from "../../application/shared/ApplicationError";
import { HttpApiClient, HttpResponseValidationError, type FetchLike } from "./HttpApiClient";
import { HttpRealGenerationGateway } from "./HttpRealGenerationGateway";

const connection = {
  available: true,
  channel: "web",
  state: "connected",
  reason: null,
  platformUser: { id: "platform-user", displayName: "测试账号" },
  specification: REAL_GENERATION_PROBE_SPEC,
  probe: null,
};
const probe = {
  id: "probe-1", status: "waiting", createdAt: "2026-10-12T08:00:00.000Z", finishedAt: null,
  requestKey: "19d92526-4cbf-4d16-b0c2-e8caf4b254dd",
  prompt: "海边日出", projectId: "project-1", message: "等待平台返回",
  diagnostics: { eventCount: 0, eventTypes: [], eventShapes: [] }, result: null,
};

function setup(...payloads: unknown[]) {
  const fetch = vi.fn<FetchLike>(async () => new Response(JSON.stringify(payloads.shift()), {
    headers: { "Content-Type": "application/json" },
  }));
  const gateway = new HttpRealGenerationGateway(new HttpApiClient({ fetch }));
  return { fetch, gateway };
}

describe("HttpRealGenerationGateway", () => {
  it.each([undefined, "agent"])("rejects connection responses with a missing or stale channel (%s)", async (channel) => {
    const { gateway } = setup({ ...connection, channel });
    await expect(gateway.getConnection()).rejects.toBeInstanceOf(HttpResponseValidationError);
  });

  it("uses the local cookie session and returns no platform token from connection responses", async () => {
    const { gateway, fetch } = setup({ ...connection, token: "private-platform-token" }, connection);
    const connected = await gateway.connect({ type: "email", target: " user@example.com ", password: "private-password" });
    expect(connected).toEqual(connection);
    expect(fetch.mock.calls[0][0]).toBe("/api/real-generation/connection");
    expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", method: "POST" });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      type: "email", target: "user@example.com", password: "private-password",
    });
    await gateway.getConnection();
    expect(fetch.mock.calls[1][1]?.body).toBeUndefined();
    expect(new Headers(fetch.mock.calls[1][1]?.headers).has("Authorization")).toBe(false);
  });

  it("reads project pages through the local API", async () => {
    const page = { items: [], page: 2, hasMore: false };
    const { gateway, fetch } = setup(page);
    await gateway.listProjects(2);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/real-generation/projects?page=2",
    ]);
  });

  it("requires explicit paid consent and preserves request identity, with no automatic retry", async () => {
    const { gateway, fetch } = setup(probe, probe, { ...probe, status: "saving" });
    const input = {
      requestKey: "19d92526-4cbf-4d16-b0c2-e8caf4b254dd", prompt: "海边日出",
      projectId: "project-1", paidConsent: true as const,
    };
    await expect(gateway.startProbe(input)).resolves.toEqual(probe);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(input);
    await gateway.getProbe("probe-1");
    await gateway.retrySave("probe-1");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/real-generation/probes", "/api/real-generation/probes/probe-1", "/api/real-generation/probes/probe-1/retry-save",
    ]);
    expect(() => gateway.startProbe({ ...input, paidConsent: false } as unknown as typeof input)).toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects remote signed or authenticated URLs instead of exposing them to a browser player", async () => {
    const { gateway } = setup({ ...probe, status: "succeeded", result: {
      url: "https://platform.example/video?token=private", contentType: "video/mp4", byteSize: 32,
    } });
    await expect(gateway.getProbe("probe-1")).rejects.toBeInstanceOf(HttpResponseValidationError);
  });

  it("keeps an unreadable local state as a request error and never reissues a paid POST", async () => {
    const fetch = vi.fn<FetchLike>(async () => { throw new Error("network lost"); });
    const gateway = new HttpRealGenerationGateway(new HttpApiClient({ fetch }));
    await expect(gateway.getProbe("probe-1")).rejects.toBeInstanceOf(ApplicationError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]?.method).toBeUndefined();
  });
});
