import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApplicationError } from "../../application/shared/ApplicationError";
import { HttpApiClient, HttpResponseValidationError, type FetchLike } from "./HttpApiClient";

const valueSchema = z.object({ value: z.number() });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function createTransport() {
  const requests: Array<ReturnType<typeof deferred<Response>> & { url: string; init: RequestInit }> = [];
  const fetch: FetchLike = (input, init = {}) => {
    const request = { ...deferred<Response>(), url: input.toString(), init };
    requests.push(request);
    return request.promise;
  };
  return { fetch, requests };
}

function json(value: number) {
  return Response.json({ value });
}

describe("HttpApiClient concurrent JSON reads", () => {
  it("shares overlapping default reads through body consumption and fetches again after completion", async () => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const first = client.read("/api/document", valueSchema);
    const second = client.read("api/document", valueSchema);
    expect(transport.requests).toHaveLength(1);

    const body = deferred<string>();
    let bodyStarted!: () => void;
    const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
    const response = json(1);
    response.text = () => { bodyStarted(); return body.promise; };
    transport.requests[0]!.resolve(response);
    await started;
    const third = client.read("/api/document", valueSchema);
    expect(transport.requests).toHaveLength(1);
    body.resolve(JSON.stringify({ value: 1 }));
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      { value: 1 }, { value: 1 }, { value: 1 },
    ]);

    const next = client.read("/api/document", valueSchema);
    expect(transport.requests).toHaveLength(2);
    transport.requests[1]!.resolve(json(2));
    await expect(next).resolves.toEqual({ value: 2 });
  });

  it.each(["network", "http", "json"] as const)("removes a failed %s read so the next call retries", async (failure) => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const first = client.read("/api/document", valueSchema);
    const second = client.read("/api/document", valueSchema);
    const failed = Promise.allSettled([first, second]);
    if (failure === "network") transport.requests[0]!.reject(new Error("offline"));
    else if (failure === "http") transport.requests[0]!.resolve(new Response(null, { status: 503 }));
    else transport.requests[0]!.resolve(new Response("invalid json"));
    const results = await failed;
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(failure === "json" ? HttpResponseValidationError : ApplicationError);
      }
    }
    const retry = client.read("/api/document", valueSchema);
    expect(transport.requests).toHaveLength(2);
    transport.requests[1]!.resolve(json(2));
    await expect(retry).resolves.toEqual({ value: 2 });
  });

  it("isolates different paths and clients", async () => {
    const transport = createTransport();
    const firstClient = new HttpApiClient({ fetch: transport.fetch });
    const secondClient = new HttpApiClient({ fetch: transport.fetch });
    const reads = [
      firstClient.read("/api/document?canvas=one", valueSchema),
      firstClient.read("/api/document?canvas=two", valueSchema),
      secondClient.read("/api/document?canvas=one", valueSchema),
    ];
    expect(transport.requests).toHaveLength(3);
    transport.requests.forEach((request, index) => request.resolve(json(index)));
    await expect(Promise.all(reads)).resolves.toEqual([{ value: 0 }, { value: 1 }, { value: 2 }]);
  });

  it.each<RequestInit>([
    {},
    { method: "GET" },
    { headers: { "X-Preview": "one" } },
    { credentials: "omit" },
    { cache: "no-store" },
    { signal: new AbortController().signal },
  ])("keeps explicit request options independent: %j", async (init) => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const reads = [
      client.read("/api/document", valueSchema),
      client.read("/api/document", valueSchema, init),
      client.read("/api/document", valueSchema, init),
    ];
    expect(transport.requests).toHaveLength(3);
    transport.requests.forEach((request, index) => request.resolve(json(index)));
    await expect(Promise.all(reads)).resolves.toEqual([{ value: 0 }, { value: 1 }, { value: 2 }]);
  });

  it("does not propagate one explicit request's abort to other callers", async () => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const controller = new AbortController();
    const cancelled = client.read("/api/document", valueSchema, { signal: controller.signal });
    const unaffected = client.read("/api/document", valueSchema);
    const failure = expect(cancelled).rejects.toBeInstanceOf(ApplicationError);
    expect(transport.requests[0]!.init.signal).toBe(controller.signal);
    controller.abort();
    transport.requests[0]!.reject(controller.signal.reason);
    transport.requests[1]!.resolve(json(1));
    await failure;
    await expect(unaffected).resolves.toEqual({ value: 1 });
  });

  it("validates each caller's schema independently, including when a sibling rejects", async () => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const number = client.read("/api/document", valueSchema.transform(({ value }) => value));
    const label = client.read("/api/document", valueSchema.transform(({ value }) => `Value ${value}`));
    const invalid = client.read("/api/document", z.object({ missing: z.string() }));
    const rejected = expect(invalid).rejects.toBeInstanceOf(HttpResponseValidationError);
    expect(transport.requests).toHaveLength(1);
    transport.requests[0]!.resolve(json(3));
    await expect(number).resolves.toBe(3);
    await expect(label).resolves.toBe("Value 3");
    await rejected;
  });

  it("gives each schema its own mutable JSON object, including unknown fields and preprocessors", async () => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const schema = z.object({ value: z.unknown() });
    const changed = client.read("/api/document", z.preprocess((input) => {
      (input as { value: { count: number } }).value.count = 99;
      return input;
    }, schema));
    const unchanged = client.read("/api/document", schema);
    expect(transport.requests).toHaveLength(1);
    transport.requests[0]!.resolve(Response.json({ value: { count: 1 } }));
    const [first, second] = await Promise.all([changed, unchanged]);
    expect(first.value).toEqual({ count: 99 });
    expect(second.value).toEqual({ count: 1 });
    (first.value as { count: number }).count = 100;
    expect(second.value).toEqual({ count: 1 });
  });
});

describe("HttpApiClient write boundaries", () => {
  it.each(["success", "json error", "schema error"])("holds the write boundary through response consumption and %s", async (outcome) => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const body = deferred<string>();
    let bodyStarted!: () => void;
    const started = new Promise<void>((resolve) => { bodyStarted = resolve; });
    const response = json(1);
    response.text = () => { bodyStarted(); return body.promise; };
    const write = client.read("/api/session", valueSchema, { method: "POST" });
    const completedWrite = Promise.allSettled([write]);
    transport.requests[0]!.resolve(response);
    await started;
    const during = client.read("/api/context", valueSchema);
    const duringAgain = client.read("/api/context", valueSchema);
    expect(transport.requests).toHaveLength(3);

    body.resolve(outcome === "success" ? '{"value":1}' : outcome === "json error" ? "invalid" : "{}");
    const [result] = await completedWrite;
    expect(result!.status).toBe(outcome === "success" ? "fulfilled" : "rejected");
    const after = client.read("/api/context", valueSchema);
    const afterAgain = client.read("/api/context", valueSchema);
    expect(transport.requests).toHaveLength(4);
    transport.requests[1]!.resolve(json(1));
    transport.requests[2]!.resolve(json(2));
    transport.requests[3]!.resolve(json(3));
    await expect(Promise.all([during, duringAgain, after, afterAgain])).resolves.toEqual([
      { value: 1 }, { value: 2 }, { value: 3 }, { value: 3 },
    ]);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("invalidates reads around %s and preserves a replacement read when the old one settles", async (method) => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const old = client.read("/api/session", valueSchema);
    const write = client.read("/api/mutation", valueSchema, { method });
    const during = client.read("/api/session", valueSchema);
    const duringAgain = client.read("/api/session", valueSchema);
    expect(transport.requests).toHaveLength(4);

    transport.requests[1]!.resolve(json(1));
    await write;
    const after = client.read("/api/session", valueSchema);
    expect(transport.requests).toHaveLength(5);
    transport.requests[0]!.resolve(json(0));
    await old;
    const joined = client.read("/api/session", valueSchema);
    expect(transport.requests).toHaveLength(5);

    transport.requests[2]!.resolve(json(2));
    transport.requests[3]!.resolve(json(3));
    transport.requests[4]!.resolve(json(4));
    await expect(Promise.all([during, duringAgain, after, joined])).resolves.toEqual([
      { value: 2 }, { value: 3 }, { value: 4 }, { value: 4 },
    ]);
  });

  it("keeps reads independent until every overlapping write has finished", async () => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const firstWrite = client.sendWithoutResponse("/api/session", { method: "POST" });
    const secondWrite = client.sendWithoutResponse("/api/project", { method: "PATCH" });
    transport.requests[0]!.resolve(new Response(null, { status: 204 }));
    await firstWrite;
    const firstRead = client.read("/api/context", valueSchema);
    const secondRead = client.read("/api/context", valueSchema);
    expect(transport.requests).toHaveLength(4);

    transport.requests[1]!.resolve(new Response(null, { status: 204 }));
    await secondWrite;
    const finalReads = [client.read("/api/context", valueSchema), client.read("/api/context", valueSchema)];
    expect(transport.requests).toHaveLength(5);
    transport.requests[2]!.resolve(json(2));
    transport.requests[3]!.resolve(json(3));
    transport.requests[4]!.resolve(json(4));
    await expect(Promise.all([firstRead, secondRead, ...finalReads])).resolves.toEqual([
      { value: 2 }, { value: 3 }, { value: 4 }, { value: 4 },
    ]);
  });

  it.each(["network", "http"] as const)("restores read sharing after a write fails with %s", async (failure) => {
    const transport = createTransport();
    const client = new HttpApiClient({ fetch: transport.fetch });
    const old = client.read("/api/session", valueSchema);
    const write = client.sendWithoutResponse("/api/session", { method: "DELETE" });
    const rejected = expect(write).rejects.toBeInstanceOf(ApplicationError);
    if (failure === "network") transport.requests[1]!.reject(new Error("offline"));
    else transport.requests[1]!.resolve(new Response(null, { status: 503 }));
    await rejected;
    const reads = [client.read("/api/session", valueSchema), client.read("/api/session", valueSchema)];
    expect(transport.requests).toHaveLength(3);
    transport.requests[0]!.resolve(json(0));
    transport.requests[2]!.resolve(json(2));
    await old;
    await expect(Promise.all(reads)).resolves.toEqual([{ value: 2 }, { value: 2 }]);
  });
});
