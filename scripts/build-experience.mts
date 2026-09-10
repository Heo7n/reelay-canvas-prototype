import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { build } from "vite";
import { DEMO_ASSET_FIXTURES } from "../src/config/entity-demo-fixtures.ts";
import { DEMO_MEDIA_FIXTURES } from "../src/config/media-demo-fixtures.ts";
import { buildLegacyCanvas } from "./copy-legacy-canvas.mjs";

const root = process.cwd();
const output = path.join(root, "dist", "experience");
await build({ configFile: path.join(root, "vite.shell.config.ts"), mode: "experience" });
await buildLegacyCanvas(root, output, { experience: true });
await mkdir(path.join(output, "assets", "home"), { recursive: true });
await mkdir(path.join(output, "assets", "experience-preview"), { recursive: true });

// Only the explicitly published sample set enters this static site. No runtime
// DB/export, credentials, server functions or arbitrary personal library files.
for (const asset of DEMO_ASSET_FIXTURES) {
  if (!/^entity-[a-z0-9-]+-v4\.(png|jpg)$/.test(asset.fileName)) throw new Error("Unexpected experience fixture path.");
  const source = path.join(root, "assets", "home", asset.fileName);
  const bytes = await readFile(source);
  if (bytes.byteLength !== asset.goldenByteSize
    || createHash("sha256").update(bytes).digest("hex") !== asset.goldenChecksumSha256) {
    throw new Error(`Experience fixture differs from its published checksum: ${asset.fileName}`);
  }
  await copyFile(source, path.join(output, "assets", "home", asset.fileName));
  await sharp(bytes, { limitInputPixels: 64_000_000 }).rotate()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp({ quality: 76 })
    .toFile(path.join(output, "assets", "experience-preview", asset.fileName.replace(/\.[^.]+$/, ".webp")));
}

await mkdir(path.join(output, "assets", "experience-media"), { recursive: true });
for (const asset of DEMO_MEDIA_FIXTURES) {
  if (!/^[a-z0-9-]+-[a-f0-9]{8}\.(webm|mp3)$/.test(asset.fileName)) throw new Error("Unexpected experience media path.");
  const source = path.join(root, "assets", "experience-media", asset.fileName);
  const bytes = await readFile(source);
  if (bytes.byteLength !== asset.goldenByteSize
    || createHash("sha256").update(bytes).digest("hex") !== asset.goldenChecksumSha256) {
    throw new Error(`Experience media differs from its published checksum: ${asset.fileName}`);
  }
  await copyFile(source, path.join(output, "assets", "experience-media", asset.fileName));
}

await writeFile(path.join(output, "vercel.json"), JSON.stringify({
  framework: null,
  buildCommand: null,
  outputDirectory: ".",
  redirects: [{ source: "/", destination: "/app", permanent: false }],
  rewrites: [{ source: "/app/:path*", destination: "/app-shell.html" }],
  headers: [
    { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
  ],
}, null, 2));
await writeFile(path.join(output, "experience-release.json"), JSON.stringify({
  runtime: "ephemeral-experience",
  assets: DEMO_ASSET_FIXTURES.length + DEMO_MEDIA_FIXTURES.length,
  releaseCommit: process.env.REELAY_RELEASE_COMMIT || null,
}));
for (const name of await readdir(path.join(output, "assets"))) {
  if (!name.endsWith(".js")) continue;
  const source = await readFile(path.join(output, "assets", name), "utf8");
  if (source.includes("reelay-demo") || source.includes("/api/demo/session")) {
    throw new Error(`Internal login code must not enter the experience bundle: ${name}`);
  }
}
for (const forbidden of ["api", ".env", "node_modules", "src/server"]) {
  if (await access(path.join(output, forbidden)).then(() => true, () => false)) {
    throw new Error(`Server-only content entered the static experience: ${forbidden}`);
  }
}
console.log(`Static experience ready: ${DEMO_ASSET_FIXTURES.length} images and thumbnails, ${DEMO_MEDIA_FIXTURES.length} audio/video examples; no API or database.`);
