# Agents

Four agents operate inside the orchestrator. Only two make LLM calls per turn (Strategy + Tutor). Observer is pure computation. Friend is only used on manual invocation.

---

## Strategy Agent

**File:** `src/lib/agents/strategy.ts`
**LLM calls per turn:** 1 (gpt-4o, 600 tokens max)
**Runs when:** `sessionContext` is available (i.e. study plan has been initialized)

### Purpose

Given the student's message + session state, decides the best pedagogical action and which artifact types the tutor should produce.

### Output — `TeachingDecision`

```ts
interface TeachingDecision {
  action: "explain" | "visualize" | "quiz" | "simplify" | "advance" | "summarize" | "deep_dive";
  reasoning: string;          // one sentence — why this action
  suggestedPrompt: string;    // explicit instruction for the tutor
  suggestedArtifacts: string[]; // e.g. ["diagram", "notation"] — artifact types to prioritize
  conceptsToTrack: string[];  // concept names mentioned this turn
  shouldAdvanceModule: boolean;
}
```

### Action → Artifact mapping (from system prompt)

| Action | Primary artifacts | Tool choice |
|---|---|---|
| `explain` | diagram, visual, notation (optional) | auto |
| `visualize` | diagram, graph, simulation, visual | required |
| `quiz` | flashcard, lookup | required |
| `simplify` | visual, diagram, flashcard | auto |
| `deep_dive` | notation, diagram, graph, simulation | required |
| `summarize` | diagram (concept map), notation | auto |
| `advance` | nothing, or one summary diagram | auto |

### Key trigger rules (baked into system prompt)

- "show me / draw / diagram" → `visualize`
- Physics / motion / waves / orbits → suggest `simulation` in artifacts
- Formula / equation / math → include `notation`
- "quiz me / test me / flashcards" → `quiz`
- "next / move on / got it" → `advance`
- Confusion signals > 2 → `simplify`
- 3+ exchanges without confusion → `quiz`

---

## Tutor Agent

**File:** `src/lib/agents/tutor.ts` (prompt builders)
**LLM calls per turn:** 1–4 (tool loop rounds)
**Runs always** (unless friend mode)

### System prompt structure

```
[Base tutor prompt — conversation rules + tool layer description]
[Persona-specific instructions]
[Document context if uploaded]
[Strategy hint — action, instruction, suggestedArtifacts]
```

### Personas

| Persona | Style |
|---|---|
| `professor` | Warm, scholarly, step-by-step, checks understanding |
| `explorer` | Socratic, question-led, discovery-based |
| `engineer` | Precise, systematic, hands-on, systems-focused |
| `friend` | Casual, analogy-heavy, relatable |
| `philosopher` | Deep, reflective, abstract, concept maps |

### Tool descriptions in system prompt (all 8 tools)

The tutor system prompt explicitly describes when to use each tool. Key guidance:
- **`canvas_generate_diagram`** — PREFERRED for anything with entities + relationships
- **`canvas_generate_visual`** — Free-form SVG only; use when not node-based
- **`canvas_generate_simulation`** — Dynamic/physical concepts (pendulums, waves, orbits)
- **`canvas_generate_graph`** — Mathematical functions and data plots
- **`canvas_generate_notation`** — LaTeX equations and derivations
- **`flashcard_create`** — Active recall testing
- **`knowledge_lookup`** — Semantic search in uploaded documents
- **`canvas_delegate_task`** — Annotations, sticky notes, arrows on canvas

---

## Observer Agent

**File:** `src/lib/agents/observer.ts`
**LLM calls:** 0 — pure heuristic computation
**Runs:** After every turn (tutor or friend)

### Purpose

Examines what happened in the turn and produces a `SessionContextPatch` that the client applies to the grounding store. This feeds the Strategy agent on the next turn.

### Heuristics

| Signal | Detection | Effect |
|---|---|---|
| Confusion | Regex on user message (12 patterns: "I don't understand", "confused", "lost me", "huh?", etc.) | `confusionSignals + 1` |
| Concept introduction | Tool call `title` args + `conceptsToTrack` from strategy | Concept level → `"introduced"` (new) or `"practiced"` (seen before) |
| Artifact count | Non-lookup, non-delegate tool calls | `artifactsGenerated + N` |
| Questions asked | Every turn | `questionsAsked + 1` |
| Module advance | `decision.shouldAdvanceModule === true` | `currentModuleIndex + 1` |

### Output — `SessionContextPatch`

```ts
type SessionContextPatch = Partial<SessionContext> & {
  conceptUpdates?: Record<string, ConceptState["level"]>;
};
```

The client's `applyPatch()` in the grounding store merges this into the live `SessionContext`.

---

## Friend Agent

**File:** `src/lib/agents/friend.ts` (prompt builder)
**LLM calls per turn:** 1 (no tools)
**Runs when:** `mode === "friend"` (Call a Friend button only — NOT auto-triggered)

### Purpose

Gives a casual, analogy-based explanation when the student explicitly wants a different perspective. Invoked by `CallFriendModal`.

### Output

```ts
interface FriendResponse {
  analogy: string;    // casual, analogy-based explanation (2-3 sentences)
  followUp: string;   // encouraging follow-up remark
}
```

The analogy is also sent back as `tutor.explanation` for display in the transcript.
