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

export const rawClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

export interface CallOpts {
  /** Forwarded to the OpenAI SDK as `{ signal }` so the request can be aborted. */
  signal?: AbortSignal;
}

export async function chatCompletion(
  label: string,
  params: ChatCompletionCreateParamsNonStreaming,
  opts: CallOpts = {},
): Promise<ChatCompletion> {
  return logged(label, params, () =>
    rawClient.chat.completions.create(params, { signal: opts.signal }),
  );
}

export async function embeddings(
  label: string,
  params: EmbeddingCreateParams,
  opts: CallOpts = {},
): Promise<CreateEmbeddingResponse> {
  return logged(label, params, () =>
    rawClient.embeddings.create(params, { signal: opts.signal }),
  );
}
