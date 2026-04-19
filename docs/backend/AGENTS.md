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

### Artifact selection — concept-fit rubric (NOT topic shortcuts)

The strategy prompt no longer maps "topic area → artifact". It applies a 6-question rubric to each concept and outputs `suggestedArtifacts` as an **ordered priority list, best first**:

1. Does it move? (process unfolding in time/space) → `simulation` — applies broadly: physics motion, chemistry reactions/diffusion, biology processes (blood flow, neuron firing, peristalsis), engineering mechanisms in action, algorithms stepping through state, economic/population dynamics
2. Is its 3D shape part of the answer? → `render3d` — **default-yes for any topic that IS a real-world 3D structure, regardless of how the module is framed** ("overview", "functions", "introduction", "anatomy of…", "structure of…" all qualify). Categories that should default to render3d-primary:
   - Any human/animal organ or organ system (respiratory, cardiovascular, digestive, nervous, endocrine, reproductive, musculoskeletal, urinary, lymphatic, sensory) at every zoom level
   - Cells, organelles, microorganisms, viruses
   - Molecules with non-trivial geometry, crystal lattices
   - Astronomical bodies and systems (planets, moons, solar system, galaxies)
   - Geology / earth-science structures (volcanoes, tectonics, caves, rock layers)
   - Mechanical assemblies, engines, gears, robotic arms, architecture, vehicles
   - 3D math surfaces
   - Archaeological / historical artifacts where shape matters
3. Is the insight an equation? → `notation`
4. Is it a function or distribution? → `graph`
5. Does it actually decompose into discrete named parts with meaningful edges? → `diagram` — but if the parts are physical 3D objects, render3d should lead and diagram should complement
6. Already taught and we want recall? → `flashcard`

**Domain-agnostic rule of thumb for render3d:** before defaulting to diagram, ask *"is the thing a real, tangible 3D structure that exists in space?"* — if yes (across any domain), render3d leads and diagram/notation/simulation complement.

A concept can score on multiple questions — they're listed in priority order, not exclusively. Common patterns:

| Concept | Ranked artifacts | Why |
|---|---|---|
| Projectile motion | `["simulation", "notation"]` | Motion under gravity; range/height formula complements |
| Pendulum | `["simulation", "notation"]` | Swing animation; θ(t) = θ₀cos(ωt) |
| Wave interference | `["simulation"]` | Overlapping wavefronts — pure animation |
| Respiratory system overview | `["render3d", "diagram"]` | 3D lungs/airways; air-path flow as complement |
| Male reproductive system overview | `["render3d", "diagram"]` | 3D anatomy + organ-function flow |
| Heart and circulation | `["render3d", "simulation", "diagram"]` | 3D heart + blood flow animation + circuit diagram |
| Solar system | `["render3d", "simulation"]` | 3D layout + orbital motion |
| DNA structure | `["render3d", "notation"]` | Double helix + base-pairing rules |
| Internal combustion engine | `["render3d", "simulation"]` | 3D engine + 4-stroke cycle in motion |
| Newton's first law | `["notation", "simulation"]` | The principle is the equation; brief inertia sim |
| Photosynthesis (chemistry) | `["notation", "diagram"]` | Balanced equation; light/dark reactions diagram |
| Neural network architecture | `["diagram", "notation"]` | Discrete layers with real edges; activation math |
| HTTP request lifecycle | `["diagram"]` | Discrete components, meaningful edges |

Action selection is **independent** of artifact selection:

- "show me / draw / diagram" → action `visualize`
- "quiz me / test me / flashcards" → action `quiz`
- "next / move on / got it" → action `advance`
- Confusion signals > 2 → action `simplify`
- 3+ exchanges without confusion → action `quiz`
- Otherwise → action `explain`

### Anti-patterns (baked into the prompt)

The strategy prompt explicitly enumerates these to suppress them:

- ❌ Projectile motion → diagram with boxes `Projectile → Trajectory → Parabola` (glossary, not physics)
- ❌ Any anatomy/organ-system "overview" or "functions" module (respiratory, reproductive, digestive, cardiovascular, nervous, urinary, endocrine, musculoskeletal, etc.) → flat `Part A → Part B → Part C` diagram only — framing words ("overview", "functions") do NOT downgrade render3d for spatial topics
- ❌ Cell biology (mitochondria, neuron, animal cell) → labeled-box diagram only (use render3d + diagram)
- ❌ Solar system / planet structure / galaxy → linear `Sun → Mercury → Venus →…` diagram (use render3d + simulation)
- ❌ Molecular structure (DNA, water, methane, proteins) → flat `Atom → Bond → Molecule` diagram (use render3d + notation)
- ❌ Mechanical systems (engines, gears, robotic arms, bridges) → static parts-list diagram (use render3d + simulation)
- ❌ Geological structures (volcano, tectonic plates, cave) → flat cross-section only (use render3d + diagram)
- ❌ Newton's first law → render3d of a ball (the insight is the principle)
- ❌ Photosynthesis → render3d of a leaf (the insight is the reaction)
- ❌ Listing every artifact for "comprehensiveness"

The orchestrator wires `suggestedArtifacts` into the tutor prompt as: *"Artifact priority (ranked, best first): […]. Produce the top artifact. Add lower-ranked ones ONLY if they teach something the top one misses."* — so the tutor follows the ranking instead of falling back to its own diagram bias.

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

### Tool descriptions + self-check in system prompt (all 9 tools)

The tutor system prompt lists each tool with the concept characteristic it serves, then runs an "ARTIFACT SELF-CHECK" the model must apply before calling any visual tool:

1. Does it move? → `canvas_generate_simulation`
2. Is its 3D shape part of the answer? → `canvas_generate_3d_render` (server resolves Sketchfab via `sketchfab_query`, otherwise generates a custom Three.js scene from `concept_brief`)
3. Is the insight an equation? → `canvas_generate_notation`
4. Is it a function or distribution? → `canvas_generate_graph`
5. Discrete named parts with meaningful edges? → `canvas_generate_diagram`
6. Else need a sketch? → `canvas_generate_visual`

The prompt explicitly enumerates anti-patterns (e.g. *"NEVER produce a flat node diagram that just relabels the vocabulary words of the concept"*), with worked examples for projectile motion, pendulum, wave interference, Newton's first law, photosynthesis. It also tells the model to follow the strategy's `suggestedArtifacts` ordering and only stack additional artifacts when each one adds new understanding.

For `canvas_generate_3d_render`, the tutor never writes Three.js. It declares `topic`, `concept_brief` (1-3 sentences naming the parts/relationships/motion the student should see), optional `sketchfab_query` (when a real-world 3D object exists on Sketchfab), and optional `style_hints`. `handleGenerate3DRender`:
  1. If `sketchfab_query` is set → `resolveSketchfabModel` returns a verified Sketchfab `embed_url` → done.
  2. Otherwise → OpenAI **Responses API** call with `RENDER3D_SYSTEM_PROMPT` + `buildRender3DPrompt` (see `src/lib/render3d/prompt.ts`). Default model **`gpt-5.4`** (overridable via `OPENAI_RENDER3D_MODEL`) with `reasoning.effort: "low"` and `text.verbosity: "high"` per OpenAI's GPT-5.4 guide for code-generation work. `max_output_tokens: 8000` budgets reasoning + a 100-200-line scene. The prompt encodes topic-specific palettes (physics/anatomy/chemistry/cells/celestial), explicit anti-patterns, AND embeds the hand-crafted Projectile and NaCl demos from `src/store/canvas.ts` verbatim as gold-standard few-shot examples — describing the quality bar wasn't enough; showing two complete worked scenes is what stops the model from falling back to a flat 2D parabola. Older non-GPT-5 models fall back to Chat Completions with `temperature: 0.4`.

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
