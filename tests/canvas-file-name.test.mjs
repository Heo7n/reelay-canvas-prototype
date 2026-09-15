import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-file-name.js", import.meta.url), "utf8")).runInContext(context);
const { splitFileName } = context.REELAY_CANVAS_FILE_NAME;
const plain = (value) => ({ ...value });

test("file names split only their final format suffix while preserving original characters", () => {
  for (const [name, stem, extension] of [
    ["ChatGPT Image 2026年9月.png", "ChatGPT Image 2026年9月", ".png"],
    ["人物.正面.v2.JPEG", "人物.正面.v2", ".JPEG"],
    ["archive.tar.gz", "archive.tar", ".gz"],
    [".config.json", ".config", ".json"],
    ["声音.MP3", "声音", ".MP3"],
    ["文件.1234567890", "文件", ".1234567890"],
    ["  原名称 .png", "  原名称 ", ".png"],
  ]) {
    assert.deepEqual(plain(splitFileName(name)), { stem, extension });
    assert.equal(stem + extension, name);
  }
});

test("dotfiles, ordinary punctuation and absent or malformed extensions remain untouched", () => {
  for (const name of ["无扩展名", ".env", ".gitignore", ".", "..", "..png", " .jpg", "末尾点.", "我的.目录", "a.x", "a.12345678901", "a.p-ng", "image.png ", "名字. 场景", ""]) {
    assert.deepEqual(plain(splitFileName(name)), { stem: name, extension: "" }, name);
  }
  assert.deepEqual(plain(splitFileName(null)), { stem: "", extension: "" });
});
