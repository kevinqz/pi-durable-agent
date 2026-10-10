// UI explanations only. The authenticated supervisor enforces every admission.
export function checkpointAvailability(state) {
  const recovery = state.recovery;
  if (!recovery) return {};
  let waiting;
  if (state.recovering || recovery.busy)
    waiting = "Finish the current recovery operation before starting another.";
  else if (state.runtime?.codeUpdatePending)
    waiting = "Session code is updating. Wait for the current work to finish.";
  else if (
    state.progress.activeTasks !== 0 ||
    state.requests.some(
      (request) =>
        !["completed", "failed", "cancelled"].includes(request.status),
    )
  )
    waiting = "Wait for conversation and memory work to finish.";
  else if (state.actions.some((action) => action.status === "unknown"))
    waiting =
      "An action has an unknown outcome. Inspect it before using checkpoints.";
  else if (
    state.actions.some(
      (action) => action.status !== "pending" && !action.delivered,
    )
  )
    waiting =
      "Wait for actions and their saved results to finish. Human approvals may stay pending.";

  if (waiting) return { createReason: waiting, restoreReason: waiting };

  const exhausted =
    recovery.operations >= recovery.limits.operations
      ? `All ${recovery.limits.operations} create/restore admissions have been used. Existing checkpoints are retained; this session cannot admit another recovery operation.`
      : undefined;
  return {
    createReason:
      recovery.backupUnavailableReason ??
      exhausted ??
      (recovery.checkpoints.length >= recovery.limits.checkpoints
        ? `All ${recovery.limits.checkpoints} checkpoint slots are occupied. Existing copies are retained; no checkpoint is removed automatically.`
        : undefined),
    restoreReason:
      exhausted ??
      (recovery.restores >= recovery.limits.restores
        ? `All ${recovery.limits.restores} restore admissions have been used. Existing checkpoints are retained.`
        : undefined),
  };
}
