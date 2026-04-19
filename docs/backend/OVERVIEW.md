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

Every wrapped call writes a JSON file to `logs/llm/<timestamp>__<label>__<id>.json` containing the request body, response, duration, and any error. Logging is best-effort and never blocks or breaks a turn. The directory is gitignored.

The `signal` parameter is plumbed from the originating Next.js request all the way into the OpenAI SDK, so when the browser aborts the SSE fetch (the Stop button), every in-flight call cancels and the route closes cleanly.

Defaults: `process.env.OPENAI_MODEL` (`gpt-4o` if unset), `process.env.OPENAI_API_KEY` required in `.env.local`.

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
