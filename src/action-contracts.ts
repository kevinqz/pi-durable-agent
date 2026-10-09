import {
  CONTRACT_V1,
  type Action,
  type ActionsStore,
} from "./actions-store.js";
import { HttpError } from "./http.js";
import { NotesV1 } from "./notes.js";
import {
  ROOT_NOTES_CONTRACT,
  SupervisorNotes,
  type NotesDestination,
} from "./notes-root.js";

export type ActionAdmission = {
  id: string;
  code: string;
  label: string;
  contract?: string;
};

// Retain an implementation while any saved action can still refer to it.
// Changing the default must never change the interpretation of an old job.
export const CURRENT_CONTRACT = CONTRACT_V1;
export const supportsContract = (contract: string) =>
  contract === CONTRACT_V1 || contract === ROOT_NOTES_CONTRACT;

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
  if (action.contract === CONTRACT_V1 && !destination)
    return [new NotesV1(ctx, store, action.id)];
  if (action.contract === ROOT_NOTES_CONTRACT && destination)
    return [new SupervisorNotes(ctx, store, action.id, destination)];
  throw new HttpError(
    409,
    "Action contract does not match this session's destination",
  );
}
