# Private Cloudflare staging

[Deployment](./deployment.md) · [Validation](./validation.md) · [Roadmap](./roadmap.md)

This path publishes your own instance behind Cloudflare Access. It uses your existing Workers subdomain and leaves your other applications and domains alone. Start with the demo model: **hosting is real; model replies are simulated**. The [staging evidence](./staging-validation.json) distinguishes deployment and access checks from application recovery qualification.

## 1. Connect your account

You need Workers Paid for Dynamic Workers and an enabled Zero Trust organization for Access. Zero Trust Free can provide Access for this initial single-user setup; it is separate from the Workers subscription. Check current [Workers prices](https://developers.cloudflare.com/workers/platform/pricing/) and [Access plans](https://www.cloudflare.com/plans/zero-trust-services/) before subscribing.

From the installed project, authenticate the pinned Wrangler with the permissions needed by this deployment:

```sh
npx wrangler login --use-keyring --scopes account:read user:read workers_scripts:write
npx wrangler whoami
```

Review the official consent screen. Wrangler also requests background access for refresh. With `--use-keyring`, it stores encrypted credentials locally with the encryption key in the operating system keyring. Do not put tokens, OAuth files or passwords in the repository. A warning about additional default scopes does not mean this deployment needs them: the demonstrated path does not request DNS, billing, KV, D1, Pages or model permissions.

If you belong to multiple accounts, select the intended account or set `CLOUDFLARE_ACCOUNT_ID` for the deployment. Check the reported identity before creating resources.

## 2. Create the Worker with no public endpoint

```sh
npm run deploy:staging
```

The tracked configuration creates `pi-durable-agent-staging` and its SQLite Durable Object class. It keeps `workers_dev` and preview URLs disabled. The application also refuses requests until valid Access settings are present. This bootstrap lets you select the Worker in Access before enabling its URL.

If that Worker name already belongs to an application in your account, choose a distinct name before deploying. Do not replace an unrelated Worker.

## 3. Protect this Worker

In **Cloudflare One → Access controls → Applications**, create a self-hosted application:

1. Select **Workers**, then your staging Worker, with **production and preview URLs** as the scope. This protects this Worker rather than every Worker in the account.
2. Create an **Allow** policy using **Emails** with the exact intended address. Confirm the address has been accepted into the rule before saving. Do not use “Everyone” or an entire public email domain.
3. Set application and policy sessions to **6 hours**. Select the intended identity provider; the demonstrated setup uses the existing **One-time PIN** provider.
4. Save the application. Under **Additional settings**, enable **HTTP Only** and **Binding Cookie** for this browser application and save. Leave CORS bypasses and managed OAuth disabled.
5. Copy the **Application Audience (AUD) Tag**. Record the Zero Trust team domain, such as `your-team.cloudflareaccess.com`.

These are your own Access settings, not values to copy from another deployment. An AUD tag identifies the application; it is not a credential. See [Worker-level Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) and [authorization cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/).

The current UI uses HTTP polling. Cloudflare's Worker-level Access does not support WebSocket upgrades; an application that adds WebSockets must review the documented hostname-based alternative first. The app also validates the Access JWT itself. This is necessary for the current Static Assets routing path, which does not propagate `ctx.access` to the user Worker.

## 4. Keep your deployment configuration local

Create a copy beside the tracked configuration:

```sh
cp wrangler.jsonc wrangler.staging.local.jsonc
```

`wrangler.staging.local.jsonc` is ignored by Git. In **that copy**, retain all existing bindings and migrations. Update `env.staging` with your Access values and these settings:

```json
{
  "workers_dev": true,
  "preview_urls": false,
  "limits": { "cpu_ms": 1000 },
  "vars": {
    "APP_ENV": "staging",
    "MODEL_MODE": "demo",
    "ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
    "ACCESS_AUD": "your-application-audience"
  }
}
```

This snippet is an **addition to the existing staging configuration**, not a replacement for its Durable Object and loader bindings. Keep the file at the project root so its relative paths keep working. You can also set `account_id` in this ignored copy to make account selection explicit.

The 1,000 ms CPU limit restricts each invocation of the host Worker. It is not a monthly budget, a limit on all child executions, or a substitute for billing monitoring. Keep the demo model and a narrow Access policy during initial qualification.

```sh
npx wrangler deploy --config wrangler.staging.local.jsonc --env staging --dry-run
npx wrangler deploy --config wrangler.staging.local.jsonc --env staging
```

Use these same explicit configuration arguments for later deployments. The original `npm run deploy:staging` command still uses the closed bootstrap configuration. Review and reapply configuration changes from future releases to your private copy; it does not automatically inherit edits to `wrangler.jsonc`.

## 5. Verify the deployed application

Open the printed `workers.dev` URL. Access should present the application's login page. With One-time PIN, request a code and enter it from your own mailbox. The administrative Cloudflare dashboard login and this application login are separate sessions.

- Without authentication, check the page, `/app.js` and `/api/me`: each must require Access, including when a forged `Cf-Access-Jwt-Assertion` header is supplied.
- After login, send a synthetic message, retrieve its original text, and use **Try a demo approval**. Inspect the exact operation before approving or rejecting it.
- Keep the same session URL when reloading. Separately test a redeploy while an approval is pending, then confirm that the same operation and a single result survive. A browser reload alone does not prove a Worker restart.
- Record the application revision, deployed version, private configuration hash and observed results. Do not publish login codes, tokens, personal conversations or account credentials in evidence.

Cloudflare accepting the deployment and displaying a login page proves provisioning and the access gate. It does not establish a successful authenticated conversation, Code Mode execution, coordinated hosted restore, abrupt-crash recovery, model quality or production readiness. Those observations remain explicit [roadmap gates](./roadmap.md).

The [recorded staging run](./staging-validation.json) additionally completed the authenticated demo flow, including a pending approval preserved across an asset-only deployment, its completed output and original-source retrieval. Backend code and dependencies stayed unchanged. That historical run does not qualify hosted backup/restore, abrupt crashes, a second authenticated identity or a backend upgrade. The later [dev.2 recovery increment](./hosted-recovery.md) separately verifies the dev.1 → dev.2 backend change and a forced parent-process reset with a pending approval. Follow that guide for the new diagnostics and bounded recovery check.
