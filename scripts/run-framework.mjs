import { fileURLToPath } from "node:url";
import { startGcloudAuthServer } from "./gcloud-auth-server.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
if (command === "dev") {
  const bridge = await startGcloudAuthServer();
  process.env.OPENHIGGSFIELD_GCLOUD_URL = bridge.url;
  process.env.OPENHIGGSFIELD_GCLOUD_SECRET = bridge.secret;
  process.once("exit", () => bridge.server.close());
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL("../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
