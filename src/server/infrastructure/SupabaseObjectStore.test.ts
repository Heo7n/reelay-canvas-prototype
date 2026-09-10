import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ObjectKeyConflictError } from "../application/ObjectStore";
import { createSupabaseObjectStore } from "../supabase-object-store-config";
import { SupabaseObjectStore } from "./SupabaseObjectStore";

const BUCKET = "reelay-private";
const SECRET = "sb_secret_server_test_only";
const URL_ORIGIN = "https://storage-project.supabase.co";
const INPUT = {
  objectKey: "workspace/asset/original.png",
  contentType: "image/png",
  body: new Uint8Array([1, 2, 3, 4, 5, 6]),
};

interface FakeObject {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  metadata: Record<string, unknown>;
  etag: string;
}

function storageFixture() {
  const objects = new Map<string, FakeObject>();
  const requests: { url: string; init: RequestInit; headers: Headers }[] = [];
  let publicBucket = false;
  let override: ((url: URL, init: RequestInit) => Response | undefined) | undefined;
  const fetcher: typeof globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    requests.push({ url: String(input), init, headers });
    const overridden = override?.(url, init);
    if (overridden) return overridden;
    if (url.pathname === `/storage/v1/bucket/${BUCKET}`) {
      return Response.json({ id: BUCKET, public: publicBucket });
    }
    if (url.pathname.startsWith(`/storage/v1/object/upload/sign/${BUCKET}/`)) {
      return Response.json({ url: `${url.pathname.replace("/storage/v1", "")}?token=test-upload-only` });
    }
    if (url.pathname.startsWith(`/storage/v1/object/sign/${BUCKET}/`)) {
      const key = decodeURIComponent(url.pathname.split(`/object/sign/${BUCKET}/`)[1]);
      if (!objects.has(key)) return Response.json({ code: "NoSuchKey" }, { status: 404 });
      return Response.json({ signedURL: `${url.pathname.replace("/storage/v1", "")}?token=test-signed-object` });
    }
    const key = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(?:info\/authenticated\/|authenticated\/)?[^/]+\/?/, ""));
    if (init.method === "POST") {
      if (objects.has(key)) {
        return Response.json({ code: "KeyAlreadyExists", error: "Duplicate" }, { status: 409 });
      }
      const body = Uint8Array.from(init.body as Uint8Array);
      objects.set(key, {
        body,
        contentType: headers.get("content-type")!,
        metadata: JSON.parse(Buffer.from(headers.get("x-metadata")!, "base64").toString("utf8")),
        etag: `"${createHash("md5").update(body).digest("hex")}"`,
      });
      return Response.json({ Key: `${BUCKET}/${key}` });
    }
    if (init.method === "DELETE") {
      const paths = (JSON.parse(String(init.body)) as { prefixes: string[] }).prefixes;
      return Response.json(paths.flatMap((name) => objects.delete(name) ? [{ name }] : []));
    }
    const object = objects.get(key);
    if (!object) return Response.json({ code: "NoSuchKey" }, { status: 404 });
    if (url.pathname.includes("/info/")) {
      return Response.json({
        name: key, bucket_id: BUCKET, size: object.body.byteLength,
        content_type: object.contentType, etag: object.etag, metadata: object.metadata,
      });
    }
    const range = headers.get("range");
    if (range) {
      const [start, end] = range.slice(6).split("-").map(Number);
      return new Response(object.body.slice(start, end + 1), {
        status: 206,
        headers: { etag: object.etag, "content-range": `bytes ${start}-${end}/${object.body.byteLength}` },
      });
    }
    return new Response(object.body, { headers: { etag: object.etag } });
  };
  return {
    objects,
    requests,
    store: () => new SupabaseObjectStore({ url: URL_ORIGIN, serviceRoleKey: SECRET, bucket: BUCKET, fetch: fetcher }),
    makePublic: () => { publicBucket = true; },
    override: (next: typeof override) => { override = next; },
  };
}

describe("SupabaseObjectStore", () => {
  it("issues exact-path upload-only grants with immutable metadata and no server secrets", async () => {
    const fixture = storageFixture();
    const checksumSha256 = createHash("sha256").update(INPUT.body).digest("hex");
    const grant = await fixture.store().createSignedUpload({ ...INPUT, checksumSha256 });
    expect(grant.url).toBe(`${URL_ORIGIN}/storage/v1/object/upload/sign/${BUCKET}/${INPUT.objectKey}?token=test-upload-only`);
    expect(grant.method).toBe("PUT");
    expect(grant.headers["Content-Type"]).toBe(INPUT.contentType);
    expect(grant.headers["x-upsert"]).toBe("false");
    expect(JSON.parse(Buffer.from(grant.headers["x-metadata"], "base64").toString("utf8"))).toEqual({ reelayObjectStore: 1, checksumSha256 });
    expect(JSON.stringify(grant)).not.toContain(SECRET);
    expect(fixture.requests.at(-1)?.headers.get("x-upsert")).toBe("false");
    expect(fixture.objects.size).toBe(0);
    fixture.makePublic();
    await expect(fixture.store().createSignedUpload({ ...INPUT, checksumSha256 })).rejects.toThrow(/private bucket/);
    const other = storageFixture();
    other.override((url) => url.pathname.includes("/object/upload/sign/")
      ? Response.json({ url: "https://other.test/media?token=private" }) : undefined);
    await expect(other.store().createSignedUpload({ ...INPUT, checksumSha256 })).rejects.toThrow(/request failed/);
  });

  it("signs a short-lived exact private object without downloading its bytes", async () => {
    const fixture = storageFixture();
    const store = fixture.store();
    const input = { ...INPUT, objectKey: "workspace/video #1%.mp4", contentType: "video/mp4" };
    const metadata = await store.putObject(input);
    fixture.requests.length = 0;
    const signed = await store.createSignedDownload(input.objectKey, 300);
    expect(signed).toEqual({
      ...metadata,
      url: `${URL_ORIGIN}/storage/v1/object/sign/${BUCKET}/workspace/video%20%231%25.mp4?token=test-signed-object`,
    });
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[0].url).toContain("/object/info/authenticated/");
    expect(fixture.requests[1].init.method).toBe("POST");
    expect(JSON.parse(String(fixture.requests[1].init.body))).toEqual({ expiresIn: 300 });
    expect(signed?.url).not.toContain(SECRET);
    await expect(store.createSignedDownload("missing", 300)).resolves.toBeNull();
    for (const ttl of [0, 301, 1.5, NaN]) {
      await expect(store.createSignedDownload(input.objectKey, ttl)).rejects.toThrow(/expiry/);
    }
  });

  it("rejects signing from a public bucket, unknown objects, or an unexpected provider URL", async () => {
    const fixture = storageFixture();
    await fixture.store().putObject(INPUT);
    fixture.makePublic();
    await expect(fixture.store().createSignedDownload(INPUT.objectKey, 300)).rejects.toThrow(/private bucket/);
    const valid = storageFixture();
    const store = valid.store();
    await store.putObject(INPUT);
    for (const signedURL of [
      "https://other.example/media?token=secret", "//other.example/media?token=secret",
      `/object/sign/${BUCKET}/another.png?token=secret`,
      `/object/sign/${BUCKET}/${INPUT.objectKey}?missing=token`,
    ]) {
      valid.override((url) => url.pathname.includes("/object/sign/") ? Response.json({ signedURL }) : undefined);
      await expect(store.createSignedDownload(INPUT.objectKey, 300)).rejects.toThrow("Supabase object storage request failed (HTTP 200).");
    }
  });

  it("publishes immutable bytes and persistent checksum metadata in one request and reopens across instances", async () => {
    const fixture = storageFixture();
    const metadata = await fixture.store().putObject(INPUT);
    const checksum = createHash("sha256").update(INPUT.body).digest("hex");
    expect(metadata).toEqual({
      objectKey: INPUT.objectKey, contentType: INPUT.contentType,
      byteSize: INPUT.body.byteLength, checksumSha256: checksum, etag: checksum,
    });
    const reopened = fixture.store();
    await expect(reopened.headObject(INPUT.objectKey)).resolves.toEqual(metadata);
    await expect(reopened.getObject(INPUT.objectKey)).resolves.toEqual({ ...metadata, body: INPUT.body });
    expect(fixture.objects.get(INPUT.objectKey)?.metadata).toEqual({ reelayObjectStore: 1, checksumSha256: checksum });
    const upload = fixture.requests.find((entry) => entry.init.method === "POST")!;
    expect(upload.headers.get("x-upsert")).toBe("false");
    expect(upload.headers.get("apikey")).toBe(SECRET);
    expect(upload.headers.has("Authorization")).toBe(false);
    expect(fixture.requests.every((entry) => entry.init.redirect === "error" && entry.init.signal)).toBe(true);
    expect(fixture.requests.every((entry) => !entry.url.includes(SECRET) && !entry.url.includes("/public/"))).toBe(true);
  });

  it("accepts a concurrent identical upload and rejects competing bytes or MIME without overwriting the winner", async () => {
    const fixture = storageFixture();
    const store = fixture.store();
    const [first, second] = await Promise.all([store.putObject(INPUT), fixture.store().putObject(INPUT)]);
    expect(second).toEqual(first);
    await expect(store.putObject({ ...INPUT, body: new Uint8Array([9, 9]) })).rejects.toBeInstanceOf(ObjectKeyConflictError);
    await expect(store.putObject({ ...INPUT, contentType: "video/mp4" })).rejects.toBeInstanceOf(ObjectKeyConflictError);
    await expect(store.getObject(INPUT.objectKey)).resolves.toEqual({ ...first, body: INPUT.body });
    const competing = await Promise.allSettled([
      store.putObject({ ...INPUT, objectKey: "workspace/race", body: new Uint8Array([11]) }),
      fixture.store().putObject({ ...INPUT, objectKey: "workspace/race", body: new Uint8Array([12]) }),
    ]);
    expect(competing.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(competing.find((entry) => entry.status === "rejected")).toMatchObject({ reason: expect.any(ObjectKeyConflictError) });
  });

  it("returns full metadata with exactly the inclusive requested range, pinned to the storage ETag", async () => {
    const fixture = storageFixture();
    const store = fixture.store();
    const metadata = await store.putObject(INPUT);
    await expect(store.getObject(INPUT.objectKey, { range: { start: 2, end: 4 } })).resolves.toEqual({
      ...metadata, body: new Uint8Array([3, 4, 5]),
    });
    const download = fixture.requests.at(-1)!;
    expect(download.headers.get("range")).toBe("bytes=2-4");
    expect(download.headers.get("if-match")).toBe(fixture.objects.get(INPUT.objectKey)?.etag);
    for (const range of [
      { start: -1, end: 2 }, { start: 3, end: 2 }, { start: 0, end: 6 },
      { start: 0.5, end: 2 }, { start: 0, end: NaN },
    ]) {
      await expect(store.getObject(INPUT.objectKey, { range })).rejects.toBeInstanceOf(RangeError);
    }
  });

  it("rejects corrupted bytes, incomplete metadata, ignored ranges, and changed content between info and download", async () => {
    const fixture = storageFixture();
    const store = fixture.store();
    await store.putObject(INPUT);
    const object = fixture.objects.get(INPUT.objectKey)!;
    object.body = new Uint8Array([8, 8, 8, 8, 8, 8]);
    await expect(store.getObject(INPUT.objectKey)).rejects.toThrow(/integrity/);
    // An idempotency request must compare the real bytes, not trust the uploaded digest alone.
    await expect(store.putObject(INPUT)).rejects.toThrow(/integrity/);
    object.body = Uint8Array.from(INPUT.body);
    fixture.override((url) => url.pathname.includes("/object/authenticated/")
      ? new Response(object.body, { headers: { etag: object.etag } }) : undefined);
    await expect(store.getObject(INPUT.objectKey, { range: { start: 2, end: 4 } })).rejects.toThrow(/integrity/);
    fixture.override((url) => url.pathname.includes("/object/authenticated/")
      ? new Response(object.body, { headers: { etag: '"new-version"' } }) : undefined);
    await expect(store.getObject(INPUT.objectKey)).rejects.toThrow(/integrity/);
    fixture.override(undefined);
    object.metadata = {};
    await expect(store.headObject(INPUT.objectKey)).rejects.toThrow(/metadata.*integrity/);
  });

  it("deletes only the exact key and distinguishes missing objects from provider failures", async () => {
    const fixture = storageFixture();
    const store = fixture.store();
    await store.putObject(INPUT);
    await store.putObject({ ...INPUT, objectKey: `${INPUT.objectKey}.other` });
    await expect(store.deleteObject(INPUT.objectKey)).resolves.toBe(true);
    await expect(store.deleteObject(INPUT.objectKey)).resolves.toBe(false);
    await expect(store.getObject(INPUT.objectKey)).resolves.toBeNull();
    await expect(store.headObject(INPUT.objectKey)).resolves.toBeNull();
    expect(fixture.objects.has(`${INPUT.objectKey}.other`)).toBe(true);
    fixture.override(() => Response.json({ code: "NoSuchBucket" }, { status: 404 }));
    await expect(store.headObject(INPUT.objectKey)).rejects.toThrow(/HTTP 404/);
  });

  it("fails closed for a public bucket and retries a failed initial private-bucket check", async () => {
    const fixture = storageFixture();
    fixture.makePublic();
    await expect(fixture.store().putObject(INPUT)).rejects.toThrow(/private bucket/);
    expect(fixture.objects.size).toBe(0);
    const retry = storageFixture();
    const store = retry.store();
    retry.override(() => Response.json({ message: SECRET }, { status: 503 }));
    await expect(store.headObject(INPUT.objectKey)).rejects.toThrow(/HTTP 503/);
    retry.override(undefined);
    await expect(store.putObject(INPUT)).resolves.toMatchObject({ objectKey: INPUT.objectKey });
  });

  it("does not expose secrets, URLs or provider bodies in auth, transport or decoding errors", async () => {
    const fixture = storageFixture();
    fixture.override(() => Response.json({ message: `${SECRET} ${URL_ORIGIN}` }, { status: 401 }));
    let failure: unknown;
    try { await fixture.store().headObject(INPUT.objectKey); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("HTTP 401");
    expect(String(failure)).not.toMatch(new RegExp(`${SECRET}|${URL_ORIGIN}`));
    expect((failure as Error).cause).toBeUndefined();
    fixture.override(() => new Response(`malformed ${SECRET}`, { status: 200 }));
    await expect(fixture.store().headObject(INPUT.objectKey)).rejects.toThrow("Supabase object storage request failed (HTTP 200).");
    const broken = new SupabaseObjectStore({
      url: URL_ORIGIN, serviceRoleKey: SECRET, bucket: BUCKET,
      fetch: async () => { throw new Error(`${SECRET} ${URL_ORIGIN}`); },
    });
    await expect(broken.headObject(INPUT.objectKey)).rejects.toThrow("Supabase object storage request failed.");
  });

  it("encodes valid object paths and rejects traversal before sending a request", async () => {
    const fixture = storageFixture();
    const store = fixture.store();
    for (const objectKey of ["../escape", "/escape", "a//b", "a/../b", "a\\b", "a\u0000b"]) {
      await expect(store.putObject({ ...INPUT, objectKey })).rejects.toThrow(/invalid/);
    }
    expect(fixture.requests).toHaveLength(0);
    const objectKey = "workspace/image #1%.png";
    await store.putObject({ ...INPUT, objectKey });
    await expect(store.getObject(objectKey)).resolves.toMatchObject({ objectKey, body: INPUT.body });
    expect(fixture.requests.at(-1)?.url).toContain("image%20%231%25.png");
  });

  it("requires complete server configuration and supports legacy service-role authorization without accepting anon keys", async () => {
    expect(() => createSupabaseObjectStore({})).toThrow(/requires SUPABASE_URL/);
    expect(() => createSupabaseObjectStore({
      SUPABASE_URL: URL_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: SECRET, REELAY_SUPABASE_STORAGE_BUCKET: BUCKET,
    })).not.toThrow();
    for (const url of ["http://storage-project.supabase.co", `${URL_ORIGIN}/path`, `${URL_ORIGIN}?token=private`]) {
      expect(() => new SupabaseObjectStore({ url, serviceRoleKey: SECRET, bucket: BUCKET })).toThrow(/HTTPS origin/);
    }
    const legacyKey = (role: string) => `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
    for (const serviceRoleKey of ["sb_publishable_public", legacyKey("anon"), "invalid"]) {
      expect(() => new SupabaseObjectStore({ url: URL_ORIGIN, serviceRoleKey, bucket: BUCKET })).toThrow(/server secret/);
    }
    let sent: Headers | undefined;
    const legacy = new SupabaseObjectStore({
      url: URL_ORIGIN, serviceRoleKey: legacyKey("service_role"), bucket: BUCKET,
      fetch: async (_url, init) => {
        sent = new Headers(init?.headers);
        return Response.json({ message: "denied" }, { status: 401 });
      },
    });
    await expect(legacy.headObject(INPUT.objectKey)).rejects.toThrow(/401/);
    expect(sent?.get("authorization")).toBe(`Bearer ${legacyKey("service_role")}`);
  });
});
