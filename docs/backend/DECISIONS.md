# Architecture Decisions & Change Log

A record of non-obvious design choices, trade-offs made, and significant changes so future work has context.

---

## 2026-04-13 — Diagram artifact replaces raw SVG for structured content

**Problem:** `canvas_generate_visual` had the LLM emit raw SVG markup. For anything with nodes (neural networks, architecture diagrams, flowcharts) the SVG quality was poor — overlapping labels, straight arrows, no interactivity.

**Decision:** Added a new `canvas_generate_diagram` tool. The LLM emits a structured JSON (nodes + edges), and the client renders it interactively using a custom BFS topological layout engine + SVG (no external library needed).

**Key details:**
- Layout algorithm: BFS rank assignment → layered positioning → cubic bezier edges
- Supports `LR` (left-to-right) and `TB` (top-to-bottom) directions
- Hover state: hovered node lights up with accent color, connected edges go solid
- Node shapes: `rect` (default), `diamond` (decisions), `circle` (states/endpoints)
- `canvas_generate_visual` is kept for genuinely free-form content
- Renderer: `src/components/canvas/DiagramCard.tsx`

---

## 2026-04-13 — Simulation wired into tool loop

**Problem:** `SimulationArtifact` existed as a type and `/api/simulate` existed as a standalone endpoint, but the tutor LLM had no way to produce a simulation during a conversation — there was no tool for it.

**Decision:** Added `canvas_generate_simulation` to `CANVAS_TOOLS`. The handler (`handleGenerateSimulation`) calls OpenAI with `SIMULATION_SYSTEM_PROMPT` + sanitizes the output inline — reusing the same logic as the standalone route. The tutor can now produce a 3D simulation in response to any question about dynamic/physical concepts.

**Tool is exposed on:**
- `visualize` action (filtered tool set, required)
- `deep_dive` action (all tools, required)
- `explain` action (all tools, auto)

---

## 2026-04-13 — Auto-friend routing removed

**Problem:** The orchestrator automatically routed to Friend mode when `confusionSignals >= 3 AND action === "simplify"`. This meant the student could receive an unexpected context switch mid-session without asking for it.

**Decision:** Removed `FRIEND_CONFUSION_THRESHOLD` and `shouldAutoFriend` entirely. Friend mode is now **exclusively triggered by `mode: "friend"`** in the request body — i.e., only the Call a Friend button. Confusion is handled gracefully by the strategy agent returning `action: "simplify"`, which gives the tutor clearer instructions + simpler artifact choices without switching agents.

---

## 2026-04-13 — Strategy agent now outputs `suggestedArtifacts`

**Problem:** The strategy decision only picked an `action` (e.g. `"visualize"`). The tutor LLM then had to figure out from the action + tool descriptions which specific artifact to use. This was an extra inference step with room for misalignment.

**Decision:** Added `suggestedArtifacts: string[]` to `TeachingDecision`. The Strategy agent now explicitly names the artifact types most appropriate for the turn (e.g. `["diagram", "notation"]`). These are injected into the tutor's system prompt as a direct instruction: *"Prioritize these artifact types for this turn: diagram, notation."*

This gives the tutor LLM two converging signals: the filtered tool list (what it CAN use) and the strategy hint (what it SHOULD use).

---

## 2026-04-11 — Orchestrator loop implemented (server-side)

**Problem:** The original architecture had the client make two sequential requests (to `/api/strategy` then `/api/chat`), with the strategy result serialized as a string and passed as `strategyHint`. The tutor could ignore the hint entirely. `sessionContext` was never updated from tutor responses.

**Decision:** Moved all orchestration server-side into `runOrchestrator()`. One request from the client, everything happens in sequence on the server:
- Strategy → filtered tools → tool loop → observer → response
- Client saves one network round-trip
- `contextPatch` returned in response lets client update grounding state

**Deleted:** `/api/strategy` route (Strategy is now an internal function call)

---

## Design constants

| Constant | Location | Value | Rationale |
|---|---|---|---|
| `MAX_TOOL_ROUNDS` | orchestrator.ts | 4 | Prevents infinite loops; 1–2 rounds is typical |
| `OPENAI_MODEL` | env var | `gpt-4o-mini` | Fast + cheap for both strategy and tutor calls |
| Simulation max_tokens | handlers.ts | 4096 | Three.js HTML can be large; needs headroom |
| Strategy max_tokens | strategy.ts | 600 | Decision JSON is small; 600 is generous |
| Tutor max_tokens | orchestrator.ts | 1536 per round | Enough for explanation + tool call args |

---

## Known gaps (from `tasks/todo.md`)

| Gap | Status | Notes |
|---|---|---|
| Streaming with tools | Not started | `/api/chat/stream` is text-only; tool calls block streaming |
| Persistent vector store | Not started | Embeddings lost on restart; needs Prisma + pgvector |
| Session resume | Not started | Prisma Session model exists but not wired in |
| 3D math artifact | Not started | Generic vectors/surfaces beyond simulations |
| Delete tldraw placeholder | Not started | `src/components/workspace/TldrawCanvas.tsx` is unused |
