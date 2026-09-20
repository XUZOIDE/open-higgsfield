import vinext from "vinext";
import { defineConfig } from "vite";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    ...(process.env.OPENHIGGSFIELD_GCLOUD_URL
      ? { OPENHIGGSFIELD_GCLOUD_URL: process.env.OPENHIGGSFIELD_GCLOUD_URL }
      : {}),
    ...(process.env.OPENHIGGSFIELD_GCLOUD_SECRET
      ? { OPENHIGGSFIELD_GCLOUD_SECRET: process.env.OPENHIGGSFIELD_GCLOUD_SECRET }
      : {}),
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: "openhiggsfield-local-db",
      database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
    },
  ],
  r2_buckets: [
    {
      binding: "MEDIA",
      bucket_name: "openhiggsfield-local-media",
    },
  ],
};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "127.0.0.1",
      strictPort: true,
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
