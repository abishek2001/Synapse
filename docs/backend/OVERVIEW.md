# Synapse — Backend Overview

## Architecture

The backend is a **Next.js App Router** server with no persistent database active yet (Prisma schema exists but is not wired into the active request path). All AI work happens server-side — the client sends a single request to `/api/chat` and receives a fully resolved response.

```
Client (useAIChat hook)
    │
    │  POST /api/chat  { query, persona, history, sessionContext, studyPlan, mode? }
    ▼
runOrchestrator()                         src/lib/agents/orchestrator.ts
    │
    ├── [PLAN]   getTeachingDecision()    src/lib/agents/strategy.ts     (LLM call #1)
    │
    ├── [ROUTE]  mode === "friend"?       → executeFriendTurn()
    │            else                    → executeTutorTurn()
    │
    ├── [EXECUTE] tool loop (≤4 rounds)   src/lib/tools/handlers.ts      (LLM call #2+)
    │             └─ each tool call → artifact or annotation
    │
    ├── [OBSERVE] observeTurn()           src/lib/agents/observer.ts     (no LLM)
    │
    └── OrchestratorResult { type, tutor, friend, artifacts, contextPatch, decision }
```

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/chat` | POST | Primary endpoint — runs full orchestrator loop |
| `/api/simulate` | POST | Standalone 3D simulation generator (Three.js HTML) |
| `/api/study-plan` | POST | Generates a structured study plan for a topic |
| `/api/embed` | POST | Embeds text chunks for semantic retrieval |
| `/api/parse-doc` | POST | Extracts text from uploaded files (PDF, DOCX, TXT) |
| `/api/chat/stream` | POST | SSE streaming variant of `/api/chat` (text-only, no tools yet) |

---

## Key Directories

```
src/lib/agents/       Orchestrator, Strategy, Tutor, Friend, Observer agents
src/lib/tools/        Tool schemas (OpenAI function definitions), handlers, artifact types
src/lib/grounding/    Session context, study plan, retrieval (semantic search)
src/lib/simulation/   Three.js simulation prompt + code sanitizer
src/lib/logging/      Wrapped OpenAI client + per-call JSON logger (writes logs/llm/)
src/app/api/          Next.js route handlers (thin wrappers over lib functions)
```

---

## Model & client

All LLM calls go through `src/lib/logging/openai.ts`:

- `chatCompletion(label, params, { signal? })` → wraps `openai.chat.completions.create`
- `embeddings(label, params, { signal? })` → wraps `openai.embeddings.create`
- `rawClient` → exported for streaming use (currently only `/api/chat/stream`)
- `normalizeChatParams(params)` → rewrites params for cross-model compatibility (see below)

Every wrapped call writes a JSON file to `logs/llm/<timestamp>__<label>__<id>.json` containing the request body, response, duration, and any error. Logging is best-effort and never blocks or breaks a turn. The directory is gitignored.

### Cross-model parameter normalization

Call sites are written using the legacy `max_tokens` / `temperature` shape. `chatCompletion` runs every request through `normalizeChatParams` first, which detects new-shape models (`gpt-5.*`, `o1.*`, `o3.*`, `o4.*`) and:

- renames `max_tokens` → `max_completion_tokens` (the new param name those models require)
- strips `temperature` (those models only accept the default value and reject custom ones)

Legacy models (`gpt-4o`, `gpt-4-turbo`, `gpt-3.5-*`) pass through unchanged. The streaming endpoint imports `normalizeChatParams` directly because it bypasses `chatCompletion`. This keeps every call site model-agnostic — flipping `OPENAI_MODEL=gpt-5.1` Just Works.

The `signal` parameter is plumbed from the originating Next.js request all the way into the OpenAI SDK, so when the browser aborts the SSE fetch (the Stop button), every in-flight call cancels and the route closes cleanly.

Defaults: `process.env.OPENAI_MODEL` (`gpt-4o` if unset), `process.env.OPENAI_API_KEY` required in `.env.local`.

### Per-call timeout overrides for code-gen

`rawClient` ships with a 60s timeout — comfortable for chat turns, too tight for the simulation / 3D-render code generators. Both `handleGenerateSimulation` and `handleGenerate3DRender` (in `src/lib/tools/handlers.ts`) override the timeout in the per-call options:

```ts
await openai.responses.create({ ... }, { signal: opts.signal, timeout: 180_000 });
```

`max_output_tokens` is held at 6000 for both — enough for the gold-standard scene density (the few-shot examples are ~80 lines each), and small enough that `gpt-5-mini` finishes well inside the 180s ceiling. If a future model regresses on quality, bump `OPENAI_SIMULATION_MODEL` / `OPENAI_RENDER3D_MODEL` rather than raising the cap further. The forwarded `signal` keeps the user's Stop button responsive even mid-generation.

---

## Response Shape (`OrchestratorResult`)

```ts
{
  type: "tutor" | "friend",
  tutor?: { explanation: string },
  friend?: { analogy: string, followUp: string },
  artifacts: CanvasArtifact[],
  canvasAnnotations: DelegatedAnnotation[],
  decision: { action, reasoning, suggestedPrompt } | null,
  contextPatch: SessionContextPatch,
  rawResponse: string,
}
```

The client applies `contextPatch` to the grounding store, places `artifacts` on the canvas, and displays `tutor.explanation` as the tutor message.

---

## Tool failure handling

Tool calls are executed inside the orchestrator's `for (round)` loop in `executeTutorTurn`. Each round emits one `artifact_pending` SSE event per tool call before invocation, then either:

- `artifact_done` with the resolved `CanvasArtifact` on success, OR
- `artifact_error` with `{ pendingId, artifactType, reason }` on failure (timeout, model error, sanitizer reject, etc.)

`artifact_error` exists specifically because the previous "fail-soft" path fabricated a `lookup`-typed artifact whose `query` was the raw tool name (e.g. `canvas_generate_simulation`). The client's `resolvePendingElement` would mutate the pending `simulation` element into a `lookup` element, and `LookupCard` rendered the internal tool name as if it were a knowledge-search query: *"No relevant excerpts found for canvas_generate_simulation"*. The dedicated error event keeps failures invisible to the user (the skeleton just disappears) while still surfacing the reason in the SSE log and a brief client-side toast. The model is told via the tool message that the artifact failed so it can continue the turn without retrying.
