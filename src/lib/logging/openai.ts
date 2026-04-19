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

function annotateRateLimit(label: string, err: unknown): void {
  // Best-effort: detect 429s and print a clear, actionable warning.
  const e = err as { status?: number; message?: string; headers?: Record<string, string> } | null;
  if (!e || typeof e !== "object") return;
  if (e.status === 429) {
    const retryAfter = e.headers?.["retry-after"] ?? e.headers?.["x-ratelimit-reset-tokens"];
    console.warn(
      `[openai] 429 rate-limited on "${label}" — ${e.message ?? "(no message)"}` +
        (retryAfter ? ` (retry hint: ${retryAfter})` : "") +
        ` — consider lowering OPENAI_MODEL to gpt-4o-mini or upgrading your tier.`,
    );
  }
}

export async function chatCompletion(
  label: string,
  params: ChatCompletionCreateParamsNonStreaming,
  opts: CallOpts = {},
): Promise<ChatCompletion> {
  const normalized = normalizeChatParams(params);
  return logged(label, normalized, async () => {
    try {
      return await rawClient.chat.completions.create(normalized, { signal: opts.signal });
    } catch (err) {
      annotateRateLimit(label, err);
      throw err;
    }
  });
}

export async function embeddings(
  label: string,
  params: EmbeddingCreateParams,
  opts: CallOpts = {},
): Promise<CreateEmbeddingResponse> {
  return logged(label, params, async () => {
    try {
      return await rawClient.embeddings.create(params, { signal: opts.signal });
    } catch (err) {
      annotateRateLimit(label, err);
      throw err;
    }
  });
}
