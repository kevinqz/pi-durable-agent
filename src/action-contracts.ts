import {
  CONTRACT_V1,
  type Action,
  type ActionsStore,
} from "./actions-store.js";
import { HttpError } from "./http.js";
import { NotesV1, type NotesDestination } from "./notes.js";

export type ActionAdmission = {
  id: string;
  code: string;
  label: string;
  contract?: string;
};

// Retain an implementation while any saved action can still refer to it.
// Changing the default must never change the interpretation of an old job.
export const CURRENT_CONTRACT = CONTRACT_V1;
const implementations = new Map([[CONTRACT_V1, NotesV1]]);

export const supportsContract = (contract: string) =>
  implementations.has(contract);

export function admissionContract(payload: ActionAdmission): string {
  // 0.1.0-dev.0 jobs predate this field and were always admitted with V1.
  return payload.contract === undefined ? CONTRACT_V1 : payload.contract;
}

export function actionConnectors(
  ctx: DurableObjectState,
  store: ActionsStore,
  action: Action,
  destination?: NotesDestination,
) {
  const Connector = implementations.get(action.contract);
  if (!Connector) throw new HttpError(409, "Unsupported action contract");
  return [new Connector(ctx, store, action.id, destination)];
}
