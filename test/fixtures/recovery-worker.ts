// Test-only composition. Production routing and existing namespaces are unchanged.
export { AgentSession } from "../../src/session.js";
export {
  SessionSupervisor,
  SessionFacet,
} from "../../src/session-supervisor.js";
export { CodemodeRuntime } from "@cloudflare/codemode";
export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
