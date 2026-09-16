import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-library-search-session.js", import.meta.url), "utf8")).runInContext(context);
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  let scope = "account-one:project-one:personal";
  let view = {
    space: "personal", zone: "media", folderId: "deep", query: "角色参考", filter: "image",
    tagFilter: { tagIds: ["character"], untagged: false }, entityFilter: null, scrollTop: 156,
  };
  const applied = [];
  const session = context.REELAY_CANVAS_LIBRARY_SEARCH_SESSION.create({
    read: () => view,
    apply(next) { applied.push(plain(next)); view = next; },
    getScopeKey: () => scope,
  });
  return { session, applied, get view() { return view; }, set view(value) { view = value; }, set scope(value) { scope = value; } };
}

test("opening search preserves browsing fields and does not apply a new view", () => {
  const f = fixture();
  const original = plain(f.view);
  assert.equal(f.session.isActive(), false);
  assert.deepEqual(plain(f.session.open()), original);
  assert.deepEqual(f.view, original);
  assert.deepEqual(f.applied, []);
  assert.equal(f.session.isOpen(), true);
  assert.equal(f.session.isActive(), true);
  assert.equal(f.session.hasReturn(), false);
});

test("source state and returned views are independent of subsequent query and filter edits", () => {
  const f = fixture();
  const original = plain(f.view);
  const opened = f.session.open();
  opened.tagFilter.tagIds.push("mutated-return");
  f.view.query = "weapon";
  f.view.filter = "video";
  f.view.tagFilter.tagIds.push("object");
  f.view.scrollTop = 920;
  const restored = f.session.close();
  assert.deepEqual(plain(f.view), original);
  restored.tagFilter.tagIds.push("mutated-close-return");
  assert.deepEqual(plain(f.view), original);
  assert.equal(f.session.isActive(), false);
});

test("duplicate open does not replace the source directory or filters", () => {
  const f = fixture();
  const original = plain(f.view);
  f.session.open();
  f.view.query = "new query";
  f.view.tagFilter.tagIds = [];
  assert.equal(f.session.open().query, "new query");
  f.session.close();
  assert.deepEqual(plain(f.view), original);
});

test("opening a search result suspends search and returns to the exact results", () => {
  const f = fixture();
  f.session.open();
  f.view.query = "幽影";
  f.view.filter = "all";
  f.view.tagFilter = { tagIds: ["object"], untagged: true };
  f.view.scrollTop = 430;
  const expectedResults = plain(f.view);
  const suspended = f.session.suspend();
  assert.deepEqual(f.applied, []);
  suspended.tagFilter.tagIds.push("returned-snapshot-edit");
  f.view.query = "";
  f.view.zone = "subjects";
  f.view.entityFilter = { id: "subject-one", query: "members", scrollTop: 22 };
  f.view.tagFilter.tagIds = [];
  assert.equal(f.session.isOpen(), false);
  assert.equal(f.session.hasReturn(), true);
  assert.equal(f.session.isActive(), true);
  assert.deepEqual(plain(f.session.resume()), expectedResults);
  assert.deepEqual(plain(f.view), expectedResults);
  assert.equal(f.session.hasReturn(), false);
  assert.equal(f.session.isOpen(), true);
});

test("opening suspended search restores results without recapturing its destination", () => {
  const f = fixture();
  const original = plain(f.view);
  f.session.open();
  f.view.query = "look everywhere";
  f.session.suspend();
  f.view = { ...f.view, folderId: "result-folder", query: "", scrollTop: 0 };
  assert.equal(f.session.open().query, "look everywhere");
  f.session.close();
  assert.deepEqual(plain(f.view), original);
});

test("closing from a result restores source subject details and nested navigation state", () => {
  const f = fixture();
  f.view.zone = "subjects";
  f.view.entityFilter = {
    id: "source-subject", query: "front", filter: "image",
    tags: ["character"], returnView: { query: "source list", scrollTop: 240 },
  };
  const original = plain(f.view);
  f.session.open();
  f.view.entityFilter.tags.push("object");
  f.view.entityFilter.returnView.scrollTop = 900;
  f.session.suspend();
  f.view.entityFilter = null;
  f.session.close();
  assert.deepEqual(plain(f.view), original);
  assert.equal(f.session.hasReturn(), false);
});

test("repeated result visits retain independent result and original query snapshots", () => {
  const f = fixture();
  const original = plain(f.view);
  f.session.open();
  f.view.query = "first result query";
  f.session.suspend();
  f.view.query = "result content";
  f.session.resume();
  f.view.query = "refined result query";
  f.view.tagFilter.tagIds.push("object");
  const expectedResults = plain(f.view);
  f.session.suspend();
  f.view.query = "second result content";
  f.session.resume();
  assert.deepEqual(plain(f.view), expectedResults);
  f.session.close();
  assert.deepEqual(plain(f.view), original);
});

test("scope changes invalidate search without applying a previous account or space view", () => {
  for (const operation of ["close", "resume", "syncContext"]) {
    const f = fixture();
    f.session.open();
    f.view.query = "private search";
    f.session.suspend();
    f.scope = "account-two:project-two:organization";
    f.view = { ...f.view, space: "organization", folderId: "org-folder", query: "organization query" };
    const nextScopeView = plain(f.view);
    f.session[operation]();
    assert.deepEqual(plain(f.view), nextScopeView);
    assert.deepEqual(f.applied, []);
    assert.equal(f.session.isActive(), false);
    assert.equal(f.session.hasReturn(), false);
  }
});

test("opening after a scope change begins from the new scope", () => {
  const f = fixture();
  f.session.open();
  f.scope = "account-one:project-one:platform";
  f.view = { ...f.view, space: "platform", query: "platform query", tagFilter: { tagIds: [], untagged: false } };
  const original = plain(f.view);
  f.session.open();
  f.view.query = "changed";
  f.session.close();
  assert.deepEqual(plain(f.view), original);
});

test("reset discards suspended return state without changing the current destination", () => {
  const f = fixture();
  f.session.open();
  f.session.suspend();
  f.view.query = "destination";
  const destination = plain(f.view);
  f.session.reset();
  assert.equal(f.session.resume(), null);
  assert.equal(f.session.close(), null);
  assert.equal(f.session.suspend(), null);
  assert.deepEqual(plain(f.view), destination);
  assert.deepEqual(f.applied, []);
});

test("tag deletion prunes source filters without mutating the current search or its other fields", () => {
  const f = fixture();
  f.view.tagFilter = { tagIds: ["builtin:character", "deleted", "retained"], untagged: true };
  const original = plain(f.view);
  f.session.open();
  f.view.query = "live query";
  f.session.pruneTags("personal", new Set(["builtin:character", "retained"]));
  assert.deepEqual(f.view.tagFilter.tagIds, ["builtin:character", "deleted", "retained"]);
  assert.deepEqual(f.applied, []);
  f.session.close();
  assert.deepEqual(plain(f.view), {
    ...original, tagFilter: { tagIds: ["builtin:character", "retained"], untagged: true },
  });
});

test("suspended search prunes source and result nested return filters in their matching spaces", () => {
  const f = fixture();
  f.view.tagFilter = { tagIds: ["builtin:character", "deleted"], untagged: false };
  f.view.entityFilter = {
    entityId: "subject-one", space: "personal",
    returnContext: {
      query: "source return query", tagFilter: { tagIds: ["deleted", "retained"], untagged: true },
      entityFilter: {
        space: "organization",
        returnContext: { query: "organization query", tagFilter: { tagIds: ["deleted"], untagged: false } },
      },
    },
  };
  const original = plain(f.view);
  f.session.open();
  f.view.query = "result query";
  f.view.entityFilter.returnContext.query = "result return query";
  const expectedResults = plain(f.view);
  f.session.suspend();
  f.session.pruneTags("personal", new Set(["builtin:character", "retained"]));
  assert.equal(f.session.hasReturn(), true);
  assert.deepEqual(f.applied, []);
  for (const snapshot of [original, expectedResults]) {
    snapshot.tagFilter.tagIds = ["builtin:character"];
    snapshot.entityFilter.returnContext.tagFilter.tagIds = ["retained"];
  }
  f.session.resume();
  assert.deepEqual(plain(f.view), expectedResults);
  f.session.close();
  assert.deepEqual(plain(f.view), original);
});

test("tag pruning respects an explicit nested space and invalidates stale scope snapshots", () => {
  const f = fixture();
  f.view.entityFilter = {
    space: "personal",
    returnContext: { space: "organization", query: "return query", tagFilter: { tagIds: ["deleted"], untagged: false } },
  };
  f.session.open();
  f.session.pruneTags("organization", new Set());
  f.session.close();
  assert.deepEqual(plain(f.view.tagFilter.tagIds), ["character"]);
  assert.deepEqual(plain(f.view.entityFilter.returnContext.tagFilter.tagIds), []);
  assert.equal(f.view.entityFilter.returnContext.query, "return query");
  f.session.open();
  f.session.suspend();
  f.scope = "account-two:project-two:personal";
  f.applied.length = 0;
  f.session.pruneTags("personal", new Set());
  assert.equal(f.session.isActive(), false);
  assert.deepEqual(f.applied, []);
  assert.equal(f.session.close(), null);
});
