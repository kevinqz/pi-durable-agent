import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { verifySessionExport } from "../scripts/verify-session-export.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");
test("offline verifier accepts a consistent archive and rejects changed data and missing output", () => {
  const text = JSON.stringify({ result: "Ação 🌱" });
  const reference = { bytes: Buffer.byteLength(text), sha256: hash(text) };
  const payload = {
    kind: "session-data-archive",
    restorable: false,
    application: { name: "pi-durable-agent", version: "test" },
    history: { complete: true, messageCount: 1, items: [{ text: "Original" }] },
    requests: [],
    actions: [{ id: "note", status: "completed", archive: reference }],
    retainedOutputs: [
      {
        actionId: "note",
        statusAtExport: "completed",
        text,
        ...reference,
        recordedReferenceVerified: true,
      },
    ],
    coverage: { runtimeCheckpoint: false, approvalAuthority: false },
  };
  const archive = {
    format: "pi-durable-agent/session-export-v1",
    payload,
    integrity: {
      algorithm: "SHA-256",
      encoding: "UTF-8 JSON.stringify(payload)",
      sha256: hash(JSON.stringify(payload)),
    },
  };
  assert.equal(verifySessionExport(archive).messages, 1);
  payload.history.items[0].text = "Modified";
  assert.throws(() => verifySessionExport(archive), /Payload integrity/);
  payload.retainedOutputs = [];
  archive.integrity.sha256 = hash(JSON.stringify(payload));
  assert.throws(() => verifySessionExport(archive), /output is missing/);
});
