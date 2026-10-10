import { digest, HttpError } from "./http.js";

type Evidence = { format: 1; parts: Record<string, string> };

/** Hashes identify a mismatching component without retaining its private content. */
export async function checkpointEvidence(parts: Record<string, unknown>) {
  const hashes: Record<string, string> = {};
  for (const [name, value] of Object.entries(parts))
    hashes[name] = await digest(JSON.stringify({ value }));
  return JSON.stringify({ format: 1, parts: hashes } satisfies Evidence);
}

export class CheckpointMismatch extends HttpError {
  constructor(readonly parts: string[]) {
    super(409, "Copied state did not match the checkpoint evidence");
  }
}

export function compareCheckpointEvidence(expected: string, actual: string) {
  const read = (text: string): Evidence => {
    const value = JSON.parse(text) as Evidence;
    if (
      value.format !== 1 ||
      !value.parts ||
      typeof value.parts !== "object" ||
      Array.isArray(value.parts) ||
      Object.keys(value.parts).length > 32 ||
      Object.entries(value.parts).some(
        ([name, hash]) =>
          !/^[a-zA-Z.]{1,64}$/.test(name) ||
          typeof hash !== "string" ||
          !/^[a-f0-9]{64}$/.test(hash),
      )
    )
      throw new HttpError(409, "Unsupported checkpoint evidence format");
    return value;
  };
  const from = read(expected);
  const to = read(actual);
  const names = [
    ...new Set([...Object.keys(from.parts), ...Object.keys(to.parts)]),
  ];
  const changed = names.filter((name) => from.parts[name] !== to.parts[name]);
  if (changed.length) throw new CheckpointMismatch(changed);
}
