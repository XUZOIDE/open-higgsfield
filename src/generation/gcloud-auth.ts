import "server-only";

import { MissingCredentialsError } from "./platform";

export type GcloudStatus = {
  available: boolean;
  projectId: string | null;
  account: string | null;
  error: string | null;
};

export type GcloudCredentials = {
  projectId: string;
  account: string;
  accessToken: string;
};

export async function getGcloudStatus(forceRefresh = false): Promise<GcloudStatus> {
  try {
    const payload = await bridgeRequest<{ projectId: string; account: string }>(
      `/status${forceRefresh ? "?refresh=1" : ""}`,
      "GET",
    );
    return { available: true, projectId: payload.projectId, account: payload.account, error: null };
  } catch (caught) {
    return {
      available: false,
      projectId: null,
      account: null,
      error: caught instanceof Error ? caught.message : String(caught),
    };
  }
}

export async function getGcloudCredentials(forceRefresh = false): Promise<GcloudCredentials> {
  try {
    return await bridgeRequest<GcloudCredentials>(
      `/token${forceRefresh ? "?refresh=1" : ""}`,
      "POST",
    );
  } catch (caught) {
    throw new MissingCredentialsError(caught instanceof Error ? caught.message : String(caught));
  }
}

export async function saveMediaWithFinder(sourcePath: string, name: string) {
  return bridgeRequest<{ saved: boolean; cancelled: boolean }>("/save", "POST", { sourcePath, name });
}

export async function saveMediaBatchWithFinder(files: Array<{ sourcePath: string; name: string }>) {
  return bridgeRequest<{ failed: number; cancelled: boolean }>("/save-many", "POST", { files });
}

async function bridgeRequest<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const base = process.env.OPENHIGGSFIELD_GCLOUD_URL;
  const secret = process.env.OPENHIGGSFIELD_GCLOUD_SECRET;
  if (!base || !secret) throw new Error("Start this app with pnpm dev on this machine");
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "x-openhiggsfield-local-secret": secret,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(35_000),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Local gcloud bridge failed (${response.status})`);
  return payload;
}
