import { execFile } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_GCLOUD = "/Users/ana/google-cloud-sdk/bin/gcloud";
const TOKEN_TTL_MS = 45 * 60 * 1000;
const STATUS_TTL_MS = 30 * 1000;

let statusCache;
let tokenCache;

export async function startGcloudAuthServer() {
  const secret = randomBytes(32).toString("hex");
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");

    if (request.headers["x-openhiggsfield-local-secret"] !== secret) {
      respond(response, 403, { error: "Forbidden" });
      return;
    }

    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/status") {
        respond(response, 200, await readStatus(url.searchParams.get("refresh") === "1"));
        return;
      }
      if (request.method === "POST" && url.pathname === "/token") {
        const forceRefresh = url.searchParams.get("refresh") === "1";
        const status = await readStatus(forceRefresh);
        const token = await readToken(status.account, forceRefresh);
        respond(response, 200, { ...status, accessToken: token });
        return;
      }
      if (request.method === "POST" && url.pathname === "/save") {
        const body = await readJsonBody(request);
        const sourcePath = requireMediaPath(body.sourcePath);
        const name = requireFileName(body.name);
        const destination = await chooseFile(name);
        if (!destination) {
          respond(response, 200, { saved: false, cancelled: true });
          return;
        }
        await downloadLocalMedia(sourcePath, destination);
        respond(response, 200, { saved: true, cancelled: false });
        return;
      }
      if (request.method === "POST" && url.pathname === "/save-many") {
        const body = await readJsonBody(request);
        if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > 100) {
          throw new Error("Invalid file selection");
        }
        const files = body.files.map((file) => {
          if (!file || typeof file !== "object") throw new Error("Invalid file selection");
          return {
            sourcePath: requireMediaPath(file.sourcePath),
            name: requireFileName(file.name),
          };
        });
        const directory = await chooseFolder();
        if (!directory) {
          respond(response, 200, { failed: 0, cancelled: true });
          return;
        }
        let failed = 0;
        for (const file of files) {
          try {
            await downloadLocalMedia(file.sourcePath, path.join(directory, file.name));
          } catch {
            failed++;
          }
        }
        respond(response, 200, { failed, cancelled: false });
        return;
      }
      respond(response, 404, { error: "Not found" });
    } catch (error) {
      respond(response, 503, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start local gcloud bridge");

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    secret,
  };
}

async function chooseFile(name) {
  const script = `on run argv
set chosenFile to choose file name with prompt "Salvar resultado do OpenHiggsfield" default name (item 1 of argv)
return POSIX path of chosenFile
end run`;
  return runFinderScript(script, [name]);
}

async function chooseFolder() {
  const script = `set chosenFolder to choose folder with prompt "Escolha onde salvar os resultados do OpenHiggsfield"
return POSIX path of chosenFolder`;
  return runFinderScript(script, []);
}

async function runFinderScript(script, args) {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script, ...args], {
      timeout: 10 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    if (stderr.includes("(-128)")) return null;
    throw new Error(stderr.trim() || "Could not open the macOS save dialog");
  }
}

async function downloadLocalMedia(sourcePath, destination) {
  const origin = process.env.OPENHIGGSFIELD_APP_ORIGIN || "http://127.0.0.1:5173";
  const response = await fetch(`${origin}${sourcePath}`, { signal: AbortSignal.timeout(5 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Could not read local media (${response.status})`);
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomBytes(6).toString("hex")}.part`);
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function requireMediaPath(value) {
  if (typeof value !== "string" || !/^\/api\/media\/[a-f0-9-]+\.[a-z0-9]+$/i.test(value)) {
    throw new Error("Invalid local media path");
  }
  return value;
}

function requireFileName(value) {
  if (typeof value !== "string" || !value || value.length > 180 || /[\x00/\\:]/.test(value)) {
    throw new Error("Invalid file name");
  }
  return value;
}

async function readStatus(forceRefresh = false) {
  if (!forceRefresh && statusCache && Date.now() - statusCache.savedAt < STATUS_TTL_MS) {
    return statusCache.value;
  }
  const [projectId, account] = await Promise.all([
    gcloud(["config", "get-value", "project"]),
    gcloud(["config", "get-value", "account"]),
  ]);
  if (!projectId || projectId === "(unset)") throw new Error("No active Google Cloud project. Run gcloud config set project PROJECT_ID.");
  if (!account || account === "(unset)") throw new Error("No active Google Cloud account. Run gcloud auth login.");
  const value = { projectId, account };
  statusCache = { savedAt: Date.now(), value };
  return value;
}

async function readToken(account, forceRefresh = false) {
  if (!forceRefresh && tokenCache && tokenCache.account === account && Date.now() - tokenCache.savedAt < TOKEN_TTL_MS) {
    return tokenCache.value;
  }
  const value = await gcloud(["auth", "print-access-token", `--account=${account}`]);
  if (!value) throw new Error("gcloud did not return an access token. Run gcloud auth login.");
  tokenCache = { account, savedAt: Date.now(), value };
  return value;
}

async function gcloud(args) {
  const configured = process.env.GCLOUD_BIN;
  const binary = configured || (existsSync(DEFAULT_GCLOUD) ? DEFAULT_GCLOUD : "gcloud");
  try {
    const { stdout } = await execFileAsync(binary, args, {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" },
    });
    return stdout.trim();
  } catch (error) {
    const detail = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr).trim()
      : "";
    throw new Error(detail || `Could not run gcloud ${args[0] || "command"}`);
  }
}

function respond(response, status, payload) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}
