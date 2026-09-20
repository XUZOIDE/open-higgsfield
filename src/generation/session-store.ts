import "server-only";

import { env } from "cloudflare:workers";
import { createHash } from "node:crypto";

import type { GenerationPlane } from "./catalog/types";
import type { GenerationStatus } from "./platform";

export type DailyCost = {
  day: string;
  sessions: number;
  tokens: number;
  brlMicros: number;
};

export type CostSession = {
  id: number;
  requestId: string;
  title: string;
  modelLabel: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  billableUnits: number;
  unitLabel: string;
  brlMicros: number;
  resultUrl: string | null;
  error: string | null;
};

export type OpenCostSession = {
  requestId: string;
  title: string;
  modelId: string;
  modelLabel: string;
  surface: "image" | "video";
  createdAt: string;
  settings: Record<string, unknown>;
};

let schemaReady: Promise<void> | null = null;

export async function createCostSession(
  userId: string,
  plane: GenerationPlane,
  requestId: string,
  modelLabel: string,
): Promise<void> {
  await ensureSchema();
  const now = new Date();
  const title = plane.prompt.text.trim().replace(/\s+/g, " ").slice(0, 100) || modelLabel;
  await database()
    .prepare(
      `INSERT INTO generation_sessions
       (user_id, request_id, day_local, title, model_id, model_label, surface, status, created_at, settings_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
    )
    .bind(
      userId,
      requestId,
      localDay(now),
      title,
      plane.model,
      modelLabel,
      plane.model.includes("image") ? "image" : "video",
      now.toISOString(),
      JSON.stringify(plane.settings),
    )
    .run();
}

export async function updateCostSession(
  userId: string,
  status: GenerationStatus,
): Promise<void> {
  await ensureSchema();
  const usage = status.usage;
  const resultUrl = status.images?.[0]?.url ?? status.video?.url ?? null;
  const error = typeof status.error === "string" ? status.error : status.error ? JSON.stringify(status.error) : null;
  await database()
    .prepare(
      `UPDATE generation_sessions SET
        status = ?, completed_at = ?, input_tokens = ?, output_tokens = ?, total_tokens = ?,
        billable_units = ?, unit_label = ?, usd_micros = ?, brl_micros = ?,
        brl_per_usd_micros = ?, pricing_date = ?, result_url = ?, error = ?
       WHERE request_id = ? AND user_id = ?`,
    )
    .bind(
      status.status,
      new Date().toISOString(),
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
      usage?.totalTokens ?? 0,
      usage?.billableUnits ?? 0,
      usage?.unitLabel ?? "tokens",
      usage?.usdMicros ?? 0,
      usage?.brlMicros ?? 0,
      usage?.brlPerUsdMicros ?? 0,
      usage?.pricingDate ?? null,
      resultUrl,
      error,
      status.requestId,
      userId,
    )
    .run();
}

export async function listDailyCosts(userId: string): Promise<DailyCost[]> {
  await ensureSchema();
  const rows = await database()
    .prepare(
      `SELECT day_local AS day, COUNT(*) AS sessions, SUM(total_tokens) AS tokens,
              SUM(brl_micros) AS brlMicros
       FROM generation_sessions WHERE user_id = ?
       GROUP BY day_local ORDER BY day_local DESC LIMIT 120`,
    )
    .bind(userId)
    .all<DailyCost>();
  return rows.results;
}

export async function listCostSessions(userId: string, day: string): Promise<CostSession[]> {
  await ensureSchema();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid day");
  const rows = await database()
    .prepare(
      `SELECT id, request_id AS requestId, title, model_label AS modelLabel, status,
              created_at AS createdAt, completed_at AS completedAt,
              input_tokens AS inputTokens, output_tokens AS outputTokens,
              total_tokens AS totalTokens, billable_units AS billableUnits,
              unit_label AS unitLabel, brl_micros AS brlMicros,
              result_url AS resultUrl, error
       FROM generation_sessions WHERE user_id = ? AND day_local = ?
       ORDER BY created_at DESC`,
    )
    .bind(userId, day)
    .all<CostSession>();
  return rows.results;
}

/** The browser keeps its own gallery, but a rebuild can replace the client
    bundle while a provider job is still running. D1 is the durable rendezvous:
    the next compatible client can rediscover those jobs and finish polling
    instead of orphaning a generation that was already paid for. */
export async function listOpenCostSessions(userId: string): Promise<OpenCostSession[]> {
  await ensureSchema();
  const rows = await database()
    .prepare(
      `SELECT request_id AS requestId, title, model_id AS modelId,
              model_label AS modelLabel, surface, created_at AS createdAt,
              settings_json AS settingsJson
       FROM generation_sessions
       WHERE user_id = ? AND status = 'running'
       ORDER BY created_at DESC LIMIT 20`,
    )
    .bind(userId)
    .all<Omit<OpenCostSession, "settings"> & { settingsJson: string }>();
  return rows.results.map(({ settingsJson, ...row }) => ({
    ...row,
    settings: parseStoredSettings(settingsJson),
  }));
}

export async function deleteCostSession(userId: string, id: number): Promise<void> {
  await ensureSchema();
  const row = await database()
    .prepare("SELECT request_id AS requestId, result_url AS resultUrl FROM generation_sessions WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ requestId: string; resultUrl: string | null }>();
  if (!row) return;
  await database().prepare("DELETE FROM generation_sessions WHERE id = ? AND user_id = ?").bind(id, userId).run();
  const namespace = createHash("sha256").update(userId).digest("hex");
  const keys = [`users/${namespace}/jobs/${row.requestId}.json`];
  if (row.resultUrl?.startsWith("/api/media/")) keys.push(`users/${namespace}/media/${row.resultUrl.slice("/api/media/".length)}`);
  if (env.MEDIA) await env.MEDIA.delete(keys);
}

function database(): D1Database {
  if (!env.DB) throw new Error("Local cost database is unavailable");
  return env.DB;
}

function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    await database().prepare(
      `CREATE TABLE IF NOT EXISTS generation_sessions (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id text NOT NULL,
        request_id text NOT NULL,
        day_local text NOT NULL,
        title text NOT NULL,
        model_id text NOT NULL,
        model_label text NOT NULL,
        surface text NOT NULL,
        status text NOT NULL,
        created_at text NOT NULL,
        completed_at text,
        input_tokens integer DEFAULT 0 NOT NULL,
        output_tokens integer DEFAULT 0 NOT NULL,
        total_tokens integer DEFAULT 0 NOT NULL,
        billable_units integer DEFAULT 0 NOT NULL,
        unit_label text DEFAULT 'tokens' NOT NULL,
        usd_micros integer DEFAULT 0 NOT NULL,
        brl_micros integer DEFAULT 0 NOT NULL,
        brl_per_usd_micros integer DEFAULT 0 NOT NULL,
        pricing_date text,
        result_url text,
        settings_json text NOT NULL,
        error text
      )`,
    ).run();
    await database().prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS generation_sessions_request_id_unique ON generation_sessions (request_id)",
    ).run();
    await database().prepare(
      "CREATE INDEX IF NOT EXISTS idx_generation_sessions_user_day ON generation_sessions (user_id, day_local)",
    ).run();
  })();
  return schemaReady;
}

function localDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseStoredSettings(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
