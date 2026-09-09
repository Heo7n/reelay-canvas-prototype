import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../src/legacy-canvas/canvas-reference-order.js", import.meta.url), "utf8"), context);
const { orderEntries, move, remap } = context.REELAY_CANVAS_REFERENCE_ORDER;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("reference projections mix linked and direct entries without replacing media objects", () => {
  const link = { key: "connection:inbound", asset: { id: "upstream-result" } };
  const direct = { key: "asset:local", asset: { id: "local", duration: 8 } };
  const added = { key: "asset:new", asset: { id: "new" } };
  const entries = Object.freeze([link, direct, added]);
  const order = Object.freeze(["asset:local", "asset:removed", "asset:local", "connection:inbound"]);
  const sorted = orderEntries(entries, order);
  assert.equal(sorted[0], direct);
  assert.equal(sorted[1], link);
  assert.equal(sorted[2], added);
  assert.equal(sorted[0].asset, direct.asset);
  assert.deepEqual(entries, [link, direct, added]);
  assert.deepEqual(order, ["asset:local", "asset:removed", "asset:local", "connection:inbound"]);
});

test("older nodes preserve supplied linked-then-direct order and malformed entries cannot duplicate references", () => {
  const first = { key: "connection:linked" }, second = { key: "asset:direct" };
  for (const order of [undefined, null, 42, {}, "asset:direct"]) {
    const result = orderEntries([first, second], order);
    assert.deepEqual(plain(result), [first, second]);
  }
  const result = orderEntries([null, {}, first, { key: first.key }, second, { key: "asset:" }, { key: "node:other" }], [null, {}, first.key]);
  assert.deepEqual(plain(result), [first, second]);
  assert.equal(result[0], first);
  assert.deepEqual(plain(orderEntries(undefined, [])), []);
});

test("moving a reference uses target insertion sides and preserves untouched key order", () => {
  const keys = Object.freeze(["connection:one", "asset:two", "asset:three", "connection:four"]);
  assert.deepEqual(plain(move(keys, "connection:four", "asset:two")), ["connection:one", "connection:four", "asset:two", "asset:three"]);
  assert.deepEqual(plain(move(keys, "connection:one", "asset:three", "after")), ["asset:two", "asset:three", "connection:one", "connection:four"]);
  assert.deepEqual(plain(move(keys, "asset:two", "connection:four", "after")), ["connection:one", "asset:three", "connection:four", "asset:two"]);
  assert.deepEqual(keys, ["connection:one", "asset:two", "asset:three", "connection:four"]);
});

test("no-op or invalid drops return the same array and cannot become content changes", () => {
  const keys = Object.freeze(["connection:one", "asset:two", "asset:three"]);
  for (const [source, target, placement] of [
    ["connection:one", "asset:two", "before"],
    ["asset:two", "connection:one", "after"],
    ["asset:two", "asset:two", "before"],
    ["asset:missing", "asset:two", "before"],
    ["asset:two", "asset:missing", "before"],
    ["asset:two", "asset:three", "invalid"],
  ]) assert.equal(move(keys, source, target, placement), keys);
  for (const invalid of [undefined, null, {}, ["asset:one", "asset:one"], ["asset: ", "asset:two"]]) {
    assert.equal(move(invalid, "asset:one", "asset:two"), invalid);
  }
});

test("copy remapping keeps mixed order while omitting uncopied links and stale references", () => {
  const order = Object.freeze(["asset:one", "connection:linked", "asset:two", "connection:external", "asset:removed"]);
  const assetIds = new Map([["one", "copy:one"], ["two", "copy:two"]]);
  const connectionIds = new Map([["linked", "copy:linked"]]);
  assert.deepEqual(plain(remap(order, { assetIds, connectionIds })), ["asset:copy:one", "connection:copy:linked", "asset:copy:two"]);
  assert.deepEqual(plain(remap(order, { assetIds })), ["asset:copy:one", "asset:copy:two"]);
  assert.deepEqual(order, ["asset:one", "connection:linked", "asset:two", "connection:external", "asset:removed"]);
  assert.equal(remap(undefined, { assetIds, connectionIds }), undefined);
});

test("copy remapping rejects malformed keys and mapped ids without adding duplicate references", () => {
  const assetIds = new Map([["one", "copy"], ["two", "copy"], ["bad", " "], ["long", "x".repeat(201)]]);
  assert.deepEqual(plain(remap(["asset:one", "asset:one", "asset:two", "asset:bad", "asset:long", null, {}, "node:one"], { assetIds })), ["asset:copy"]);
  assert.deepEqual(plain(remap(["asset:one"])), []);
});
