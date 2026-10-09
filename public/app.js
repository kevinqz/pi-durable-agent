const $ = (id) => document.getElementById(id);
let session = location.hash.slice(1);
if (!/^[a-zA-Z0-9_-]{1,96}$/.test(session)) {
  session = crypto.randomUUID();
  history.replaceState(null, "", `#${session}`);
}
let pendingSend;
let pendingKey;
let refreshing = false;
let renderedHistory = "";
let renderedActions = "";
let viewedArchive;
async function api(path, body) {
  const response = await fetch(
    `/api/sessions/${session}/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({}))).error ??
        `Request failed (${response.status})`,
    );
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
    $("connection").textContent = "Connected · saved state";
    $("mode").textContent = state.mode === "demo" ? "Demo model" : "Workers AI";
    $("notice").textContent =
      state.mode === "demo"
        ? "No AI model is called. Replies are simulated; storage, memory and recovery use the real runtimes."
        : "Model calls use your Cloudflare account. Each session has separate durable memory.";
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
  } catch (error) {
    $("connection").textContent = "Disconnected · reconnecting";
    showError(error);
  } finally {
    refreshing = false;
  }
}
function showError(error) {
  $("error").textContent = error.message;
}
$("composer").onsubmit = async (event) => {
  event.preventDefault();
  const text = $("prompt").value;
  // Preserve an uncertain submission's id so a retry cannot duplicate it.
  if (!pendingSend || pendingSend.text !== text)
    pendingSend = { id: crypto.randomUUID(), text };
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
    button.disabled = false;
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
$("new-session").onclick = () => {
  location.hash = crypto.randomUUID();
  location.reload();
};
$("demo-action").onclick = () => {
  $("prompt").value = "/demo-note";
  $("composer").requestSubmit();
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
  pendingKey = `pending:${me.scope}:${session}`;
  try {
    pendingSend = JSON.parse(sessionStorage.getItem(pendingKey));
  } catch {
    pendingSend = undefined;
  }
  if (pendingSend) $("prompt").value = pendingSend.text;
  $("demo-action").hidden = me.mode !== "demo";
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 2000);
  await refresh();
}
start().catch(showError);
