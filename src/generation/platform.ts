export class MissingCredentialsError extends Error {
  constructor(message = "Local gcloud authentication is unavailable") {
    super(message);
    this.name = "MissingCredentialsError";
  }
}

export type QueuedGeneration = {
  status: string;
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
};

export type GenerationStatus = {
  status: string;
  requestId: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    billableUnits: number;
    unitLabel: "tokens" | "seconds";
    usdMicros: number;
    brlMicros: number;
    brlPerUsdMicros: number;
    pricingDate: string;
  };
  error?: unknown;
};

/** One request's answer inside a batched status poll. A request that errors
    carries its reason alone, so it cannot lose the answers standing beside it. */
export type StatusResult =
  | { requestId: string; status: GenerationStatus }
  | { requestId: string; error: string };
