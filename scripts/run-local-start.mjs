import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startGcloudAuthServer } from "./gcloud-auth-server.mjs";

const frameworkRunner = fileURLToPath(new URL("./run-framework.mjs", import.meta.url));
const build = spawnSync(process.execPath, [frameworkRunner, "build"], {
  stdio: "inherit",
  env: process.env,
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const bridge = await startGcloudAuthServer();
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const legacyState = fileURLToPath(new URL("../.wrangler/state", import.meta.url));
const dataDirectory = process.env.OPENHIGGSFIELD_DATA_DIR
  ? resolve(process.env.OPENHIGGSFIELD_DATA_DIR)
  : join(homedir(), ".openhiggsfield");
const persistentState = join(dataDirectory, "wrangler-state");
const runtimeDirectory = join(dataDirectory, "runtime");
const buildOutput = fileURLToPath(new URL("../dist", import.meta.url));
mkdirSync(dataDirectory, { recursive: true });
if (!existsSync(persistentState) && existsSync(legacyState)) {
  cpSync(legacyState, persistentState, { recursive: true });
}
rmSync(runtimeDirectory, { recursive: true, force: true });
cpSync(buildOutput, runtimeDirectory, { recursive: true });
const child = spawn(process.execPath, [
  "--import",
  fileURLToPath(new URL("./local-env.mjs", import.meta.url)),
  wrangler,
  "dev",
  "--config",
  join(runtimeDirectory, "server", "wrangler.json"),
  "--local",
  "--persist-to",
  persistentState,
  "--ip",
  "127.0.0.1",
  "--port",
  "5173",
  "--live-reload",
  "false",
  "--inspector-port",
  "0",
  "--var",
  `OPENHIGGSFIELD_GCLOUD_URL:${bridge.url}`,
  "--var",
  `OPENHIGGSFIELD_GCLOUD_SECRET:${bridge.secret}`,
], {
  cwd: runtimeDirectory,
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
