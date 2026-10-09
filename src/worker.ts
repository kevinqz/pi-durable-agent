import { authenticate, sameOrigin } from "./auth.js";
import { LIMITS, type Env } from "./env.js";
import { digest, HttpError, identifier, json, readJson } from "./http.js";
import { modelProfile } from "./session-model.js";
export { AgentSession } from "./session.js";
export { CodemodeRuntime } from "@cloudflare/codemode";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const principal = await authenticate(request, env);
      const url = new URL(request.url);
      if (url.pathname === "/api/me")
        return json({
          mode: env.MODEL_MODE,
          local: env.APP_ENV === "local",
          models: [
            modelProfile(env, "demo"),
            ...(env.AI && env.AI_MODEL
              ? [modelProfile(env, "workers-ai")]
              : []),
          ],
          scope: await digest(
            JSON.stringify([principal.tenant, principal.subject]),
          ),
        });
      const route = /^\/api\/sessions\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (route) {
        sameOrigin(request);
        if (!["GET", "POST"].includes(request.method))
          throw new HttpError(405, "Method not allowed");
        const session = identifier(route[1], "session ID");
        const name = await digest(
          JSON.stringify([principal.tenant, principal.subject, session]),
        );
        const stub = env.SESSIONS.get(env.SESSIONS.idFromName(name));
        const body =
          request.method === "POST"
            ? await readJson(request, LIMITS.bodyBytes)
            : {};
        const result = await stub.dispatch(
          principal,
          request.method,
          route[2],
          body,
        );
        if (!result.ok) return json({ error: result.error }, result.status);
        return json(
          JSON.parse(result.value),
          request.method === "POST" && route[2] === "messages" ? 202 : 200,
        );
      }
      if (url.pathname.startsWith("/api/"))
        throw new HttpError(404, "Unknown API route");
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      // RPC preserves Error.message but not custom properties; never expose stacks,
      // provider payloads, credentials or arbitrary errors to the browser.
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      console.error("request_failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
      return json(
        {
          error:
            "Request failed; the durable session is retained. Refresh to inspect its state.",
        },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
