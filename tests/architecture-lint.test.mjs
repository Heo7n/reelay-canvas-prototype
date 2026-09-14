import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();

async function boundaryMessages(code, filePath = "src/domain/asset/lint-fixture.ts") {
  const [result] = await eslint.lintText(code, { filePath });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages.filter((message) => message.ruleId === "reelay/layer-imports");
}

test("domain allows its own types and pure validation dependencies", async () => {
  assert.deepEqual(await boundaryMessages('import type { ActorId } from "../identity/session"; import { z } from "zod";'), []);
});

test("application ports can depend inward; I/O adapters can implement ports", async () => {
  assert.deepEqual(await boundaryMessages('import type { ActorId } from "../../domain/identity/session";', "src/application/assets/lint-fixture.ts"), []);
  assert.deepEqual(await boundaryMessages('import type { ActorId } from "../../domain/identity/session";', "src/server/application/lint-fixture.ts"), []);
  assert.deepEqual(await boundaryMessages('import { Port } from "../../application/assets/Port";', "src/infrastructure/http/lint-fixture.ts"), []);
});

test("domain rejects UI, database, HTTP and outward imports including type-only imports", async () => {
  for (const source of ["react", "pg", "node:fs", "../../application/assets/MediaAssetRepository", "../../infrastructure/http/HttpApiClient", "../../server/app"]) {
    assert.equal((await boundaryMessages(`import type { Dependency } from "${source}";`)).length, 1, source);
  }
});

test("application layers reject I/O and UI implementations", async () => {
  for (const [filePath, source] of [
    ["src/application/assets/lint-fixture.ts", "../../infrastructure/http/HttpApiClient"],
    ["src/server/application/lint-fixture.ts", "../infrastructure/PostgresAssetStore"],
    ["src/application/assets/lint-fixture.ts", "../../pages/home/WorkspacePages"],
  ]) {
    assert.equal((await boundaryMessages(`import { Dependency } from "${source}";`, filePath)).length, 1);
  }
});

test("core-layer boundaries apply to every supported source-file extension", async () => {
  for (const layer of ["domain", "application", "server/application"]) {
    for (const extension of ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"]) {
      const filename = `src/${layer}/lint-fixture.${extension}`;
      assert.equal((await boundaryMessages('import dependency from "node:fs";', filename)).length, 1, filename);
    }
  }
});

test("TypeScript scripts receive base correctness rules as well as type-specific rules", async () => {
  const [result] = await eslint.lintText("if (true) {}", { filePath: "scripts/lint-fixture.ts" });
  assert.ok(result.messages.some((message) => message.ruleId === "no-constant-condition"));
  assert.ok(result.messages.some((message) => message.ruleId === "no-empty"));
});

test("reexports, dynamic imports, require and TS import types cannot bypass the boundary", async () => {
  for (const code of [
    'export { useState } from "react";',
    'export * from "pg";',
    'const module = import("react");',
    'const module = require("pg");',
    'type Connection = import("pg").Client;',
    'import database = require("pg");',
  ]) {
    assert.equal((await boundaryMessages(code)).length, 1, code);
  }
});

test("normalized traversal and unknown aliases cannot disguise an outward dependency", async () => {
  for (const source of ["../project/../../infrastructure/http/HttpApiClient", "@/infrastructure/http/HttpApiClient"]) {
    assert.equal((await boundaryMessages(`import { Dependency } from "${source}";`)).length, 1, source);
  }
  assert.equal((await boundaryMessages('const module = import(target);'))[0]?.messageId, "dynamic");
});

test("test fixtures may import their runner and implementation for integration checks", async () => {
  assert.deepEqual(await boundaryMessages('import { test } from "vitest";', "src/domain/asset/lint-fixture.test.ts"), []);
});
