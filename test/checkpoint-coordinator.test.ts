import { env } from "cloudflare:workers";
import { abortAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Env } from "../src/env.js";
import {
  CheckpointCoordinator,
  type CheckpointDriver,
  type SessionGeneration,
} from "../src/checkpoint-coordinator.js";

const bindings = env as unknown as Env;
const session = () => bindings.SESSIONS.getByName(crypto.randomUUID());
const initial = { facet: "session:initial", epoch: 0 };
const runtime = "fixture-runtime-v1";

// Application-owned fixture data exercises journal/fence failures. The separate
// native-facet probe qualifies actual Pi/Code Mode copying; this is not that proof.
function driver(storage: DurableObjectStorage): CheckpointDriver {
  const key = (facet: string) => `fixture:facet:${facet}`;
  return {
    async quiesce(source) {
      const value = storage.kv.get(key(source.facet));
      if (!value) throw new Error("Missing fixture source");
      return JSON.stringify(value);
    },
    abort() {},
    clone(source, destination) {
      const value = storage.kv.get(key(source));
      if (!value) throw new Error("Missing immutable source");
      storage.kv.put(key(destination), value);
    },
    async validate(candidate, proof) {
      if (JSON.stringify(storage.kv.get(key(candidate))) !== proof)
        throw new Error("Candidate integrity mismatch");
    },
    async activate(generation) {
      const seen =
        storage.kv.get<SessionGeneration[]>("fixture:activations") ?? [];
      if (
        !seen.some(
          (old) =>
            old.epoch === generation.epoch && old.facet === generation.facet,
        )
      )
        storage.kv.put("fixture:activations", [...seen, generation]);
    },
  };
}
const seed = (storage: DurableObjectStorage) =>
  storage.kv.put("fixture:facet:session:initial", {
    memory: "Aurora",
    pending: { id: "same-execution", sequence: 1, expiresAt: 123 },
  });

test("backup freezes admission; a lost copy acknowledgement retries only its inactive destination after restart", async () => {
  let stub = session();
  await runInDurableObject(stub, async (_object, ctx) => {
    seed(ctx.storage);
    const platform = driver(ctx.storage);
    const nativeClone = platform.clone;
    platform.clone = (from, to) => {
      nativeClone(from, to);
      throw new Error("Lost copy acknowledgement");
    };
    const recovery = new CheckpointCoordinator(ctx.storage, runtime, platform);
    const receipt = recovery.beginBackup("one");
    expect(recovery.beginBackup("one")).toEqual(receipt);
    expect(() => recovery.assertActive(initial)).toThrow("frozen");
    expect(() => recovery.beginBackup("two")).toThrow("pending");
    await expect(recovery.advance("one")).rejects.toThrow("Lost copy");
    expect(recovery.operation("one")).toMatchObject({
      phase: "copying",
      failures: 1,
    });
    expect(recovery.checkpoints()).toEqual([]);
    expect(ctx.storage.kv.get("fixture:facet:snapshot:one")).toEqual(
      ctx.storage.kv.get("fixture:facet:session:initial"),
    );
  });
  await abortAllDurableObjects();
  stub = bindings.SESSIONS.get(stub.id);
  await runInDurableObject(stub, async (_object, ctx) => {
    const recovery = new CheckpointCoordinator(
      ctx.storage,
      runtime,
      driver(ctx.storage),
    );
    expect(() => recovery.assertActive(initial)).toThrow("frozen");
    expect(await recovery.advance("one")).toMatchObject({
      phase: "done",
      failures: 1,
    });
    expect(recovery.checkpoints()).toHaveLength(1);
    expect(() => recovery.assertActive(initial)).not.toThrow();
    expect(await recovery.advance("one")).toEqual(recovery.operation("one"));
  });
});

test("failed validation never promotes a candidate, and cancellation preserves both source and checkpoint", async () => {
  await runInDurableObject(session(), async (_object, ctx) => {
    seed(ctx.storage);
    const platform = driver(ctx.storage);
    const recovery = new CheckpointCoordinator(ctx.storage, runtime, platform);
    recovery.beginBackup("before");
    await recovery.advance("before");
    const checkpoint = ctx.storage.kv.get("fixture:facet:snapshot:before");
    ctx.storage.kv.put("fixture:facet:session:initial", {
      memory: "Newer conversation",
    });
    const source = ctx.storage.kv.get("fixture:facet:session:initial");
    recovery.beginRestore("restore", "before");
    const validate = platform.validate;
    platform.validate = async () => {
      throw new Error("Unverified destination");
    };
    await expect(recovery.advance("restore")).rejects.toThrow("Unverified");
    expect(recovery.status().active).toEqual(initial);
    expect(() => recovery.assertActive(initial)).toThrow("frozen");
    await recovery.cancel("restore");
    expect(recovery.status().active).toEqual(initial);
    expect(() => recovery.assertActive(initial)).not.toThrow();
    expect(ctx.storage.kv.get("fixture:facet:snapshot:before")).toEqual(
      checkpoint,
    );
    expect(ctx.storage.kv.get("fixture:facet:session:initial")).toEqual(source);
    platform.validate = validate;
    recovery.beginRestore("retry-with-new-id", "before");
    await recovery.advance("retry-with-new-id");
    expect(() => recovery.assertActive(initial)).toThrow("no longer active");
    const active = recovery.status().active;
    expect(active.epoch).toBe(1);
    expect(ctx.storage.kv.get(`fixture:facet:${active.facet}`)).toEqual(
      checkpoint,
    );
    expect(() => recovery.assertActive(active)).not.toThrow();
  });
});

test("lost activation acknowledgement keeps both generations fenced and resumes the same promotion after restart", async () => {
  let stub = session();
  await runInDurableObject(stub, async (_object, ctx) => {
    seed(ctx.storage);
    const platform = driver(ctx.storage);
    const recovery = new CheckpointCoordinator(ctx.storage, runtime, platform);
    recovery.beginBackup("one");
    await recovery.advance("one");
    const activate = platform.activate;
    platform.activate = async (generation) => {
      await activate(generation);
      throw new Error("Lost activation acknowledgement");
    };
    recovery.beginRestore("restore", "one");
    await expect(recovery.advance("restore")).rejects.toThrow(
      "Lost activation",
    );
    expect(recovery.status().active.epoch).toBe(1);
    expect(() => recovery.assertActive(initial)).toThrow("no longer active");
    expect(() => recovery.assertActive(recovery.status().active)).toThrow(
      "frozen",
    );
    await expect(recovery.cancel("restore")).rejects.toThrow(
      "Activation must finish",
    );
  });
  await abortAllDurableObjects();
  stub = bindings.SESSIONS.get(stub.id);
  await runInDurableObject(stub, async (_object, ctx) => {
    const recovery = new CheckpointCoordinator(
      ctx.storage,
      runtime,
      driver(ctx.storage),
    );
    await recovery.advance("restore");
    expect(recovery.status().active).toEqual({
      facet: "session:restored:restore",
      epoch: 1,
    });
    expect(
      ctx.storage.kv.get<SessionGeneration[]>("fixture:activations"),
    ).toHaveLength(2);
    expect(() => recovery.assertActive(initial)).toThrow("no longer active");
    expect(() => recovery.assertActive(recovery.status().active)).not.toThrow();
  });
});

test("runtime mismatches, conflicting IDs and retention limits refuse without replacing existing data", async () => {
  await runInDurableObject(session(), async (_object, ctx) => {
    seed(ctx.storage);
    const platform = driver(ctx.storage);
    const recovery = new CheckpointCoordinator(ctx.storage, runtime, platform);
    for (const id of ["one", "two", "three"]) {
      recovery.beginBackup(id);
      await recovery.advance(id);
    }
    expect(() => recovery.beginBackup("four")).toThrow("three-checkpoint");
    expect(() => recovery.beginRestore("one", "two")).toThrow("conflict");
    expect(() => recovery.beginRestore("missing", "missing")).toThrow(
      "Unknown",
    );
    const changed = new CheckpointCoordinator(
      ctx.storage,
      "different-runtime",
      platform,
    );
    expect(() => changed.beginRestore("incompatible", "one")).toThrow(
      "matching runtime",
    );
    recovery.beginRestore("pending", "one");
    await expect(changed.advance("pending")).rejects.toThrow(
      "matching runtime",
    );
    expect(recovery.operation("pending")).toMatchObject({
      phase: "quiescing",
      failures: 0,
    });
    expect(recovery.checkpoints()).toHaveLength(3);
    await recovery.cancel("pending");
    expect(recovery.status().active).toEqual(initial);
  });
});
