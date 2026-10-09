import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha256 = (text) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const fail = (message) => {
  throw new Error(message);
};

/** Checks accidental corruption and archive consistency, not publisher identity. */
export function verifySessionExport(data) {
  const p = data?.payload;
  if (
    data?.format !== "pi-durable-agent/session-export-v1" ||
    p?.kind !== "session-data-archive" ||
    p.restorable !== false ||
    p.application?.name !== "pi-durable-agent" ||
    typeof p.application.version !== "string" ||
    p.history?.complete !== true ||
    !Array.isArray(p.history.items) ||
    p.history.messageCount !== p.history.items.length ||
    !Array.isArray(p.requests) ||
    !Array.isArray(p.actions) ||
    !Array.isArray(p.retainedOutputs) ||
    p.coverage?.runtimeCheckpoint !== false ||
    p.coverage.approvalAuthority !== false
  )
    fail("Unsupported or incomplete session data archive");
  if (
    data.integrity?.algorithm !== "SHA-256" ||
    data.integrity.encoding !== "UTF-8 JSON.stringify(payload)" ||
    data.integrity.sha256 !== sha256(JSON.stringify(p))
  )
    fail("Payload integrity check failed");

  const actions = new Map();
  for (const action of p.actions) {
    if (typeof action?.id !== "string" || actions.has(action.id))
      fail("Invalid or duplicate action identity");
    actions.set(action.id, action);
  }
  const outputs = new Set();
  for (const output of p.retainedOutputs) {
    const action = actions.get(output?.actionId);
    if (
      !action ||
      outputs.has(output.actionId) ||
      output.statusAtExport !== action.status
    )
      fail("Retained output does not match a unique action record");
    if (
      typeof output.text !== "string" ||
      output.bytes !== Buffer.byteLength(output.text, "utf8") ||
      output.sha256 !== sha256(output.text)
    )
      fail("Retained output integrity check failed");
    if (action.archive) {
      if (
        output.recordedReferenceVerified !== true ||
        action.archive.sha256 !== output.sha256 ||
        action.archive.bytes !== output.bytes
      )
        fail("Recorded action archive reference does not match its output");
    } else if (output.recordedReferenceVerified !== null) {
      fail("An output without a recorded reference must be marked unverified");
    }
    outputs.add(output.actionId);
  }
  if (p.actions.some((action) => action.archive && !outputs.has(action.id)))
    fail("A referenced action output is missing");
  return {
    integrity: "valid",
    applicationVersion: p.application.version,
    messages: p.history.messageCount,
    actions: p.actions.length,
    retainedOutputs: outputs.size,
    sha256: data.integrity.sha256,
    restorable: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: npm run export:verify -- /path/to/session.json\nChecks a session data archive offline. Does not restore state or verify the author's identity.",
    );
  } else {
    try {
      if (args.length !== 1)
        fail("Provide one session JSON file. Use --help for usage.");
      const file = resolve(args[0]);
      if ((await stat(file)).size > 8_000_000)
        fail("Archive exceeds the 8 MB format limit");
      const bytes = await readFile(file);
      if (bytes.length > 8_000_000)
        fail("Archive exceeds the 8 MB format limit");
      console.log(
        JSON.stringify(
          verifySessionExport(JSON.parse(bytes.toString("utf8"))),
          null,
          2,
        ),
      );
    } catch (error) {
      // Do not echo private conversation text from a JSON parser error.
      console.error(
        error instanceof SyntaxError ? "Invalid JSON archive" : error.message,
      );
      process.exitCode = 1;
    }
  }
}
