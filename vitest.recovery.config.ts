import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/fixtures/recovery.wrangler.jsonc" },
      remoteBindings: false,
      additionalExports: {
        CodemodeRuntime: "DurableObject",
        SessionFacet: "DurableObject",
        PriorSessionFacet: "DurableObject",
      },
    }),
  ],
  test: {
    include: ["test/coordinated-recovery.integration.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
