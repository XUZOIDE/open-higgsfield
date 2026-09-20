export const PLATFORM_KEY_COOKIE = "__Host-openhiggsfield_google_key";

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export class MissingCredentialsError extends Error {
  constructor() {
    super("Missing Google Cloud project or API key");
    this.name = "MissingCredentialsError";
  }
}

export type PlatformCredentials = { projectId: string; apiKey: string };

export function encodeCredentials(credentials: PlatformCredentials): string {
  return JSON.stringify(credentials);
}

export function decodeCredentials(raw: string | undefined): PlatformCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const { projectId, apiKey } = parsed as { projectId?: unknown; apiKey?: unknown };
    if (typeof projectId !== "string" || !projectId.trim()) return null;
    if (typeof apiKey !== "string" || !apiKey.trim()) return null;
    return { projectId: requireProjectId(projectId.trim()), apiKey: requireApiKey(apiKey.trim()) };
  } catch {
    return null;
  }
}

export function parseCredentialInput(data: unknown): PlatformCredentials {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Enter a Google Cloud project ID and API key");
  }
  const record = data as { projectId?: unknown; project_id?: unknown; apiKey?: unknown; api_key?: unknown };
  const projectId = record.projectId ?? record.project_id;
  const apiKey = record.apiKey ?? record.api_key;
  if (typeof projectId !== "string" || !projectId.trim()) throw new Error("Enter a Google Cloud project ID");
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Enter an API key");
  return { projectId: requireProjectId(projectId.trim()), apiKey: requireApiKey(apiKey.trim()) };
}

export function toAuthorizationHeader(apiKey: string): string {
  return `Key ${requireApiKey(apiKey)}`;
}

function requireApiKey(apiKey: string): string {
  if (!apiKey.trim()) throw new Error("Enter an API key");
  return apiKey;
}

function requireProjectId(projectId: string): string {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error("Enter a valid Google Cloud project ID (6–30 lowercase letters, numbers, and hyphens)");
  }
  return projectId;
}
