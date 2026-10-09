import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect, test, vi } from "vitest";
import { authenticate } from "../src/auth.js";
import type { Env } from "../src/env.js";

test("Access verifies signatures, issuer, audience and expiry", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test",
    alg: "RS256",
    use: "sig",
  };
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ keys: [jwk] }));
  const env = {
    APP_ENV: "staging",
    ACCESS_TEAM_DOMAIN: "test-agent.cloudflareaccess.com",
    ACCESS_AUD: "agent",
  } as Env;
  const issuer = "https://test-agent.cloudflareaccess.com";
  const token = (audience = "agent", expires = "1h", iss = issuer) =>
    new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("owner")
      .setIssuer(iss)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(privateKey);
  const request = (jwt: string) =>
    new Request("https://app.example/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": jwt },
    });
  try {
    expect(await authenticate(request(await token()), env)).toMatchObject({
      tenant: issuer,
      subject: "owner",
    });
    await expect(
      authenticate(request(await token("wrong")), env),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticate(request(await token("agent", "-1h")), env),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticate(
        request(await token("agent", "1h", "https://other.example")),
        env,
      ),
    ).rejects.toMatchObject({ status: 401 });
    const forged = (await token()).split(".");
    forged[1] = btoa('{"sub":"attacker"}').replace(/=/g, "");
    await expect(
      authenticate(request(forged.join(".")), env),
    ).rejects.toMatchObject({ status: 401 });
  } finally {
    fetch.mockRestore();
  }
});
