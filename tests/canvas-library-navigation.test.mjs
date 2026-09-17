import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-library-navigation.js", import.meta.url), "utf8")).runInContext(context);
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  let scope = "project-one";
  let view = { space: "personal", zone: "media", folderId: "deep", query: "角色参考", filter: "image",
    tagFilter: { tagIds: ["character"], untagged: false }, scrollTop: 156 };
  const folders = new Set(["deep"]);
  const nav = context.REELAY_CANVAS_LIBRARY_NAVIGATION.createLibraryNavigation({
    read: () => view, apply: (next) => { view = plain(next); },
    folderExists: (id) => folders.has(id), getScopeKey: () => scope,
  });
  return { nav, folders, get view() { return view; }, set scope(value) { scope = value; } };
}

test("subject browsing and deep media browsing retain independent filters and scroll positions", () => {
  const f = fixture();
  const original = plain(f.view);
  f.nav.enterSubjects();
  assert.equal(f.view.zone, "subjects");
  assert.equal(f.view.query, "");
  f.view.query = "幽影";
  f.view.tagFilter.tagIds = ["object"];
  f.view.scrollTop = 210;
  f.nav.leaveSubjects();
  assert.deepEqual(f.view, original);
  f.nav.enterSubjects();
  assert.equal(f.view.query, "幽影");
  assert.equal(f.view.scrollTop, 210);
  assert.deepEqual(f.view.tagFilter.tagIds, ["object"]);
});

test("reference selection starts at the personal media root without stale search, tags or subject state", () => {
  const f = fixture();
  f.nav.switchSpace("organization");
  f.nav.enterSubjects();
  f.view.query = "旧筛选";
  f.view.tagFilter.tagIds = ["object"];
  f.nav.openMediaRoot();
  assert.deepEqual(f.view, { space: "personal", zone: "media", folderId: null, query: "", filter: "all",
    tagFilter: { tagIds: [], untagged: false }, scrollTop: 0 });
  f.nav.switchSpace("organization");
  assert.equal(f.view.zone, "subjects");
  assert.equal(f.view.query, "旧筛选");
});

test("spaces remember their own zones with independent organization subjects and no platform subjects", () => {
  const f = fixture();
  f.nav.enterSubjects(); f.view.query = "幽影";
  f.nav.switchSpace("organization");
  assert.equal(f.view.zone, "media");
  f.view.query = "场景";
  f.nav.switchSpace("personal");
  assert.equal(f.view.zone, "subjects");
  assert.equal(f.view.query, "幽影");
  f.nav.switchSpace("organization");
  assert.equal(f.view.query, "场景");
  f.nav.enterSubjects();
  assert.equal(f.view.zone, "subjects");
  f.view.query = "组织角色";
  f.nav.switchSpace("personal");
  assert.equal(f.view.query, "幽影");
  f.nav.switchSpace("organization");
  assert.equal(f.view.query, "组织角色");
  f.nav.leaveSubjects();
  assert.equal(f.view.query, "场景");
  f.nav.switchSpace("platform");
  assert.equal(f.nav.enterSubjects(), false);
});

test("new subject resets subject filters while preserving the source directory, and deleted return folders resolve to root", () => {
  const f = fixture();
  f.nav.enterSubjects(); f.view.query = "old";
  f.nav.enterSubjects({ reset: true });
  assert.equal(f.view.query, "");
  f.folders.delete("deep");
  f.nav.leaveSubjects();
  assert.equal(f.view.folderId, null);
  assert.equal(f.view.query, "角色参考");
});

test("explicit directory navigation exits subjects and tag deletion prunes both remembered zones", () => {
  const f = fixture();
  f.nav.enterSubjects(); f.view.tagFilter.tagIds = ["deleted"];
  f.nav.remember();
  f.nav.pruneTags("personal", new Set());
  f.nav.selectDirectory("deep");
  assert.equal(f.view.zone, "media");
  assert.equal(f.view.folderId, "deep");
  assert.equal(f.view.scrollTop, 0);
  assert.deepEqual(f.view.tagFilter.tagIds, []);
});

test("a new project or account invalidates all remembered navigation", () => {
  const f = fixture();
  f.nav.enterSubjects(); f.view.query = "private";
  f.scope = "project-two";
  f.nav.syncContext();
  assert.equal(f.view.zone, "media");
  assert.equal(f.view.query, "");
  f.nav.enterSubjects();
  assert.equal(f.view.query, "");
  assert.equal(f.nav.returnFolderId(), null);
});
