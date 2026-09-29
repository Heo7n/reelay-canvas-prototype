import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Provide an explicit preview origin."); }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Use an HTTPS origin or loopback HTTP origin, without credentials, path, query or fragment.");
  }
  return url.origin;
}

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "vercel.json") continue;
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error("Experience output must not contain symbolic links.");
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), `${relative}/`));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

async function requestHTTP(url, { range = false, limit }) {
  const response = await fetch(url, { headers: range ? { Range: "bytes=0-1023" } : {}, redirect: "error", signal: AbortSignal.timeout(35_000), credentials: "omit" });
  const chunks = []; let length = 0;
  for await (const chunk of response.body || []) {
    length += chunk.length;
    if (length > limit) { throw new Error("Response exceeded expected artifact size."); }
    chunks.push(chunk);
  }
  return { status: response.status, bytes: Buffer.concat(chunks), contentRange: response.headers.get("content-range") };
}

export async function verifyExperience({ directory, origin, expectedCommit, fullMedia = false, request = requestHTTP }) {
  origin = validateOrigin(origin);
  if (!/^[a-f0-9]{40}$/i.test(expectedCommit || "")) throw new Error("Provide the full expected source SHA with --sha.");
  expectedCommit = expectedCommit.toLowerCase();
  const root = path.resolve(directory);
  const release = JSON.parse(await readFile(path.join(root, "experience-release.json"), "utf8"));
  if (release.runtime !== "ephemeral-experience" || release.releaseCommit !== expectedCommit || !Number.isInteger(release.assets) || release.assets < 0) {
    throw new Error("Local experience metadata does not match the expected release source. Build with REELAY_RELEASE_COMMIT first.");
  }
  const files = await listFiles(root);
  const results = [];
  const get = async (route, options) => {
    try { return await request(origin + route, options); }
    catch { throw new Error(`HTTP verification failed at ${route}; check reachability, TLS and response size.`); }
  };
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < files.length) {
      const file = files[next++];
      const expected = await readFile(path.join(root, file));
      const range = !fullMedia && expected.length > 256 * 1024 && /\.(mp4|webm|mp3|jpg|png|webp)$/.test(file);
      const response = await get(`/${file.split("/").map(encodeURIComponent).join("/")}`, { range, limit: range ? 1024 : expected.length + 1 });
      const target = range ? expected.subarray(0, 1024) : expected;
      if (response.status !== (range ? 206 : 200) || hash(response.bytes) !== hash(target)
        || (range && response.contentRange !== `bytes 0-1023/${expected.length}`)) throw new Error(`Artifact mismatch: ${file} (HTTP ${response.status}).`);
      results.push({ path: file, check: range ? "range-prefix" : "full-sha256", bytes: response.bytes.length, sha256: hash(response.bytes) });
    }
  }));
  const shell = await readFile(path.join(root, "app-shell.html"));
  for (const route of ["/app", "/app/w/workspace-personal/projects"]) {
    const response = await get(route, { limit: shell.length + 1 });
    if (response.status !== 200 || hash(response.bytes) !== hash(shell)) throw new Error(`SPA entry mismatch: ${route}`);
  }
  const api = await get("/api/health", { limit: 1024 * 1024 });
  if (api.status !== 404) throw new Error(`Static experience unexpectedly exposes API (HTTP ${api.status}).`);
  const video = files.find((file) => /\.(mp4|webm)$/.test(file));
  if (!video) throw new Error("Experience must include a sample video for Range verification.");
  const videoBytes = await readFile(path.join(root, video));
  const length = Math.min(1024, videoBytes.length);
  const range = await get(`/${video}`, { range: true, limit: length });
  if (range.status !== 206 || range.contentRange !== `bytes 0-${length - 1}/${videoBytes.length}` || hash(range.bytes) !== hash(videoBytes.subarray(0, length))) throw new Error("Sample video Range did not match the artifact.");
  return { origin, release, verifiedFiles: results.length, spaRoutes: 2, apiStatus: api.status,
    fullHashFiles: results.filter((item) => item.check === "full-sha256").length,
    rangeFiles: results.filter((item) => item.check === "range-prefix").length,
    videoRangeStatus: range.status, checkedAt: new Date().toISOString(), files: results.sort((a, b) => a.path.localeCompare(b.path)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { origin: { type: "string" }, sha: { type: "string" }, directory: { type: "string", default: "dist/experience" }, report: { type: "string" }, "full-media": { type: "boolean", default: false } } });
    const report = await verifyExperience({ directory: values.directory, origin: values.origin, expectedCommit: values.sha, fullMedia: values["full-media"] });
    if (values.report) {
      const reportPath = path.resolve(values.report);
      await mkdir(path.dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify({ ...report, files: undefined }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
