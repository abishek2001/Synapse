/**
 * Centralized OpenAI client + tiny logging wrappers.
 *
 * Use `chatCompletion(label, params, opts?)` and `embeddings(label, params, opts?)`
 * from this module instead of constructing fresh `new OpenAI()` instances.
 * Every call automatically writes its request + response to `logs/llm/`.
 *
 * For streaming use cases (the only one today is `/api/chat/stream`), import
 * `rawClient` directly — streaming responses can't be JSON-serialized in one
 * shot so they aren't logged through this layer.
 */
import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import type {
  CreateEmbeddingResponse,
  EmbeddingCreateParams,
} from "openai/resources/embeddings";
import { logged } from "./llm-logger";

/**
 * Centralized OpenAI client.
 *
 * We DELIBERATELY override the SDK defaults:
 *   - maxRetries: 0   — the SDK's default of 2 silently swallows 429s with
 *                       exponential backoff (~20s wait per retry). That makes
 *                       "the model is hanging" indistinguishable from "rate
 *                       limited" in the UI and in our logs. We surface 429s
 *                       loudly instead, so the user sees what's actually wrong.
 *   - timeout: 60s    — the SDK's default is 10 minutes, which is far too long
 *                       for an interactive chat turn. 60s is plenty for any
 *                       single chat / tool call we make.
 */
export const rawClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  maxRetries: 0,
  timeout: 60_000,
});

/**
 * Detects models that use the newer chat-completions parameter shape:
 *   - `max_completion_tokens` instead of `max_tokens`
 *   - default `temperature` only (custom values are rejected)
 *
 * Covers the GPT-5 family (gpt-5, gpt-5.1, gpt-5.4, …) and the reasoning
 * o-series (o1, o3, o4, …). Anything else (gpt-4o, gpt-4-turbo, gpt-3.5)
 * keeps the legacy params unchanged.
 */
function usesNewParamShape(model: string | undefined): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  return (
    /^gpt-5(\.|-|$)/.test(m) ||
    /^o1(\.|-|$)/.test(m) ||
    /^o3(\.|-|$)/.test(m) ||
    /^o4(\.|-|$)/.test(m)
  );
}

/**
 * Rewrites a Chat Completions params object so it works on both legacy
 * (gpt-4o, gpt-3.5) and new-shape (gpt-5.*, o1/o3/o4) models.
 *
 * - Renames `max_tokens` → `max_completion_tokens` for new-shape models.
 * - Strips `temperature` for new-shape models (they only accept the default).
 *
 * Exported so the streaming endpoint (which bypasses `chatCompletion`) can
 * apply the same normalization.
 */
export function normalizeChatParams<
  T extends { model?: string; max_tokens?: number | null; temperature?: number | null },
>(params: T): T {
  if (!usesNewParamShape(params.model)) return params;

  const next: Record<string, unknown> = { ...params };
  if (typeof next.max_tokens === "number") {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
  }
  if ("temperature" in next) {
    delete next.temperature;
  }
  return next as T;
}

export interface CallOpts {
  /** Forwarded to the OpenAI SDK as `{ signal }` so the request can be aborted. */
  signal?: AbortSignal;
}

/**
 * Per-call complexity tier. Lets us route each LLM call to a different
 * model so we can spread requests across multiple per-model rate-limit
 * buckets (every model on the free / Tier-1 plan is 3 RPM, so splitting
 * across 3 tiers gives us effective ~9 RPM combined).
 *
 *   - "complex": multi-tool reasoning, long context, JSON-mode outputs
 *                (the tutor turn + the streaming chat fallback).
 *   - "medium" : structured generation, single-shot SVG / planning
 *                (strategy.decide, study-plan, tool.visual, simulate.api).
 *   - "easy"   : short summaries / one-line extractions
 *                (extract-title, strategy.summary).
 *
 * Resolution order:
 *   1. tier-specific env (OPENAI_MODEL_COMPLEX / _MEDIUM / _EASY)
 *   2. legacy global OPENAI_MODEL (back-compat, applies to every tier)
 *   3. built-in fallback per tier
 *
 * tool.simulation and tool.render3d still read their own dedicated env vars
 * (OPENAI_SIMULATION_MODEL / OPENAI_RENDER3D_MODEL) because they are
 * code-generation workloads that need a frontier model regardless of tier.
 */
export type ModelTier = "complex" | "medium" | "easy";

const TIER_FALLBACK: Record<ModelTier, string> = {
  complex: "gpt-4.1",
  medium: "gpt-4.1-mini",
  easy: "gpt-4.1-nano",
};

export function pickModel(tier: ModelTier): string {
  const tierEnv =
    tier === "complex"
      ? process.env.OPENAI_MODEL_COMPLEX
      : tier === "medium"
        ? process.env.OPENAI_MODEL_MEDIUM
        : process.env.OPENAI_MODEL_EASY;
  return tierEnv || process.env.OPENAI_MODEL || TIER_FALLBACK[tier];
}

/**
 * Rate-limit retry policy.
 *
 *   - On a 429, sleep for the duration OpenAI tells us in either the
 *     `retry-after` header or the message body ("Please try again in 9.468s")
 *     and retry once. Most TPM 429s clear in <15s, so a single retry is
 *     enough to absorb a momentary token-bucket overflow.
 *   - Hard cap the wait at 20s so a single chat turn never feels frozen.
 *     If the API asks for more than that, we surface the 429 immediately
 *     and let the UI's error toast handle it.
 *   - Each retry is logged loudly so terminal output stays diagnostic.
 *   - The retry sleep respects opts.signal — if the user presses Stop
 *     while we're waiting, we abort the wait and reject immediately.
 */
const RATE_LIMIT_MAX_RETRIES = 1;
const RATE_LIMIT_MAX_WAIT_MS = 20_000;

interface MaybeApiError {
  status?: number;
  message?: string;
  headers?: Record<string, string>;
}

function asApiError(err: unknown): MaybeApiError | null {
  if (!err || typeof err !== "object") return null;
  return err as MaybeApiError;
}

function parseDurationToMs(s: string): number {
  // Accepts "9.468s", "1m30s", "500ms", "10".
  const trimmed = s.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseFloat(trimmed) * 1000;
  let total = 0;
  const re = /(\d+(?:\.\d+)?)\s*(ms|s|m)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed)) !== null) {
    const n = parseFloat(m[1]);
    total += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : n * 60_000;
  }
  return total;
}

function parseRetryAfterMs(err: MaybeApiError): number | null {
  const headers = err.headers ?? {};
  const headerValue =
    headers["retry-after"] ??
    headers["x-ratelimit-reset-tokens"] ??
    headers["x-ratelimit-reset-requests"];
  if (headerValue) {
    const ms = parseDurationToMs(headerValue);
    if (ms > 0) return ms;
  }
  const messageMatch = err.message?.match(/try again in (\d+(?:\.\d+)?)\s*(ms|s|m)/i);
  if (messageMatch) {
    const ms = parseDurationToMs(`${messageMatch[1]}${messageMatch[2]}`);
    if (ms > 0) return ms;
  }
  return null;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function annotateRateLimit(label: string, err: unknown): void {
  const e = asApiError(err);
  if (!e || e.status !== 429) return;
  const retryAfter = e.headers?.["retry-after"] ?? e.headers?.["x-ratelimit-reset-tokens"];
  console.warn(
    `[openai] 429 rate-limited on "${label}" — ${e.message ?? "(no message)"}` +
      (retryAfter ? ` (retry hint: ${retryAfter})` : "") +
      ` — try setting OPENAI_MODEL_COMPLEX / _MEDIUM / _EASY to spread load across models, or upgrade your tier.`,
  );
}

/**
 * Execute `fn`, retrying once on 429 after the delay OpenAI requests.
 * Re-throws any non-429 error untouched.
 */
async function withRateLimitRetry<T>(
  label: string,
  signal: AbortSignal | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const apiErr = asApiError(err);
      const isRateLimit = apiErr?.status === 429;
      const canRetry = isRateLimit && attempt < RATE_LIMIT_MAX_RETRIES;
      if (!canRetry) {
        if (isRateLimit) annotateRateLimit(label, err);
        throw err;
      }
      const hint = parseRetryAfterMs(apiErr!);
      if (hint == null || hint > RATE_LIMIT_MAX_WAIT_MS) {
        // Wait would be too long (or unparseable) — surface the error now
        // so the UI can react instead of stalling the chat turn.
        annotateRateLimit(label, err);
        throw err;
      }
      const waitMs = hint + 250; // tiny jitter so we land just past the reset
      console.warn(
        `[openai] 429 on "${label}" — waiting ${(waitMs / 1000).toFixed(1)}s then retrying ` +
          `(attempt ${attempt + 2}/${RATE_LIMIT_MAX_RETRIES + 1})`,
      );
      await sleepWithAbort(waitMs, signal);
    }
  }
  throw lastErr;
}

export async function chatCompletion(
  label: string,
  params: ChatCompletionCreateParamsNonStreaming,
  opts: CallOpts = {},
): Promise<ChatCompletion> {
  const normalized = normalizeChatParams(params);
  return logged(label, normalized, () =>
    withRateLimitRetry(label, opts.signal, () =>
      rawClient.chat.completions.create(normalized, { signal: opts.signal }),
    ),
  );
}

export async function embeddings(
  label: string,
  params: EmbeddingCreateParams,
  opts: CallOpts = {},
): Promise<CreateEmbeddingResponse> {
  return logged(label, params, () =>
    withRateLimitRetry(label, opts.signal, () =>
      rawClient.embeddings.create(params, { signal: opts.signal }),
    ),
  );
}
