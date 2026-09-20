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

export async function createCostSession(
  userId: string,
  plane: GenerationPlane,
  requestId: string,
  modelLabel: string,
): Promise<void> {
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

export async function deleteCostSession(userId: string, id: number): Promise<void> {
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
  if (!env.DB) throw new Error("Sites cost database is unavailable");
  return env.DB;
}

function localDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
