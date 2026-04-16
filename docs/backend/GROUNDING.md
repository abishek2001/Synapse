# Grounding — Session Context & Study Plan

Grounding is the memory layer that persists across turns within a session. It feeds the Strategy agent so each decision is aware of what the student has learned, where they're confused, and where they are in the curriculum.

**Files:**
- `src/lib/grounding/session-context.ts` — SessionContext type + helpers
- `src/lib/grounding/study-plan.ts` — StudyPlan type + LLM generator
- `src/lib/grounding/retrieval.ts` — Semantic search for uploaded documents
- `src/store/grounding.ts` — Zustand store (client-side state)

---

## SessionContext

Tracks a student's state within a single learning session.

```ts
interface SessionContext {
  currentModuleIndex: number;   // which study plan module is active (0-based)
  totalModules: number;         // total modules in the study plan
  conceptStates: Record<string, ConceptState>; // per-concept mastery
  confusionSignals: number;     // total confusion detections across the session
  questionsAsked: number;       // total turns taken
  artifactsGenerated: number;   // total artifacts placed on canvas
  sessionStartedAt: number;     // timestamp
  lastActivityAt: number;       // timestamp of last turn
  summaries: string[];          // LLM-generated summaries of past segments
}

interface ConceptState {
  name: string;
  level: "not_started" | "introduced" | "practiced" | "mastered";
  confusionCount: number;   // how many times confusion was detected on this concept
  lastMentioned: number;    // timestamp
}
```

### Context helpers (`session-context.ts`)

| Function | Purpose |
|---|---|
| `createSessionContext(totalModules)` | Initialize a fresh context |
| `trackConcept(ctx, name, level)` | Update concept mastery level |
| `trackConfusion(ctx, conceptName?)` | Increment confusion signals |
| `trackQuestion(ctx)` | Increment questionsAsked |
| `trackArtifact(ctx)` | Increment artifactsGenerated |
| `advanceModule(ctx)` | Move to next module (clamped to total) |
| `getSessionStats(ctx)` | Returns `{ mastered, needsWork, elapsedMinutes, ... }` |
| `serializeForPrompt(ctx)` | Formats context as a string for LLM injection |
| `addSummary(ctx, summary)` | Appends a session summary segment |

---

## SessionContextPatch

Rather than sending the entire `SessionContext` back from the server, the orchestrator sends a **partial patch** that the client merges.

```ts
type SessionContextPatch = Partial<SessionContext> & {
  conceptUpdates?: Record<string, ConceptState["level"]>;
};
```

`conceptUpdates` is a separate field because updating individual concept levels requires merging into `conceptStates`, not overwriting the whole map.

### How the client applies it

`useGroundingStore.applyPatch(patch)` in `src/store/grounding.ts`:
1. Spreads `directPatch` (all fields except `conceptUpdates`) over the existing context
2. Iterates `conceptUpdates` and upserts each concept into `conceptStates`

---

## StudyPlan

Generated once at session start via `/api/study-plan`. Defines the learning curriculum.

```ts
interface StudyPlan {
  topic: string;
  totalModules: number;
  estimatedMinutes: number;
  modules: StudyModule[];
  prerequisites: string[];
}

interface StudyModule {
  id: string;
  title: string;
  description: string;
  keyTerms: string[];
  estimatedMinutes: number;
  order: number;
}
```

The study plan is passed to the Strategy agent every turn as context. It tells the agent what the current module is covering and what comes next.

---

## Semantic Retrieval

**File:** `src/lib/grounding/retrieval.ts`

When a student uploads documents, they are:
1. Parsed by `/api/parse-doc` → raw text
2. Chunked and embedded by `/api/embed` → stored in an in-memory vector store
3. Retrieved by the `knowledge_lookup` tool via `semanticSearch(query, maxResults)`

```ts
// Returns:
Array<{ text: string; source: string; score: number }>
```

**Limitation:** The vector store is in-memory. Embeddings are lost on server restart. A persistent store (Prisma + pgvector) is a noted gap in `tasks/todo.md`.

---

## Grounding Store (`src/store/grounding.ts`)

Client-side Zustand store. Passed in full to `/api/chat` on every request.

```ts
interface GroundingState {
  studyPlan: StudyPlan | null;
  sessionContext: SessionContext | null;
  retrievalIndexed: boolean;
  indexedChunks: number;

  setStudyPlan(plan): void;
  setSessionContext(ctx): void;
  updateContext(ctx): void;      // full replace
  applyPatch(patch): void;       // partial merge (used by orchestrator response)
  setRetrievalIndexed(b, n): void;
  reset(): void;
}
```

`applyPatch` is what the `useAIChat` hook calls after each successful `/api/chat` response to update the grounding state with the observer's findings.
