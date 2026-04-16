# Orchestrator — Plan → Execute → Observe

**File:** `src/lib/agents/orchestrator.ts`

The orchestrator is the single server-side entry point for every AI turn. It owns the OpenAI client and coordinates all sub-agents.

---

## Flow

```
runOrchestrator(input)
    │
    ├─ mode === "friend"  ──────────────────────────────── executeFriendTurn()
    │                                                           │
    │                                                       buildFriendMessages()
    │                                                       → OpenAI (1 call, no tools)
    │                                                       → FriendResponse { analogy, followUp }
    │                                                       → observeTurn() → contextPatch
    │
    └─ mode !== "friend"
          │
          ├─ [PLAN] sessionContext present?
          │     yes → getTeachingDecision()   (LLM #1 — strategy agent, ~300ms)
          │     no  → decision = null
          │
          └─ [EXECUTE] executeTutorTurn()
                │
                ├─ buildTutorSystemPrompt() + strategy hint injected
                ├─ getToolsForAction(decision.action) → filtered tool list + toolChoice
                │
                └─ Tool loop (max 4 rounds):
                      Round 0: filtered tools, action toolChoice ("auto" or "required")
                      Round 1+: all tools, "auto"
                      │
                      Each round → OpenAI call → assistant message
                      If tool_calls present:
                        → handleToolCall() per call → artifact or annotation
                        → push tool result into messages
                      If no tool_calls → break
                │
                └─ [OBSERVE] observeTurn() → contextPatch (no LLM)
```

---

## Friend Mode

Friend mode is **manual only** — triggered exclusively when `mode: "friend"` is passed in the request body (from the Call a Friend button in `CallFriendModal`).

There is no automatic friend routing. The previous `shouldAutoFriend` logic (auto-trigger on `confusionSignals ≥ 3`) was removed — confusion is handled by the strategy agent choosing `action: "simplify"` instead.

---

## Tool Loop Detail

```ts
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  // Round 0 uses action-biased tools; later rounds open up
  const tools      = round === 0 ? initialTools : CANVAS_TOOLS;
  const toolChoice = round === 0 ? initialToolChoice : "auto";

  const res = await openai.chat.completions.create({ tools, tool_choice, ... });

  if (no tool_calls) break;   // LLM chose to just respond with text

  for each toolCall:
    handleToolCall(name, args) → { artifact?, annotations?, result }
    artifacts.push(artifact)
    messages.push(tool result)  // feeds back into next round
}
```

**MAX_TOOL_ROUNDS = 4.** In practice most turns use 1–2 rounds (1 tool call + 1 follow-up text response).

---

## Strategy Hint Injection

When a strategy decision is available, it is appended to the tutor's system prompt before the tool loop:

```
## TEACHING STRATEGY FOR THIS TURN
Action: visualize
Reasoning: student asked to see a diagram of X
Instruction: Show a labeled architecture diagram with...
Prioritize these artifact types for this turn: diagram, notation
```

This means the tutor LLM receives both:
1. **Filtered tools** (only the relevant subset for the action)
2. **Explicit instruction** (what to produce and why)

---

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `MAX_TOOL_ROUNDS` | 4 | Max OpenAI calls per turn |
| `MODEL` | `OPENAI_MODEL` env or `gpt-4o-mini` | Model for all calls |

---

## Input / Output Types

```ts
// src/lib/agents/types.ts

interface OrchestratorInput {
  query: string;
  persona: string;
  history: AgentMessage[];
  documentContext?: string;
  sessionContext: SessionContext | null;
  studyPlan: StudyPlan | null;
  mode?: "tutor" | "friend";
}

interface OrchestratorResult {
  type: "tutor" | "friend";
  tutor?: { explanation: string };
  friend?: { analogy: string; followUp: string };
  artifacts: CanvasArtifact[];
  canvasAnnotations: DelegatedAnnotation[];
  decision: { action, reasoning, suggestedPrompt } | null;
  contextPatch: SessionContextPatch;
  rawResponse: string;
}
```
