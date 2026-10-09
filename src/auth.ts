import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env, Principal } from "./env.js";
import { HttpError } from "./http.js";

const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authenticate(
  request: Request,
  env: Env,
): Promise<Principal> {
  const url = new URL(request.url);
  if (
    env.APP_ENV === "local" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    return {
      tenant: "local-demo",
      subject: "local-user",
      authorizedUntil: Date.now() + 3600000,
    };
  if (!["staging", "production"].includes(env.APP_ENV))
    throw new HttpError(503, "Application disabled");
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (
    !domain ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) ||
    !env.ACCESS_AUD
  )
    throw new HttpError(
      503,
      "Configure Cloudflare Access before enabling this deployment",
    );
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "Sign in through Cloudflare Access");
  const issuer = `https://${domain}`;
  let jwks = keys.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keys.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
    });
    if (!payload.sub) throw new Error("Missing subject");
    return {
      tenant: issuer,
      subject: payload.sub,
      authorizedUntil: payload.exp! * 1000,
    };
  } catch {
    throw new HttpError(401, "Invalid or expired access session");
  }
}

export function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "Cross-origin request rejected");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Cross-site request rejected");
}
