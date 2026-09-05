import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-persistence-coordinator.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const factory = context.REELAY_CANVAS_PERSISTENCE_COORDINATOR;

function createHarness() {
  const parentWindow = {};
  const sent = [];
  const notices = [];
  const accessModes = [];
  const contexts = [];
  const readyDocuments = [];
  const timers = new Map();
  let nextTimerId = 1;
  let nextRequestId = 1;
  let snapshot = { kind: "reelay-legacy-canvas", version: 1, value: 0 };
  let hydratedContent = null;

  const coordinator = factory.createCanvasPersistenceCoordinator({
    instanceId: "canvas-instance-1",
    serialize: () => JSON.stringify(snapshot),
    hydrate: (content) => {
      hydratedContent = content;
      snapshot = content;
      return content?.supported !== false;
    },
    makeRequestId: () => `request-${nextRequestId++}`,
    postMessage: (message) => sent.push(JSON.parse(JSON.stringify(message))),
    setTimer: (callback, delay) => {
      const timerId = nextTimerId++;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimer: (timerId) => timers.delete(timerId),
    isHosted: () => true,
    getExpectedOrigin: () => "https://reelay.test",
    getExpectedSource: () => parentWindow,
    onAccessChange: (mode) => accessModes.push(mode),
    onContext: (value) => contexts.push(value),
    onDocumentReady: (value) => readyDocuments.push(value),
    onNotice: (notice) => notices.push(notice),
  });

  function hostMessage(data, overrides = {}) {
    return coordinator.handleHostMessage({
      origin: "https://reelay.test",
      source: parentWindow,
      data: { source: "reelay-shell", ...data },
      ...overrides,
    });
  }

  function initialize({ document = null, writable = true } = {}) {
    hostMessage({
      type: "host:init",
      context: {
        protocolVersion: 1,
        projectId: "project-1",
        projectName: "Project one",
        canvasId: "main",
        writable,
      },
    });
    hostMessage({
      type: "host:document",
      protocolVersion: 1,
      document,
      writable,
    });
  }

  function runNextTimer() {
    const entry = [...timers.entries()][0];
    assert.ok(entry, "expected a scheduled timer");
    timers.delete(entry[0]);
    entry[1].callback();
    return entry[1].delay;
  }

  return {
    accessModes,
    contexts,
    coordinator,
    get hydratedContent() { return hydratedContent; },
    hostMessage,
    initialize,
    notices,
    parentWindow,
    readyDocuments,
    runNextTimer,
    sent,
    setSnapshot(value) { snapshot = value; },
    timers,
  };
}

function saveMessages(harness) {
  return harness.sent.filter((message) => message.type === "canvas:save");
}

function saveResult(requestId, revision) {
  return {
    type: "host:save-result",
    protocolVersion: 1,
    requestId,
    document: {
      id: "main",
      projectId: "project-1",
      schemaVersion: 1,
      revision,
      content: {},
    },
  };
}

test("an empty hosted document establishes a baseline without creating revision one", () => {
  const harness = createHarness();
  harness.initialize();

  assert.equal(harness.coordinator.getState().initialized, true);
  assert.equal(harness.coordinator.getAccessMode(), "editable");
  assert.equal(harness.coordinator.flush(), false);
  assert.deepEqual(saveMessages(harness), []);
  assert.equal(harness.readyDocuments.length, 1);
});

test("the first real mutation is debounced and multiple mutations collapse into one save", () => {
  const harness = createHarness();
  harness.initialize();
  harness.setSnapshot({ kind: "reelay-legacy-canvas", version: 1, value: 1 });

  harness.coordinator.schedule();
  harness.coordinator.schedule();

  assert.equal(harness.timers.size, 1);
  assert.equal(harness.runNextTimer(), 800);
  assert.equal(saveMessages(harness).length, 1);
  assert.equal(saveMessages(harness)[0].expectedRevision, 0);
  assert.equal(saveMessages(harness)[0].content.value, 1);
});

test("only one save is in flight and a mutation during it continues at the new revision", () => {
  const harness = createHarness();
  harness.initialize();
  harness.setSnapshot({ kind: "reelay-legacy-canvas", version: 1, value: 1 });
  harness.coordinator.schedule(0);
  harness.runNextTimer();
  const firstSave = saveMessages(harness)[0];

  harness.setSnapshot({ kind: "reelay-legacy-canvas", version: 1, value: 2 });
  harness.coordinator.schedule(0);
  assert.equal(saveMessages(harness).length, 1);
  assert.equal(harness.coordinator.getState().pendingAfterFlight, true);

  assert.equal(harness.hostMessage(saveResult(firstSave.requestId, 1)), true);
  assert.equal(harness.runNextTimer(), 0);
  const secondSave = saveMessages(harness)[1];
  assert.equal(secondSave.expectedRevision, 1);
  assert.equal(secondSave.content.value, 2);

  harness.hostMessage(saveResult(secondSave.requestId, 2));
  assert.equal(harness.coordinator.getState().dirty, false);
  assert.equal(harness.coordinator.getState().revision, 2);
});

test("stale request ids and wrong document scopes have no effect", () => {
  const harness = createHarness();
  harness.initialize();
  harness.setSnapshot({ kind: "reelay-legacy-canvas", version: 1, value: 1 });
  harness.coordinator.schedule(0);
  harness.runNextTimer();
  const requestId = saveMessages(harness)[0].requestId;

  assert.equal(harness.hostMessage(saveResult("stale-request", 8)), false);
  assert.equal(harness.coordinator.getState().revision, 0);
  assert.equal(harness.hostMessage({
    ...saveResult(requestId, 8),
    document: { ...saveResult(requestId, 8).document, projectId: "other-project" },
  }), false);
  assert.equal(harness.coordinator.getState().inFlight.requestId, requestId);
});

test("conflict, forbidden, and missing errors stop unsafe writes with the right access mode", () => {
  for (const [code, accessMode] of [
    ["conflict", "blocked"],
    ["forbidden", "readonly"],
    ["missing", "blocked"],
  ]) {
    const harness = createHarness();
    harness.initialize();
    harness.setSnapshot({ kind: "reelay-legacy-canvas", version: 1, value: code });
    harness.coordinator.schedule(0);
    harness.runNextTimer();
    const requestId = saveMessages(harness)[0].requestId;

    assert.equal(harness.hostMessage({
      type: "host:save-error",
      protocolVersion: 1,
      requestId,
      code,
    }), true);
    assert.equal(harness.coordinator.getAccessMode(), accessMode);
    assert.equal(harness.coordinator.schedule(0), false);
    assert.deepEqual(harness.notices, [code]);
  }
});

test("a network error preserves dirty state and retries once after three seconds", () => {
  const harness = createHarness();
  harness.initialize();
  harness.setSnapshot({ kind: "reelay-legacy-canvas", version: 1, value: 1 });
  harness.coordinator.schedule(0);
  harness.runNextTimer();
  const requestId = saveMessages(harness)[0].requestId;

  harness.hostMessage({
    type: "host:save-error",
    protocolVersion: 1,
    requestId,
    code: "network",
  });

  assert.equal(harness.coordinator.getState().dirty, true);
  assert.equal(harness.runNextTimer(), 3000);
  assert.equal(saveMessages(harness).length, 2);
  assert.deepEqual(harness.notices, ["network"]);
});

test("host messages require the exact origin, source window, source tag, protocol, and scope", () => {
  const harness = createHarness();
  const init = {
    source: "reelay-shell",
    type: "host:init",
    context: { protocolVersion: 1, projectId: "project-1", canvasId: "main", writable: true },
  };
  assert.equal(harness.coordinator.handleHostMessage({
    origin: "https://evil.test",
    source: harness.parentWindow,
    data: init,
  }), false);
  assert.equal(harness.coordinator.handleHostMessage({
    origin: "https://reelay.test",
    source: {},
    data: init,
  }), false);
  assert.equal(harness.coordinator.handleHostMessage({
    origin: "https://reelay.test",
    source: harness.parentWindow,
    data: { ...init, source: "other" },
  }), false);
  assert.equal(harness.hostMessage({ ...init, context: { ...init.context, protocolVersion: 2 } }), false);

  harness.initialize();
  assert.equal(harness.hostMessage({
    type: "host:document",
    protocolVersion: 1,
    writable: true,
    document: {
      id: "other-canvas",
      projectId: "project-1",
      schemaVersion: 1,
      revision: 1,
      content: {},
    },
  }), false);
});

test("a new host context cancels timers and makes responses from the old scope stale", () => {
  const harness = createHarness();
  harness.initialize();
  harness.setSnapshot({ kind: "reelay-legacy-canvas", version: 1, value: 1 });
  harness.coordinator.schedule(0);
  harness.runNextTimer();
  const oldRequestId = saveMessages(harness)[0].requestId;

  harness.hostMessage({
    type: "host:init",
    context: {
      protocolVersion: 1,
      projectId: "project-2",
      canvasId: "main",
      writable: true,
    },
  });

  assert.equal(harness.coordinator.getState().inFlight, null);
  assert.equal(harness.hostMessage(saveResult(oldRequestId, 1)), false);
  assert.equal(harness.coordinator.getState().projectId, "project-2");
  assert.equal(harness.coordinator.getState().revision, 0);
});
