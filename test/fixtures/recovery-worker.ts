// Test-only composition. Production routing and existing namespaces are unchanged.
export { AgentSession } from "../../src/session.js";
import { SessionFacet } from "../../src/session-supervisor.js";
export {
  SessionSupervisor,
  SessionFacet,
} from "../../src/session-supervisor.js";
// Test-only previous-code identity over the same real session implementation.
export class PriorSessionFacet extends SessionFacet {
  setBusyForUpdateTest(busy: boolean) {
    this.ctx.storage.kv.put("test:code-update-busy", busy);
  }
  override async prepareCheckpoint() {
    if (this.ctx.storage.kv.get("test:code-update-busy"))
      return {
        ready: false as const,
        error: "Busy fixture",
        runtime: "previous-build",
      };
    return { ...(await super.prepareCheckpoint()), runtime: "previous-build" };
  }
}
export { CodemodeRuntime } from "@cloudflare/codemode";
export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
