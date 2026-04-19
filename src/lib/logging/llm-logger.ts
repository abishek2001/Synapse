/**
 * Persistent JSON logger for every OpenAI request/response.
 *
 * Each call appends a single file under `logs/llm/` so you can inspect
 * exactly what was sent to the model and what came back. Files are named
 * `<timestamp>__<label>__<id>.json` so they sort chronologically and group
 * by LLM role (strategy, tutor-round-0, visual, simulation, etc.).
 *
 * Writes are best-effort and fire-and-forget — we never block an LLM call
 * on a disk write, and we never throw out of the wrapper if logging fails.
 */
import { promises as fs } from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs", "llm");
let dirReadyPromise: Promise<void> | null = null;

function ensureDir(): Promise<void> {
  if (!dirReadyPromise) {
    dirReadyPromise = fs.mkdir(LOG_DIR, { recursive: true }).then(() => undefined);
  }
  return dirReadyPromise;
}

function safeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "call";
}

function timestamp(): string {
  // 2026-04-18T14-32-08-123Z  (filesystem-safe ISO)
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export interface LLMLogEntry {
  label: string;
  status: "ok" | "error";
  durationMs: number;
  startedAt: string;
  request: unknown;
  response?: unknown;
  error?: { message: string; name?: string; stack?: string };
}

export async function writeLLMLog(entry: LLMLogEntry): Promise<void> {
  try {
    await ensureDir();
    const id = Math.random().toString(36).slice(2, 8);
    const filename = `${timestamp()}__${safeLabel(entry.label)}__${id}.json`;
    const fullPath = path.join(LOG_DIR, filename);
    await fs.writeFile(fullPath, JSON.stringify(entry, null, 2), "utf-8");
  } catch (err) {
    // Don't surface logger failures — they should never break a chat turn.
    console.warn("[llm-logger] failed to write log:", err instanceof Error ? err.message : err);
  }
}

/**
 * Time an async OpenAI call and write its request + response to disk.
 * Always re-throws on error so call sites behave identically with or
 * without logging.
 */
export async function logged<T>(
  label: string,
  request: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const response = await fn();
    void writeLLMLog({
      label,
      status: "ok",
      durationMs: Date.now() - t0,
      startedAt,
      request,
      response,
    });
    return response;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    void writeLLMLog({
      label,
      status: "error",
      durationMs: Date.now() - t0,
      startedAt,
      request,
      error: { message: e.message, name: e.name, stack: e.stack },
    });
    throw err;
  }
}
