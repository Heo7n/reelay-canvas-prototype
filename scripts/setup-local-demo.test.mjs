import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_DEMO_STEPS,
  LocalDemoStepError,
  assertLocalDemoEnvironment,
  runLocalDemoSetup,
} from "./setup-local-demo.mjs";

test("local demo setup runs all steps in order and exposes the seed switch only to db:seed", async () => {
  const environment = {
    PATH: "test-path",
    allow_demo_seed: "left-over-parent-value",
  };
  const calls = [];

  await runLocalDemoSetup({
    environment,
    report() {},
    async runStep(call) {
      calls.push(call);
      return 0;
    },
  });

  assert.deepEqual(calls.map(({ step }) => step), LOCAL_DEMO_STEPS);
  assert.equal(
    Object.keys(calls[0].environment).some((key) => key.toUpperCase() === "ALLOW_DEMO_SEED"),
    false,
  );
  assert.equal(
    Object.keys(calls[1].environment).some((key) => key.toUpperCase() === "ALLOW_DEMO_SEED"),
    false,
  );
  assert.equal(calls[2].environment.ALLOW_DEMO_SEED, "true");
  assert.equal(environment.allow_demo_seed, "left-over-parent-value");
});

test("local demo setup stops at the first failing step and keeps its non-zero exit code", async () => {
  const calls = [];

  await assert.rejects(
    runLocalDemoSetup({
      environment: {},
      report() {},
      async runStep({ step }) {
        calls.push(step);
        return step === "db:migrate" ? 23 : 0;
      },
    }),
    (error) => {
      assert.ok(error instanceof LocalDemoStepError);
      assert.equal(error.step, "db:migrate");
      assert.equal(error.exitCode, 23);
      return true;
    },
  );

  assert.deepEqual(calls, ["db:up", "db:migrate"]);
});

test("local demo setup refuses deployment environments before running a step", async () => {
  for (const environment of [
    { NODE_ENV: "production" },
    { REELAY_DEPLOYMENT_MODE: "preview" },
    { VERCEL_ENV: "production" },
    { VERCEL: "1" },
  ]) {
    let ranStep = false;
    await assert.rejects(
      runLocalDemoSetup({
        environment,
        report() {},
        async runStep() {
          ranStep = true;
          return 0;
        },
      }),
      /disabled in production and preview deployments/,
    );
    assert.equal(ranStep, false);
  }
});

test("local demo setup accepts loopback URLs and refuses remote database targets without leaking credentials", () => {
  assert.doesNotThrow(() => assertLocalDemoEnvironment({}));
  assert.doesNotThrow(() =>
    assertLocalDemoEnvironment({
      DATABASE_URL: "postgresql://reelay:local@127.0.0.1:54329/reelay",
    }),
  );
  assert.doesNotThrow(() =>
    assertLocalDemoEnvironment({
      MIGRATION_DATABASE_URL: "postgres://reelay:local@[::1]:54329/reelay?sslmode=disable",
    }),
  );

  assert.throws(
    () =>
      assertLocalDemoEnvironment({
        MIGRATION_DATABASE_URL: "postgresql://remote-user:do-not-print@db.example.com/reelay",
      }),
    (error) => {
      assert.match(error.message, /must target localhost/);
      assert.doesNotMatch(error.message, /do-not-print/);
      return true;
    },
  );

  assert.throws(
    () =>
      assertLocalDemoEnvironment({
        DATABASE_URL: "postgresql://local-user:do-not-print@127.0.0.1/reelay?host=remote.example.com",
      }),
    (error) => {
      assert.match(error.message, /must not override its host/);
      assert.doesNotMatch(error.message, /do-not-print/);
      assert.doesNotMatch(error.message, /remote\.example\.com/);
      return true;
    },
  );

  assert.throws(
    () =>
      assertLocalDemoEnvironment({
        database_url: "postgresql://local-user:local@127.0.0.1/reelay",
        DATABASE_URL: "postgresql://remote-user:do-not-print@db.example.com/reelay",
      }),
    (error) => {
      assert.match(error.message, /Ambiguous DATABASE_URL/);
      assert.doesNotMatch(error.message, /do-not-print/);
      return true;
    },
  );
});
