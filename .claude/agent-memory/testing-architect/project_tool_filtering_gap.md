---
name: Tool filtering coverage gaps
description: Mismatches between tool names used in TOOL_NAMES_BY_ACTION and tools tracked by the observer
type: project
---

Two gaps found on 2026-04-13:

1. **flashcard_create missing from observer artifact counting** — In `src/lib/agents/observer.ts` line ~49, `artifactToolNames` includes: canvas_generate_visual, canvas_generate_graph, canvas_generate_notation, flashcard_create, knowledge_lookup. Wait — actually flashcard_create IS included. But `canvas_delegate_task` is NOT tracked, even though it produces annotations not artifacts. This is architecturally correct behavior but worth noting: canvas_delegate_task results never increment `artifactsGenerated`.

2. **SimulationArtifact type is unroutable** — `CanvasArtifact` union includes `SimulationArtifact` (type: "simulation") but there is no `canvas_generate_simulation` tool in `CANVAS_TOOLS`. The simulation type is generated via `/api/simulate` directly, not through the orchestrator tool loop. If the LLM somehow tries to call a simulation tool, it would fall to the `default: unknown tool` handler. The `ArtifactCanvas` component does handle simulation type via `SimulationCard`, so rendering is fine — but the path through the orchestrator to get there is undefined.

3. **`advance` and `simplify` actions get ALL tools with toolChoice "auto"** — This means the LLM is unconstrained when advancing modules or simplifying. Could generate unrelated artifacts during what should be a transitional/spoken moment.

**How to apply:** When new tool types are added, verify: (a) they're in CANVAS_TOOLS, (b) they appear in TOOL_NAMES_BY_ACTION for relevant actions, (c) observer.artifactToolNames tracks them if they produce artifacts.
