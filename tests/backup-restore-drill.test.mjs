import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalDockerEndpoint, assertOwnedDrillContainer, assertRestoredSnapshot, fingerprintRows }
  from "../scripts/backup-restore-drill.mjs";

test("backup drill refuses remote Docker daemons", () => {
  for (const endpoint of ["tcp://127.0.0.1:2375", "ssh://remote", "tcp://production:2376", ""]) {
    assert.throws(() => assertLocalDockerEndpoint(endpoint));
  }
  assert.doesNotThrow(() => assertLocalDockerEndpoint("unix:///var/run/docker.sock"));
  assert.doesNotThrow(() => assertLocalDockerEndpoint("npipe:////./pipe/dockerDesktopLinuxEngine"));
});

test("container cleanup requires both its generated name and ownership label", () => {
  const runId = "ea1f914b-f477-4372-a68d-e4c8ae4fd431";
  const name = `reelay-backup-drill-${runId}`;
  assert.doesNotThrow(() => assertOwnedDrillContainer(name, runId, runId));
  assert.throws(() => assertOwnedDrillContainer("reelay-local-postgres-1", runId, runId));
  assert.throws(() => assertOwnedDrillContainer(name, "another-run", runId));
});

test("restore verification detects content changes even if row counts match", () => {
  const source = { tables: [{ count: 1, sha256: fingerprintRows([{ revision: 7 }]) }] };
  assert.doesNotThrow(() => assertRestoredSnapshot(source, structuredClone(source)));
  assert.throws(() => assertRestoredSnapshot(source, { tables: [{ count: 1, sha256: fingerprintRows([{ revision: 8 }]) }] }));
  assert.throws(() => assertRestoredSnapshot(source, { tables: [] }));
});
