import { checkpointControls } from "./checkpoints.js";
const $ = (id) => document.getElementById(id);
let session = location.hash.slice(1);
if (!/^(?:c1:)?[a-zA-Z0-9_-]{1,96}$/.test(session)) session = "";
let pendingSend;
let pendingKey;
let refreshing = false;
let renderedHistory = "";
let renderedActions = "";
let renderedRequests = "";
let viewedArchive;
let runtime;
let exporting = false;
let generation;
let checkpointSessions = false;
let recoveryLocked = false;
const checkpoints = checkpointControls({
  api,
  refresh,
  showError,
  generation: () => generation,
});
async function api(path, body, targetSession = session) {
  const coordinated = targetSession.startsWith("c1:");
  const target = coordinated ? targetSession.slice(3) : targetSession;
  const payload =
    coordinated && body ? { expectedGeneration: generation, ...body } : body;
  const response = await fetch(
    `/api/${coordinated ? "checkpoint-sessions" : "sessions"}/${target}/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      : {},
  );
  if (!response.ok) {
    const error = new Error(
      (await response.json().catch(() => ({}))).error ??
        `Request failed (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
async function refresh() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const state = await api("state");
    await checkpoints.render(state);
    recoveryLocked = !!state.recovering;
    if (state.recovering) {
      setText("connection", "Connected · recovery in progress");
      setSessionEnabled(false);
      return;
    }
    if (state.recovery) {
      if (
        generation !== undefined &&
        generation !== state.recovery.generation
      ) {
        pendingSend = undefined;
        sessionStorage.removeItem(pendingKey);
        renderedHistory = renderedActions = renderedRequests = "";
        viewedArchive = undefined;
        $("archive").textContent = "";
        $("archive").parentElement.open = false;
        $("search-results").textContent = "";
        if ($("prompt").value)
          $("error").textContent =
            "Session restored. Your draft is kept; review it before sending.";
      }
      generation = state.recovery.generation;
    }
    setSessionEnabled(true);
    $("export-panel").hidden = !state.capabilities?.sessionDataExport;
    $("export-session").disabled = exporting || state.progress.activeTasks > 0;
    runtime = state.runtime;
    $("recovery-panel").hidden = !runtime?.restartEnabled;
    if (runtime?.restartEnabled) {
      $("runtime-version").textContent = `Runtime ${runtime.release}`;
      $("runtime-activation").textContent =
        `Activation ${runtime.activationId}`;
      $("restart-status").textContent = runtime.lastRestart
        ? `Last restart: ${runtime.lastRestart.status} · ${runtime.restartCount}/${runtime.restartLimit} checks used`
        : `No restart requested · ${runtime.restartLimit} checks available`;
      $("restart-session").disabled =
        runtime.restartCount >= runtime.restartLimit ||
        ["scheduled", "aborting"].includes(runtime.lastRestart?.status) ||
        state.progress.activeTasks > 0;
    }
    setText("connection", "Connected · saved state");
    $("mode").textContent = state.mode === "demo" ? "Demo model" : "Workers AI";
    $("demo-action").hidden = state.mode !== "demo";
    $("notice").textContent =
      state.mode === "demo"
        ? "No AI model is called. Replies are simulated; storage, memory and recovery use the real runtimes."
        : `${state.model?.modelId ?? "Workers AI"} · Model calls use your Cloudflare account. Memory summaries also use the model.`;
    $("model-budget").hidden = state.mode === "demo";
    $("model-budget").textContent =
      `${state.progress.modelCalls}/${state.progress.modelCallLimit} model calls reserved, including summaries and failed attempts. This is a session limit, not an account billing cap.`;
    const historyKey = JSON.stringify(state.history.items);
    if (historyKey !== renderedHistory) {
      const messages = state.history.items.map((message) => {
        const item = element("article", "", `message ${message.kind}`);
        const label =
          {
            talk: "Assistant",
            user: "Message",
            tool: "Tool request",
            echo: "Tool receipt",
          }[message.kind] ?? message.kind;
        if (
          ["tool", "echo"].includes(message.kind) ||
          (message.kind === "user" && message.text.length > 300)
        ) {
          const details = element("details", "");
          details.append(
            element("summary", label),
            element("div", message.text),
          );
          item.append(details);
        } else
          item.append(
            element("div", label, "role"),
            element("div", message.text),
          );
        return item;
      });
      $("messages").replaceChildren(...messages);
      renderedHistory = historyKey;
    }
    $("memory").textContent =
      state.memory.view || "Memory will appear after messages are summarized.";
    $("memory-summary").textContent =
      `${state.memory.messages} source messages · ${state.memory.summarized} summarized · ${state.memory.viewBytes} bytes in view`;
    $("progress").textContent =
      `${state.progress.activeTasks} active tasks · ${state.progress.durableWakes} scheduled wakes`;
    renderActions(state.actions);
    const requestKey = JSON.stringify(state.requests.slice(-8));
    if (requestKey !== renderedRequests) {
      renderedRequests = requestKey;
      $("requests").replaceChildren(
        ...state.requests.slice(-8).map((r) => {
          const row = element(
            "div",
            `${r.text.slice(0, 45)} — ${r.status}`,
            "request",
          );
          if (!["completed", "failed", "cancelled"].includes(r.status)) {
            const button = element("button", "Cancel");
            button.onclick = () =>
              api("cancel", { id: r.id }).then(refresh).catch(showError);
            row.append(button);
          }
          return row;
        }),
      );
    }
  } catch (error) {
    setText("connection", "Disconnected · reconnecting");
    showError(error);
  } finally {
    refreshing = false;
  }
}
function showError(error) {
  $("error").textContent = error.message;
}
function setText(id, value) {
  if ($(id).textContent !== value) $(id).textContent = value;
}
function setSessionEnabled(enabled) {
  document
    .querySelectorAll(
      "#composer button, #composer textarea, #search button, #search input, #actions button, #demo-action, #export-session",
    )
    .forEach((control) => {
      control.disabled = !enabled;
    });
}
$("composer").onsubmit = async (event) => {
  event.preventDefault();
  const text = $("prompt").value;
  // Preserve an uncertain submission's id so a retry cannot duplicate it.
  if (!pendingSend || pendingSend.text !== text)
    pendingSend = {
      id: crypto.randomUUID(),
      text,
      expectedGeneration: generation,
    };
  sessionStorage.setItem(pendingKey, JSON.stringify(pendingSend));
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    await api("messages", pendingSend);
    pendingSend = undefined;
    sessionStorage.removeItem(pendingKey);
    $("prompt").value = "";
    $("error").textContent = "";
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = recoveryLocked;
  }
};
$("search").onsubmit = async (event) => {
  event.preventDefault();
  try {
    $("search-results").textContent = JSON.stringify(
      await api("memory/search", { query: $("query").value }),
      null,
      2,
    );
  } catch (error) {
    showError(error);
  }
};
$("new-session").onclick = async () => {
  $("new-session").disabled = true;
  try {
    const next = `${checkpointSessions ? "c1:" : ""}${crypto.randomUUID()}`;
    if ($("model-choice").value)
      await api("configuration", { mode: $("model-choice").value }, next);
    location.hash = next;
    location.reload();
  } catch (error) {
    showError(error);
    $("new-session").disabled = false;
  }
};
$("demo-action").onclick = () => {
  $("prompt").value = "/demo-note";
  $("composer").requestSubmit();
};
$("restart-session").onclick = async () => {
  const activationId = runtime?.activationId;
  if (!activationId) return;
  $("restart-session").disabled = true;
  try {
    await api("recovery/restart", { activationId });
    $("error").textContent = "";
    await refresh();
  } catch (error) {
    showError(error);
    await refresh();
  }
};
$("export-session").onclick = async () => {
  exporting = true;
  $("export-session").disabled = true;
  $("export-status").textContent = "Preparing the session data archive…";
  try {
    const data = await api("exports/session", {});
    const file = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pi-durable-agent-session-${session}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    const messages = data.payload.history.messageCount;
    const actions = data.payload.actions.length;
    $("export-status").textContent =
      `Archive prepared: ${messages} ${messages === 1 ? "message" : "messages"}, ${actions} ${actions === 1 ? "action" : "actions"}. Check your browser downloads. SHA-256: ${data.integrity.sha256}`;
    $("error").textContent = "";
  } catch (error) {
    $("export-status").textContent = "No archive created.";
    showError(error);
  } finally {
    exporting = false;
    await refresh();
  }
};
function renderActions(actions) {
  const key = JSON.stringify(actions);
  if (key === renderedActions) return;
  renderedActions = key;
  // An open detail belongs to one recorded outcome, not just an action ID.
  if (viewedArchive) {
    const current = actions.find((a) => a.id === viewedArchive.id);
    if (!current || archiveKey(current) !== viewedArchive.key) {
      viewedArchive = undefined;
      $("archive").textContent = "";
      $("archive").parentElement.open = false;
    }
  }
  $("actions").replaceChildren(
    ...actions
      .slice(-10)
      .reverse()
      .map((a) => {
        const item = element("article", "", "approval");
        item.append(element("strong", `${a.label} — ${a.status}`));
        const details = element("details", "");
        details.open = a.status === "pending";
        details.append(
          element("summary", "Code and exact operation"),
          element("pre", a.code),
          element("pre", JSON.stringify(a.pending ?? a.result ?? {}, null, 2)),
          element("p", `Contract: ${a.contract}`),
        );
        item.append(details);
        if (a.error) item.append(element("p", a.error));
        if (a.status === "pending") {
          item.append(
            element("p", `Expires ${new Date(a.expiresAt).toLocaleString()}`),
          );
          for (const decision of ["approve", "reject"]) {
            const button = element(
              "button",
              decision === "approve" ? "Approve this operation" : "Reject",
            );
            button.onclick = async () => {
              button.disabled = true;
              try {
                await api("actions/decide", {
                  id: a.id,
                  decision,
                  fingerprint: a.fingerprint,
                });
                await refresh();
              } catch (error) {
                showError(error);
              } finally {
                button.disabled = false;
              }
            };
            item.append(button);
          }
        }
        if (
          a.status === "unknown" ||
          (["completed", "failed", "rejected", "expired"].includes(a.status) &&
            !a.delivered)
        ) {
          const inspect = element(
            "button",
            a.status === "unknown"
              ? "Inspect saved outcome"
              : "Deliver saved result",
          );
          inspect.onclick = () =>
            api("actions/inspect", { id: a.id }).then(refresh).catch(showError);
          item.append(
            inspect,
            element(
              "p",
              "This does not repeat the action. An unknown outcome may require operator reconciliation.",
            ),
          );
        }
        if (a.archive && ["completed", "failed"].includes(a.status)) {
          const archive = element("button", "View retained output");
          archive.onclick = async () => {
            const selection = { id: a.id, key: archiveKey(a) };
            viewedArchive = selection;
            $("archive").textContent = "Loading retained output…";
            $("archive").parentElement.open = true;
            try {
              const output = await api("actions/archive", { id: a.id });
              if (viewedArchive !== selection) return;
              // Older executions may only retain an intermediate pause marker.
              $("archive").textContent =
                output.error === "__CODEMODE_PAUSE__"
                  ? "No final output was retained. Review the recorded outcome above."
                  : JSON.stringify(output, null, 2);
            } catch (error) {
              if (viewedArchive !== selection) return;
              $("archive").textContent = "Could not load retained output.";
              showError(error);
            }
          };
          item.append(archive);
        }
        return item;
      }),
  );
  if (!actions.length) $("actions").textContent = "No actions yet.";
}
function archiveKey(action) {
  return JSON.stringify([action.id, action.status, action.archive]);
}
async function start() {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error("Sign in to reconnect this session.");
  const me = await response.json();
  checkpointSessions = !!me.checkpointSessions;
  if (!session) {
    session = `${checkpointSessions ? "c1:" : ""}${crypto.randomUUID()}`;
    history.replaceState(null, "", `#${session}`);
  }
  pendingKey = `pending:${me.scope}:${session}`;
  checkpoints.bind(pendingKey);
  try {
    pendingSend = JSON.parse(sessionStorage.getItem(pendingKey));
  } catch {
    pendingSend = undefined;
  }
  if (pendingSend) $("prompt").value = pendingSend.text;
  if (me.models?.length) {
    $("model-choice").replaceChildren(
      ...me.models.map((model) => {
        const option = element(
          "option",
          model.mode === "demo"
            ? "Demo — no model calls"
            : `${model.modelId} — ${model.callLimit} calls per session`,
        );
        option.value = model.mode;
        return option;
      }),
    );
    $("model-choice").value = me.mode;
    $("model-choice-label").hidden = me.models.length < 2;
  }
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 2000);
  await refresh();
}
start().catch(showError);
