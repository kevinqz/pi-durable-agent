# Historical native facet probe

These text artifacts preserve the exact source of the private hosted probe recorded in [the evidence manifest](../../hosted-facet-checkpoint-validation.json). They are audit inputs, not application modules, installation commands or deployment configurations.

- `worker.ts.txt`: original Worker bytes, including the temporary import path used for that run.
- `models.ts.txt`: the exact imported model source from application commit `90815ac513714a3227c4b3d82dbe06a928b2c590`; the probe selects its simulation mode only.
- `verify-hosted.mjs.txt`: the original bounded verifier. Its fixed fixture names and mutating endpoints make it inappropriate to rerun against an already-used fixture.

The manifest hashes were checked against these files when they were archived. The private account configuration, credentials, local persistence, raw session records and Wrangler logs are excluded. This probe's provider and checkpoint coordinator are not the later application integration. Use `npm run test:checkpoints` for the maintained local application check.
