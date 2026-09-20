import "server-only";

import type { GenerationStatus } from "./platform";

type Usage = NonNullable<GenerationStatus["usage"]>;

const FALLBACK_BRL_PER_USD = 5.4;
const PRICING_DATE = "2026-09-20";

export async function imageUsage(
  model: string,
  response: Record<string, unknown>,
): Promise<Usage> {
  const metadata = record(response.usageMetadata);
  const inputTokens = integer(metadata.promptTokenCount);
  const outputTokens = integer(metadata.candidatesTokenCount);
  const totalTokens = integer(metadata.totalTokenCount) || inputTokens + outputTokens;
  const inputUsdPerMillion = model === "gemini-3-pro-image" ? 2 : 0.5;
  const outputUsdPerMillion = model === "gemini-3-pro-image" ? 120 : 60;
  const usd =
    (inputTokens * inputUsdPerMillion + outputTokens * outputUsdPerMillion) / 1_000_000;
  return moneyUsage(inputTokens, outputTokens, totalTokens, totalTokens, "tokens", usd);
}

export async function omniUsage(response: Record<string, unknown>): Promise<Usage> {
  const usage = record(response.usage);
  const inputTokens = integer(usage.total_input_tokens);
  const outputTokens = integer(usage.total_output_tokens);
  const totalTokens = integer(usage.total_tokens) || inputTokens + outputTokens;
  const videoTokens = modalityTokens(usage.output_tokens_by_modality, "video");
  const textOutputTokens = Math.max(0, outputTokens - videoTokens);
  const usd =
    (inputTokens * 1.5 + videoTokens * 17.5 + textOutputTokens * 9) / 1_000_000;
  return moneyUsage(inputTokens, outputTokens, totalTokens, totalTokens, "tokens", usd);
}

export async function veoUsage(durationSeconds: number): Promise<Usage> {
  // Veo 3.1 with audio is billed at USD 0.40 per generated second for 720p/1080p.
  return moneyUsage(0, 0, 0, durationSeconds, "seconds", durationSeconds * 0.4);
}

async function moneyUsage(
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
  billableUnits: number,
  unitLabel: Usage["unitLabel"],
  usd: number,
): Promise<Usage> {
  const brlPerUsd = await currentBrlPerUsd();
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    billableUnits,
    unitLabel,
    usdMicros: Math.round(usd * 1_000_000),
    brlMicros: Math.round(usd * brlPerUsd * 1_000_000),
    brlPerUsdMicros: Math.round(brlPerUsd * 1_000_000),
    pricingDate: PRICING_DATE,
  };
}

async function currentBrlPerUsd(): Promise<number> {
  const end = new Date();
  const start = new Date(end.getTime() - 8 * 24 * 60 * 60 * 1000);
  const fmt = (date: Date) =>
    `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}-${date.getUTCFullYear()}`;
  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
    `CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?%40dataInicial='${fmt(start)}'&%40dataFinalCotacao='${fmt(end)}'&%24format=json&%24select=cotacaoVenda,dataHoraCotacao`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return FALLBACK_BRL_PER_USD;
    const payload = (await response.json()) as { value?: Array<{ cotacaoVenda?: number }> };
    const rates = (payload.value ?? [])
      .map((entry) => entry.cotacaoVenda)
      .filter((value): value is number => typeof value === "number" && value > 0);
    return rates.at(-1) ?? FALLBACK_BRL_PER_USD;
  } catch {
    return FALLBACK_BRL_PER_USD;
  }
}

function modalityTokens(value: unknown, modality: string): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, item) => {
    const row = record(item);
    return row.modality === modality ? sum + integer(row.tokens) : sum;
  }, 0);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
