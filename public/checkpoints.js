const $ = (id) => document.getElementById(id);
const phases = {
  quiescing: "Checking saved work",
  copying: "Copying the session",
  validating: "Checking the restored copy",
  activating: "Reopening the session",
};

export function checkpointControls({ api, refresh, showError, generation }) {
  let storageKey;
  let pending;
  let recovery;
  let submitting = false;
  let selected;
  let renderedList = "";

  function remember(value) {
    pending = value;
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  }

  async function perform(path, body) {
    if (submitting) return;
    submitting = true;
    remember({ path, body });
    $("checkpoint-create").disabled = true;
    $("checkpoint-retry-request").disabled = true;
    try {
      const result = await api(`checkpoints/${path}`, body);
      if (["done", "cancelled"].includes(result.phase)) remember(undefined);
      $("error").textContent = "";
    } catch (error) {
      // A lost reply is retried with this exact operation ID, never a new copy.
      // A definite refusal (for example a stale generation) is not an uncertain
      // admission: allow a fresh, reviewed request after refreshing the state.
      if (error.status >= 400 && error.status < 500) remember(undefined);
      showError(error);
    } finally {
      submitting = false;
      $("checkpoint-retry-request").disabled = false;
      await refresh();
    }
  }

  $("checkpoint-create").onclick = () =>
    perform("create", {
      id: crypto.randomUUID(),
      expectedGeneration: generation(),
    });
  $("checkpoint-resume").onclick = () =>
    recovery?.busy && perform("resume", { id: recovery.busy.id });
  $("checkpoint-cancel").onclick = () =>
    recovery?.busy && perform("cancel", { id: recovery.busy.id });
  $("checkpoint-retry-request").onclick = () =>
    pending && perform(pending.path, pending.body);
  $("checkpoint-close-dialog").onclick = () => $("checkpoint-dialog").close();
  $("checkpoint-confirm-restore").onclick = async () => {
    if (!selected) return;
    const request = selected;
    selected = undefined;
    $("checkpoint-dialog").close();
    await perform("restore", {
      id: crypto.randomUUID(),
      checkpointId: request.id,
      expectedGeneration: request.generation,
    });
  };

  return {
    bind(key) {
      storageKey = `${key}:checkpoint`;
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey));
        if (
          saved &&
          ["create", "restore", "resume", "cancel"].includes(saved.path) &&
          /^[a-zA-Z0-9_-]{1,96}$/.test(saved.body?.id)
        )
          pending = saved;
      } catch {
        /* No valid uncertain operation to recover. */
      }
    },
    async render(state) {
      recovery = state.recovery;
      $("checkpoint-panel").hidden = !state.capabilities?.coordinatedCheckpoint;
      if (!recovery) return;
      if (pending) {
        // Reading the saved receipt also handles another client having completed
        // a later operation since this browser lost its acknowledgement.
        try {
          const receipt = await api(
            `checkpoints/operations/${pending.body.id}`,
          );
          if (["done", "cancelled"].includes(receipt.phase))
            remember(undefined);
        } catch {
          /* Keep the request ID and offer an explicit retry. */
        }
      }
      const busy = recovery.busy;
      const uncertain = pending && pending.body.id !== busy?.id;
      $("checkpoint-retry-request").hidden = !uncertain;
      $("checkpoint-resume").hidden = !busy || !!recovery.nextAttemptAt;
      $("checkpoint-cancel").hidden = !busy || busy.phase === "activating";
      $("checkpoint-resume").disabled = $("checkpoint-cancel").disabled =
        submitting;
      const status = uncertain
        ? "The last request was not confirmed. Retry it with the saved request ID."
        : busy
          ? `${phases[busy.phase] ?? "Recovery in progress"}. Messages and approvals are paused.${busy.failures ? ` ${busy.failures} failed attempt(s). ${recovery.nextAttemptAt ? "A retry is scheduled." : "Review, then resume or cancel."}` : ""}${busy.lastFailure?.code === "state-mismatch" ? ` Saved state differs in: ${busy.lastFailure.parts.join(", ")}.` : ""}`
          : recovery.latest?.phase === "done"
            ? recovery.latest.kind === "backup"
              ? "Checkpoint saved."
              : "Session restored. Review pending approvals before continuing."
            : recovery.latest?.phase === "cancelled"
              ? "Recovery cancelled. The current session was retained."
              : "Create a checkpoint when messages and summaries have finished.";
      if ($("checkpoint-status").textContent !== status)
        $("checkpoint-status").textContent = status;
      const idle =
        !state.recovering &&
        state.progress.activeTasks === 0 &&
        state.requests.every((r) =>
          ["completed", "failed", "cancelled"].includes(r.status),
        ) &&
        state.actions.every(
          (a) =>
            a.status === "pending" || (a.status !== "unknown" && a.delivered),
        );
      $("checkpoint-create").disabled =
        submitting ||
        !!pending ||
        !!busy ||
        !idle ||
        recovery.checkpoints.length >= recovery.limits.checkpoints ||
        recovery.operations >= recovery.limits.operations;
      $("checkpoint-allowance").textContent =
        `${recovery.checkpoints.length}/${recovery.limits.checkpoints} checkpoints retained · ${recovery.restores}/${recovery.limits.restores} restore admissions used`;
      const listKey = JSON.stringify([
        recovery.checkpoints,
        submitting,
        !!pending,
        !!busy,
        idle,
        recovery.restores,
        recovery.operations,
      ]);
      if (listKey === renderedList) return;
      renderedList = listKey;
      $("checkpoint-list").replaceChildren(
        ...recovery.checkpoints.map((checkpoint) => {
          const item = document.createElement("div");
          item.className = "checkpoint";
          const label = document.createElement("span");
          label.textContent = new Date(checkpoint.createdAt).toLocaleString();
          const restore = document.createElement("button");
          restore.type = "button";
          restore.textContent = checkpoint.compatible
            ? "Restore…"
            : "Requires its original runtime";
          restore.disabled =
            submitting ||
            !!pending ||
            !!busy ||
            !idle ||
            !checkpoint.compatible ||
            recovery.restores >= recovery.limits.restores ||
            recovery.operations >= recovery.limits.operations;
          restore.onclick = () => {
            selected = { id: checkpoint.id, generation: generation() };
            $("checkpoint-target").textContent = label.textContent;
            $("checkpoint-dialog").showModal();
          };
          item.append(label, restore);
          return item;
        }),
      );
    },
  };
}
