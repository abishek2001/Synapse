import OpenAI from "openai";

/**
 * Shared OpenAI client. Uses `OPENAI_API_KEY` from the environment.
 *
 * `maxRetries: 1` means "make at most one retry on transient errors" — i.e. up to
 * 2 total attempts per request. This is the ceiling agreed for the project so
 * a flaky network or rate-limit blip doesn't fan out into long retry chains.
 *
 * Always import this `openai` rather than constructing a `new OpenAI(...)` so
 * the retry policy stays consistent across every code path.
 */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
  maxRetries: 2,
});
