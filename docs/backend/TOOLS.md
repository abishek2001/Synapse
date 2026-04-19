# Canvas Tools — Artifact System

Tools are OpenAI function-calling definitions that the tutor LLM invokes to produce artifacts on the canvas. Each tool call → one artifact or a set of annotations placed on the infinite canvas.

**Files:**
- `src/lib/tools/schemas.ts` — OpenAI tool definitions + action filtering
- `src/lib/tools/handlers.ts` — Server-side handler per tool
- `src/lib/tools/types.ts` — TypeScript types for every artifact

---

## Available Tools

### `canvas_generate_diagram`
**Artifact type:** `diagram`
**Handler:** `handleGenerateDiagram` — no LLM call, shapes args directly into artifact

Interactive node-edge diagram. Each node is a separate SVG element with hover highlighting. Layout is computed client-side using a BFS topological algorithm.

```ts
// LLM emits:
{
  title: string;
  nodes: Array<{
    id: string;           // unique, no spaces
    label: string;        // display text
    description?: string; // subtitle below label
    color?: string;       // "blue"|"purple"|"green"|"orange"|"red"|"gray"|"yellow"|"pink"|"teal"
    shape?: "rect" | "diamond" | "circle";
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
  }>;
  direction?: "LR" | "TB"; // default "LR"
}
```

Rendered by: `src/components/canvas/DiagramCard.tsx`

---

### `canvas_generate_visual`
**Artifact type:** `visual`
**Handler:** `handleGenerateVisual` — makes an LLM call to generate SVG

Free-form SVG diagram in a handwritten/whiteboard aesthetic. Use only when content does NOT decompose into discrete nodes (waveforms, annotated drawings, comparison tables).

```ts
// LLM emits:
{
  title: string;
  description: string; // what to draw — detailed enough to generate an SVG
  style: "flowchart" | "concept_map" | "comparison" | "timeline" | "diagram" | "hierarchy";
}
// Handler generates: svgContent (string of SVG markup)
```

Rendered by: `src/components/canvas/VisualCard.tsx`

---

### `canvas_generate_graph`
**Artifact type:** `graph`
**Handler:** `handleGenerateGraph` — no LLM call, parses args directly

Mathematical function plotter. Expressions are JavaScript math strings evaluated at render time.

```ts
// LLM emits:
{
  title: string;
  graph_type: "line" | "scatter" | "bar" | "parametric" | "polar";
  expressions: Array<{
    fn: string;    // JS math, e.g. "Math.sin(x)", "x*x*0.5"
    label: string;
    color?: string;
  }>;
  x_range: [number, number];
  y_range?: [number, number];
  x_label?: string;
  y_label?: string;
}
```

Rendered by: `src/components/canvas/GraphCard.tsx` (Canvas 2D API, interactive crosshair)

---

### `canvas_generate_notation`
**Artifact type:** `notation`
**Handler:** `handleGenerateNotation` — no LLM call

LaTeX equation renderer using KaTeX.

```ts
// LLM emits:
{
  title: string;
  latex: string;       // valid LaTeX — use \\\\ for line breaks in aligned environments
  annotation?: string; // plain-text note below the equation
}
```

Rendered by: `src/components/canvas/NotationCard.tsx`

---

### `flashcard_create`
**Artifact type:** `flashcard`
**Handler:** `handleFlashcardCreate` — no LLM call

Flip-card quiz cards with front (question) and back (answer). Interactive progress tracking.

```ts
// LLM emits:
{
  cards: Array<{ front: string; back: string }>;
}
```

Rendered by: `src/components/canvas/FlashcardCard.tsx`

---

### `canvas_generate_simulation`
**Artifact type:** `simulation`
**Handler:** `handleGenerateSimulation` — dedicated server-side generation via OpenAI **Responses API**.

Interactive 3D physics/chemistry/biology simulation rendered in a sandboxed iframe. The handler routes through the Responses API with default model `gpt-5.4` (override via `OPENAI_SIMULATION_MODEL`), `reasoning.effort: "low"`, `text.verbosity: "high"`, `max_output_tokens: 12000`. Older non-GPT-5 models fall back to Chat Completions with `temperature: 0.4`. The system prompt (`src/lib/simulation/prompt.ts`) embeds a complete worked projectile-motion HTML file as a gold-standard few-shot — describing required quality wasn't enough to stop small models from emitting a single dot tracking position on a black square. Output is sanitized via `sanitizeSimulationCode` before rendering.

```ts
// LLM emits:
{
  topic: string;    // specific concept — "simple harmonic pendulum with damping"
  context?: string; // optional conversation context to shape the simulation
}
// Handler generates: complete self-contained HTML (Three.js r128 from CDN) with
// trajectory/path geometry, animated body, live-updating vector indicator, drop
// lines, ground reference, parameter sliders via postMessage, and HUD.
```

Rendered by: `src/components/workspace/SimulationCard.tsx` (iframe sandbox)

---

### `knowledge_lookup`
**Artifact type:** `lookup`
**Handler:** `handleKnowledgeLookup` — semantic search via embeddings

Retrieves relevant excerpts from the student's uploaded documents using cosine similarity. Only useful when documents have been embedded via `/api/embed`.

```ts
// LLM emits:
{
  search_query: string;
  max_results?: number; // default 3
}
```

Rendered by: `src/components/canvas/LookupCard.tsx`

---

### `canvas_delegate_task`
**Artifact type:** annotations (not a card, placed directly on canvas)
**Handler:** `handleDelegateTask` — no LLM call

Places text annotations, sticky notes, or arrow labels on the canvas. Used for organizing the board, highlighting key points, or adding context around existing artifacts.

```ts
// LLM emits:
{
  task: string; // description of what to annotate
  annotations: Array<{
    type: "text" | "sticky" | "arrow_label";
    content: string;
    color?: string;
    position?: { x: number; y: number };
  }>;
}
```

---

## Action → Tool Filtering

`getToolsForAction(action)` narrows the tool list before the first round of the tool loop. This biases the LLM toward the right artifact category without hard-forcing a specific tool.

| Action | Tools offered (round 0) | tool_choice |
|---|---|---|
| `visualize` | diagram, visual, graph, notation, simulation, delegate | `"required"` |
| `quiz` | flashcard, lookup | `"required"` |
| `deep_dive` | all tools | `"required"` |
| `explain` | all tools | `"auto"` |
| `simplify` | diagram, visual, notation, flashcard, delegate | `"auto"` |
| `summarize` | diagram, notation, delegate | `"auto"` |
| `advance` | all tools | `"auto"` |

Round 1+ always opens back up to all tools with `tool_choice: "auto"`.

---

## Artifact Type Reference

```ts
type ArtifactType = "visual" | "graph" | "notation" | "flashcard" | "lookup" | "simulation" | "diagram";

type CanvasArtifact =
  | VisualArtifact
  | GraphArtifact
  | NotationArtifact
  | FlashcardArtifact
  | LookupArtifact
  | SimulationArtifact
  | DiagramArtifact;
```

All artifacts share `BaseArtifact`: `{ id, type, title, status, position? }`.

---

## Element Widths (canvas layout)

```ts
// src/store/canvas.ts — ELEM_WIDTHS
flashcard:  360px
graph:      380px
notation:   360px
visual:     380px
lookup:     360px
simulation: 400px
diagram:    520px
text:       480px
sticky:     220px
```
