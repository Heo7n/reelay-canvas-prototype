import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REAL_GENERATION_PROBE_SPEC } from "../../contracts/real-generation";
import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";
import { RealGenerationError, type PlatformPage, type RealGenerationPlatform } from "./RealGenerationPlatform";
import { RealGenerationProbeService } from "./RealGenerationProbeService";

const actorId = "test-local-actor";
const target = { id: "explicit-target-project", name: "原本明确选择的项目" };
const created: RealGenerationProbeService[] = [];
function fixture() {
  const pages = new Map<number, PlatformPage>();
  let connections = 0;
  const login = vi.fn(async () => ({ token: `fake-connection-${++connections}`, userId: "fake-platform-user", displayName: "测试账号" }));
  const listProjects = vi.fn<RealGenerationPlatform["listProjects"]>(async (_token, page) => pages.get(page) ?? { items: [], hasMore: false });
  const generate = vi.fn<RealGenerationPlatform["generate"]>(async () => ({ status: "failed" }));
  const platform: RealGenerationPlatform = {
    login, listProjects, generate, dispose: vi.fn(), listAgentProjects: vi.fn(async () => ({ items: [], hasMore: false })),
    download: vi.fn(async () => ({ contentType: "video/mp4", body: new Uint8Array([1]) })),
  };
  const service = new RealGenerationProbeService(platform, new InMemoryObjectStore(), { channel: "web", specification: REAL_GENERATION_PROBE_SPEC, makeId: randomUUID });
  created.push(service);
  const connect = () => service.connect(actorId, { type: "email", target: "fake@example.invalid", password: "fixture-only" });
  return { pages, login, listProjects, generate, service, connect };
}
afterEach(() => { for (const service of created.splice(0)) service.dispose(); });

describe("selected project verification after connection changes", () => {
  it("finds only the explicit id on page two without requiring an earlier UI list", async () => {
    const context = fixture(); context.pages.set(1, { items: [{ id: "other-project", name: "其他" }], hasMore: true }); context.pages.set(2, { items: [target], hasMore: false });
    await context.connect(); expect(await context.service.verifySelectedProject(actorId, target.id)).toEqual(target);
    expect(context.listProjects.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    context.listProjects.mockClear(); expect(await context.service.verifySelectedProject(actorId, target.id)).toEqual(target);
    expect(context.listProjects.mock.calls.map((call) => call[1])).toEqual([2]); expect(context.generate).not.toHaveBeenCalled();
  });
  it("reconnects the same account and verifies a persisted page-two selection using the new identity", async () => {
    const context = fixture(); context.pages.set(1, { items: [], hasMore: true }); context.pages.set(2, { items: [target], hasMore: false });
    await context.connect(); await context.service.listProjects(actorId, 2); await context.connect(); context.listProjects.mockClear();
    expect(await context.service.verifySelectedProject(actorId, target.id)).toEqual(target);
    expect(context.listProjects.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    expect(context.listProjects.mock.calls.every((call) => call[0] === "fake-connection-2")).toBe(true); expect(context.generate).not.toHaveBeenCalled();
  });
  it("rejects a deleted target instead of substituting the next project and drops its stale location hint", async () => {
    const context = fixture(); context.pages.set(2, { items: [target], hasMore: false }); await context.connect(); await context.service.listProjects(actorId, 2);
    context.pages.set(1, { items: [{ id: "replacement-project", name: "不能替代" }], hasMore: false }); context.pages.set(2, { items: [], hasMore: false }); context.listProjects.mockClear();
    await expect(context.service.verifySelectedProject(actorId, target.id)).rejects.toMatchObject({ code: "container_unavailable" });
    expect(context.listProjects.mock.calls.map((call) => call[1])).toEqual([2, 1]);
    context.listProjects.mockClear(); await expect(context.service.verifySelectedProject(actorId, target.id)).rejects.toMatchObject({ code: "container_unavailable" });
    expect(context.listProjects.mock.calls.map((call) => call[1])).toEqual([1]); expect(context.generate).not.toHaveBeenCalled();
  });
  it("treats the cached page as a hint and finds the same project after it moves", async () => {
    const context = fixture(); context.pages.set(2, { items: [target], hasMore: false }); await context.connect(); await context.service.listProjects(actorId, 2);
    context.pages.set(1, { items: [{ ...target, name: "更名后的原项目" }], hasMore: true }); context.pages.set(2, { items: [], hasMore: false }); context.listProjects.mockClear();
    expect(await context.service.verifySelectedProject(actorId, target.id)).toEqual({ ...target, name: "更名后的原项目" });
    expect(context.listProjects.mock.calls.map((call) => call[1])).toEqual([2, 1]);
    context.listProjects.mockClear(); await context.service.verifySelectedProject(actorId, target.id); expect(context.listProjects.mock.calls.map((call) => call[1])).toEqual([1]);
  });
  it("marks an expired current identity and neither reconnects nor generates automatically", async () => {
    const context = fixture(); await context.connect(); context.listProjects.mockResolvedValueOnce({ items: [], hasMore: true }).mockRejectedValueOnce(new RealGenerationError("expired"));
    await expect(context.service.verifySelectedProject(actorId, target.id)).rejects.toMatchObject({ code: "expired" });
    expect(context.service.connection(actorId)).toMatchObject({ state: "expired", platformUser: null }); expect(context.login).toHaveBeenCalledTimes(1); expect(context.generate).not.toHaveBeenCalled();
  });
  it("rejects stale membership evidence if identity changes while a page is in flight", async () => {
    const context = fixture(); await context.connect(); let resolve!: (value: PlatformPage) => void;
    context.listProjects.mockImplementationOnce(() => new Promise<PlatformPage>((complete) => { resolve = complete; }));
    const verification = context.service.verifySelectedProject(actorId, target.id); await context.connect(); resolve({ items: [target], hasMore: true });
    await expect(verification).rejects.toMatchObject({ code: "disconnected" }); expect(context.listProjects).toHaveBeenCalledTimes(1);
    expect(context.service.connection(actorId).state).toBe("connected"); expect(context.generate).not.toHaveBeenCalled();
  });
  it("does not expire a newer connection when an old page request is rejected", async () => {
    const context = fixture(); await context.connect(); let reject!: (error: Error) => void;
    context.listProjects.mockImplementationOnce(() => new Promise<PlatformPage>((_resolve, fail) => { reject = fail; }));
    const verification = context.service.verifySelectedProject(actorId, target.id); await context.connect(); reject(new RealGenerationError("expired"));
    await expect(verification).rejects.toMatchObject({ code: "expired" }); expect(context.service.connection(actorId).state).toBe("connected"); expect(context.generate).not.toHaveBeenCalled();
  });
  it("bounds a provider that reports more pages forever to 100 read requests", async () => {
    const context = fixture(); await context.connect(); context.listProjects.mockResolvedValue({ items: [], hasMore: true });
    await expect(context.service.verifySelectedProject(actorId, target.id)).rejects.toMatchObject({ code: "container_unavailable" });
    expect(context.listProjects).toHaveBeenCalledTimes(100); expect(context.listProjects.mock.calls.at(-1)?.[1]).toBe(100); expect(context.generate).not.toHaveBeenCalled();
  });
});
