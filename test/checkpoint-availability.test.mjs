import assert from "node:assert/strict";
import { test } from "node:test";
import { checkpointAvailability } from "../public/checkpoint-availability.js";

const idle = () => ({
  progress: { activeTasks: 0 },
  requests: [{ status: "completed" }],
  actions: [{ status: "pending" }],
  recovery: {
    operations: 1,
    restores: 0,
    checkpoints: [{ compatible: true }],
    limits: { checkpoints: 3, restores: 8, operations: 24 },
  },
});

test("idle sessions allow checkpoints while an exact human approval remains pending", () => {
  assert.deepEqual(checkpointAvailability(idle()), {
    createReason: undefined,
    restoreReason: undefined,
  });
});

test("three retained checkpoints block creation but do not block a compatible restore", () => {
  const state = idle();
  state.recovery.checkpoints = [
    { compatible: true },
    { compatible: false },
    { compatible: false },
  ];
  const result = checkpointAvailability(state);
  assert.match(result.createReason, /All 3 checkpoint slots/);
  assert.equal(result.restoreReason, undefined);
});

test("all 24 admissions block creation and restoration even with an empty catalog", () => {
  const state = idle();
  state.recovery.operations = 24;
  state.recovery.checkpoints = [];
  const result = checkpointAvailability(state);
  assert.match(result.createReason, /All 24 create\/restore admissions/);
  assert.equal(result.restoreReason, result.createReason);
});

test("the restore allowance does not consume an available checkpoint slot", () => {
  const state = idle();
  state.recovery.restores = 8;
  const result = checkpointAvailability(state);
  assert.equal(result.createReason, undefined);
  assert.match(result.restoreReason, /All 8 restore admissions/);
});

test("recovery responses without conversation fields still explain the admission fence", () => {
  const result = checkpointAvailability({
    recovering: true,
    recovery: { busy: { id: "restore" } },
  });
  assert.match(result.createReason, /Finish the current recovery/);
  assert.equal(result.restoreReason, result.createReason);
  assert.deepEqual(checkpointAvailability({}), {});
});

test("work, uncertain effects and runtime updates explain why admission must wait", () => {
  for (const [change, message] of [
    [{ progress: { activeTasks: 1 } }, /conversation and memory/],
    [{ requests: [{ status: "preparing" }] }, /conversation and memory/],
    [{ actions: [{ status: "unknown", delivered: true }] }, /unknown outcome/],
    [{ actions: [{ status: "completed", delivered: false }] }, /saved results/],
    [{ runtime: { codeUpdatePending: true } }, /Session code is updating/],
  ]) {
    const result = checkpointAvailability({ ...idle(), ...change });
    assert.match(result.createReason, message);
    assert.equal(result.restoreReason, result.createReason);
  }
});
