/**
 * Classifies upstream errors (mostly OpenAI SDK) into a small set of
 * actionable categories so the UI can show a friendly "rate limit reached" /
 * "model timed out" banner with a retry button instead of a generic
 * "something went wrong" tutor message.
 *
 * Used both server-side (orchestrator → SSE error event) and client-side
 * (fallback when an HTTP error escapes the SSE stream entirely).
 */

export type ErrorCode = "rate_limit" | "timeout" | "unknown";

export interface ClassifiedError {
  code: ErrorCode;
  /** Original / sanitized message — safe to show to the user. */
  message: string;
  /** Suggested wait before retrying, in milliseconds (only for rate_limit). */
  retryAfterMs?: number;
}

interface ErrLike {
  status?: number;
  name?: string;
  code?: string | number;
  message?: string;
  headers?: Record<string, string | number | undefined>;
}

export function classifyError(err: unknown): ClassifiedError {
  const e = (err ?? {}) as ErrLike;
  const message =
    typeof e.message === "string" && e.message.trim().length > 0
      ? e.message
      : "Unknown error";

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const isRateLimit =
    e.status === 429 ||
    e.name === "RateLimitError" ||
    /\b(429|rate[\s_-]?limit|too many requests|quota)/i.test(message);

  if (isRateLimit) {
    let retryAfterMs: number | undefined;
    const retryHeader = e.headers?.["retry-after"] ?? e.headers?.["Retry-After"];
    if (retryHeader != null) {
      const n = Number(retryHeader);
      if (Number.isFinite(n) && n > 0) retryAfterMs = n * 1000;
    }
    if (!retryAfterMs) {
      // OpenAI rate-limit messages often look like:
      //   "Rate limit reached … Please try again in 1.234s. …"
      //   "Please try again in 500ms."
      const m = message.match(/try again in\s+([\d.]+)\s*(ms|s|seconds?|milliseconds?)/i);
      if (m) {
        const n = Number(m[1]);
        const unit = m[2].toLowerCase();
        if (Number.isFinite(n)) {
          retryAfterMs = unit.startsWith("ms") || unit.startsWith("milli") ? n : n * 1000;
        }
      }
    }
    return { code: "rate_limit", message, retryAfterMs };
  }

  // ── Timeout ────────────────────────────────────────────────────────────────
  const isTimeout =
    e.name === "APIConnectionTimeoutError" ||
    e.code === "ETIMEDOUT" ||
    e.code === "ECONNRESET" ||
    e.status === 408 ||
    e.status === 504 ||
    /\b(timeout|timed out|ETIMEDOUT|ECONNRESET|deadline)/i.test(message);

  if (isTimeout) {
    return { code: "timeout", message };
  }

  return { code: "unknown", message };
}

/** Short, human-friendly title for the side banner. */
export function errorTitle(code: ErrorCode): string {
  switch (code) {
    case "rate_limit": return "Rate limit reached";
    case "timeout":    return "Model timed out";
    case "unknown":    return "Something went wrong";
  }
}
