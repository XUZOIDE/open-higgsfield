import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { startGcloudAuthServer } from "./gcloud-auth-server.mjs";

const bridge = await startGcloudAuthServer();
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const child = spawn(process.execPath, [
  "--import",
  fileURLToPath(new URL("./local-env.mjs", import.meta.url)),
  wrangler,
  "dev",
  "--config",
  "dist/server/wrangler.json",
  "--local",
  "--persist-to",
  ".wrangler/state",
  "--ip",
  "127.0.0.1",
  "--port",
  "5173",
  "--inspector-port",
  "0",
  "--var",
  `OPENHIGGSFIELD_GCLOUD_URL:${bridge.url}`,
  "--var",
  `OPENHIGGSFIELD_GCLOUD_SECRET:${bridge.secret}`,
], {
  stdio: "inherit",
  env: {
    ...process.env,
    OPENHIGGSFIELD_GCLOUD_URL: bridge.url,
    OPENHIGGSFIELD_GCLOUD_SECRET: bridge.secret,
  },
});

const stop = (signal) => {
  child.kill(signal);
  bridge.server.close();
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.once("exit", (code, signal) => {
  bridge.server.close();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
