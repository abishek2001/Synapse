# Canvas Interaction Model

## Tool Modes

| Tool | Key | Behavior |
|------|-----|----------|
| **Interaction** | `I` | Default mode. Pointer passes through to artifacts — flashcards flip, graphs are interactive, etc. Grip handle still drags elements. |
| **Select** | `V` | Click element = select (or select whole group). Drag element = move. Shift-click = add to selection. Click empty canvas = clear selection. |
| **Hand** | `H` | Drag empty canvas = pan. Grip handle still drags elements. |
| **Text** | `T` | Click empty canvas = place text annotation. Auto-switches to Select after placement. |
| **Sticky** | `N` | Click empty canvas = place sticky note. Auto-switches to Select after placement. |
| **Pen** | `P` | Freehand stroke drawing. Release = stroke becomes a `CanvasElement` of type `stroke`. |
| **Eraser** | `E` | Sweep over user annotations (text / sticky / stroke) to delete them. Skips AI-generated artifacts entirely. Each erase pushes onto the annotation undo stack. |
| **Escape** | — | Returns to Interaction mode. Closes popups/menus. |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `I` | Interaction tool |
| `V` | Select tool |
| `H` | Hand (pan) tool |
| `T` | Text annotation tool |
| `N` | Sticky note tool |
| `P` | Pen (draw) tool |
| `E` | Eraser tool (deletes user annotations on sweep) |
| `Cmd/Ctrl + Z` | Undo last user-annotation action (add or erase). Reverses one entry from the annotation undo stack. |
| `Escape` | Back to Interaction mode |
| `Space` (hold) | Temporary hand/pan mode — restores previous tool on release |

---

## Element Types

All canvas objects are `CanvasElement` with a `type` field:

| Type | Description | Stored in |
|------|-------------|-----------|
| `artifact` | AI-generated learning card — see artifact sub-types below | `element.artifact` |
| `text` | Freeform text annotation (heading / subheading / body styles) | `element.text` |
| `sticky` | Sticky note with color | `element.sticky` |
| `stroke` | Freehand pen drawing | `element.stroke` |

**Artifact sub-types** (`element.artifact.type`):

| Sub-type | Renderer | Notes |
|----------|----------|-------|
| `visual` | `VisualCard` | SVG diagram. `style` field controls layout — see below |
| `graph` | `GraphCard` | Canvas-based, 11 chart types, optional slider variables with π-increment support |
| `notation` | `NotationCard` | KaTeX, dark-mode aware |
| `flashcard` | `FlashcardCard` | 3D flip, known/review tracking. Only type rendered inside a card box |
| `lookup` | `LookupCard` | Semantic search excerpts from uploaded docs |
| `simulation` | `SimulationCard` | Self-contained HTML/JS in a sandboxed iframe. Default iframe height `440px` (`ARTIFACT_DEFAULT_FRAME_H.simulation`); user-resizable via the corner handle on `ElementCard`, which writes `element.frameH` and overrides the default. Element is **interactive by mandate** — the gold-standard prompt loads `OrbitControls` from a second CDN script and the system prompt enforces drag-rotate / scroll-zoom / right-drag-pan on every scene (camera framing rule + anti-pattern for fixed cameras). Code is generated server-side by `handleGenerateSimulation` via the OpenAI **Responses API** (default model `gpt-5.4`, override with `OPENAI_SIMULATION_MODEL`) at `reasoning.effort: "low"` + `text.verbosity: "high"` + `max_output_tokens: 6000`. The system prompt (`src/lib/simulation/prompt.ts`) embeds a complete worked projectile-motion HTML simulation as a gold-standard few-shot example so the model produces matching density (trajectory tube + ground grid + animated body + velocity arrow + drop lines + parameter sliders) instead of a single tracking dot. Older non-GPT-5 models fall back to Chat Completions with `temperature: 0.4`. |
| `render3d` | `Render3DCard` | Interactive 3D object/structure viewer. Default iframe height `460px` (`ARTIFACT_DEFAULT_FRAME_H.render3d`); user-resizable via the corner handle on `ElementCard`, which writes `element.frameH` and overrides the default. **The tutor never writes Three.js itself** — it declares WHAT to render (`topic` + `concept_brief` + optional `sketchfab_query` + optional `style_hints`) and `handleGenerate3DRender` resolves it server-side. **TIER 1 — Sketchfab**: when the tutor supplies `sketchfab_query`, `src/lib/sketchfab.ts → resolveSketchfabModel` hits the Sketchfab v3 search API, picks the top public/embeddable result, and stamps a verified `embed_url` (rendered as `<iframe src>`). UIDs are never trusted from the LLM — that path produced 404s. **TIER 2 — Dedicated scene generator**: when Sketchfab misses (or is omitted for abstract/dynamic concepts like projectile motion), `handleGenerate3DRender` calls the OpenAI **Responses API** with `RENDER3D_SYSTEM_PROMPT` (`src/lib/render3d/prompt.ts`). The system prompt embeds two complete worked scenes (the hand-crafted Projectile and NaCl demos from `src/store/canvas.ts`) as gold-standard few-shot examples — describing what good looks like wasn't enough; the model produces matching density only when shown a full reference. Default model is **`gpt-5.4`** (overridable via `OPENAI_RENDER3D_MODEL`) with `reasoning.effort: "low"` and `text.verbosity: "high"` per OpenAI's GPT-5.4 guide for code generation. `max_output_tokens: 8000` to fit reasoning + a 100-200-line scene. Older models fall back to Chat Completions with `temperature: 0.4`. Output is sanitized and injected into the iframe `srcdoc` with the pre-built scaffold (scene/camera/controls/renderer + lights + importmap for `three/addons/`). |

**Visual styles** (`VisualArtifact.style`):

| Style | Purpose |
|-------|---------|
| `concept_map` | Node-and-edge map of related concepts |
| `flowchart` | Step-by-step process with directional arrows |
| `timeline` | Chronological events along a horizontal axis |
| `comparison` | Two-column side-by-side attribute table |
| `diagram` | Component/system diagram with connections |
| `hierarchy` | Tree structure (domain → branches → leaves) |

**Graph types** (`GraphArtifact.graph_type`):

| Type | Description | Data source |
|------|-------------|-------------|
| `line` | Connected curves | `series[].fn` |
| `area` | Filled under curve | `series[].fn` |
| `scatter` | Dot cloud | `series[].fn` or `series[].data` |
| `trend` | Scatter + linear regression line | `series[].fn` or `series[].data` |
| `forecast` | Solid past + dashed future (split at 75% of x range) | `series[].fn` |
| `parametric` | x(t), y(t) curve; x_range is t range | `series[].fn` (y) + `series[].fn_x` (x) |
| `bar` | Vertical grouped bars | `series[].fn` or `series[].data` |
| `pie` | Pie/donut slices (each series = one slice, value = `data[0].y`) | `series[].data` |
| `polar` | r = f(θ); x_range is θ range in radians | `series[].fn` |
| `box` | Box-and-whisker (quartiles computed from data) | `series[].data` (raw values) |
| `violin` | Mirrored KDE distribution shape | `series[].data` (raw values) |
| `density` | KDE probability curves — x=value, y=density; overlapping series with fill + dashed mean line | `series[].data` (raw values) |

**Graph variables** (`GraphVariable` — optional slider controls):
```ts
{
  name: string;       // variable name used in fn, e.g. "A"
  label: string;      // display label
  min: number;
  max: number;
  step: number;       // slider step. If step_unit === "π", value × Math.PI is passed to fn
  step_unit?: "π";    // enables π-fraction display (π/4, π/2, π, 3π/2, ...)
  default: number;
}
```
When `variables` is set, `GraphCard` renders a slider bank above the chart. Sliders update the chart in real time. π-increment sliders format their display value as fractions (π/4, π/2, π, 3π/2, 2π, etc.).

**Key fields on `CanvasElement`:**
```ts
{
  id: string
  type: "artifact" | "text" | "sticky" | "stroke"
  x: number        // world-space position
  y: number
  w: number        // width (manually resizable for sim/render3d via corner handle)
  h?: number       // measured pixel height — written by ElementCard's ResizeObserver
  frameH?: number  // user-set iframe height for sim/render3d (overrides ARTIFACT_DEFAULT_FRAME_H)
  userResized?: boolean // true once the corner-resize handle has been used on this element
  zIndex: number
  groupId?: string // set when element belongs to a group
  createdAt: number
  // one of: artifact, text, sticky, stroke
}
```

`h` is set automatically after the first render via `ResizeObserver` inside `ElementCard`. `GroupBoundary`, `computeGroupBounds`, hit-testing, and fit-all all prefer `el.h` and fall back to `estimateElemH(el.type)` until the measurement arrives. This means group boxes always match the true rendered height regardless of content length or zoom level.

**User-resizable artifacts (sim / render3d)** — `ElementCard` renders a small corner-drag handle (bottom-right, visible on hover) for `simulation` and `render3d` elements. Dragging it calls `resizeArtifact(id, w, frameH)` on the canvas store, which sets the element's `w`, writes `frameH`, and flips `userResized: true`. `SimulationCard` / `Render3DCard` accept a `height` prop and use `element.frameH` when present, falling back to `ARTIFACT_DEFAULT_FRAME_H`. The handle exists because the AI-generated 3D iframes often need much more room than the default box (e.g. orbit scenes get clipped at 400×400) and individual scenes vary widely in framing.

**Diagram element sizing** — `diagram` artifacts are an exception to the fixed `ELEM_WIDTHS` rule. Their element width expands to match the diagram's natural intrinsic SVG width (computed by `getDiagramElementSize` in `src/lib/diagram-layout.ts`) so flowcharts with many ranks/columns aren't shrunk by `maxWidth: 100%` — keeping node fonts at their designed 12px instead of scaling down with the SVG. The default `ELEM_WIDTHS.diagram` (520) acts as a minimum width, and the natural size is applied at element creation (`layoutArtifacts`) and again when a pending element resolves (`resolvePendingElement`).

### Module layout (text + artifacts)

`addModule` (in `src/store/canvas.ts`) is the single entry point that turns a tutor turn into a grouped module. To avoid the historical "narrow paragraph squeezed above a wide diagram" failure mode, it does a **two-pass layout**:

1. **Pass 1 — probe the artifact row(s):** call `layoutArtifacts(...)` at a placeholder Y to learn the artifact-row's `totalW` (widest row across `MAX_COLS = 2` columns) and `totalH`. Diagrams have already expanded to their intrinsic width by this point.
2. **Size the text element:** `textW = clamp(artifactRowW, TEXT_MIN_W = 480, TEXT_MAX_W = 1100)`. So a single 1248px-wide diagram below produces a ~1100px-wide paragraph above; a flashcard pair below produces a ~744px paragraph above. The text always spans the same horizontal extent as the artifacts beneath it.
3. **Estimate text height from content:** `estimateTextHeight(content, textW)` divides the character count by `floor(textW / TEXT_AVG_GLYPH = 6.6)` characters per line, multiplies by line-height (22px), and adds ~0.4 lines of safety padding so descenders / long URLs don't collide with the row below. Hard line breaks (`\n+`) are honoured.
4. **Pass 2 — place the artifacts:** re-call `layoutArtifacts(...)` at `y = CANVAS_START_Y + textH + 1.5 × ELEM_GAP` (extra 1.5× breathing room so the diagram never touches the last line of the paragraph).

**Reflow on actual measurement** — `estimateTextHeight` is conservative but not pixel-perfect. After mount, `ElementCard`'s `ResizeObserver` calls `setElementHeight(textElId, measuredH)`. If the target is a text element inside a group, `setElementHeight` shifts every sibling that still carries `autoLaidOut: true` so the artifact-row top sits at exactly `textY + measuredH + 1.5 × ELEM_GAP`. The `autoLaidOut` flag is set on every element that `layoutArtifacts` produces and **cleared by `moveElement`** the moment the user drags an element, so manual placements are never clobbered by a late text-resize.

**Diagram node text rendering** — node `label` and `description` are rendered inside an SVG `<foreignObject>` containing a centered flex column with CSS `-webkit-line-clamp` (label clamped to 2 lines, description to 3). This means long text wraps and ellipsizes inside the fixed `NODE_W = 168` box instead of overflowing as raw SVG `<text>` would. The layout function (`computeDiagramLayout`) measures each node's height per content via `getNodeBox()` — which greedy-word-wraps using avg-glyph-width estimates and the same line caps — so layered layouts (LR and TB) reserve the right vertical space per node and per row. Tool schema (`canvas_generate_diagram` in `src/lib/tools/schemas.ts`) enforces text budgets: label ≤ 28 chars, description ≤ 32 chars (must be a chip, not a sentence), edge label ≤ 16 chars; if the topic needs prose-length explanation per node, the model is instructed to use `canvas_generate_visual` instead.

---

## Groups

Elements can be grouped into a `CanvasGroup`. When `element.groupId` is set:

- **Drag any member** → entire group moves together (all member positions snapshot at drag start, uniform delta applied)
- **Hover any member** → the group boundary (`GroupBoundary`) highlights with a purple border
- **Click any member** (select mode) → selects ALL group members
- **Shift-click any member** (select mode) → toggles all group members in/out of selection
- **Ungroup** → available in `SelectionBar` when all selected elements share the same `groupId`
- **Group boundary** → rendered as a rounded rect with a handwritten heading at top-left; `pointer-events-none` (no toolbar buttons on the boundary itself)
- **Group heading** → the `group.name` is rendered as a Caveat (handwritten) heading at top-left of the boundary. The font is **counter-scaled** (`fontSize = 15 / canvasScale` when zoomed in past 1×) so the title stays readable at natural size regardless of zoom — same trick `ElementCard` uses for artifact content. Source: `moduleTitle` from the tutor's structured response, falling back to the truncated user query (see `useAIChat`).

### Pending module (in-flight grouping during streaming)

While the AI streams artifacts for a new module, those skeleton elements are wrapped by a transient **`PendingGroupBoundary`** — a dashed violet rectangle with a pulsing dot and a "Generating: <title>" label (or "Generating module…" before the tutor response arrives). State lives on `useCanvasStore().pendingModule = { elementIds, title, startedAt }`. Lifecycle, all driven by `useAIChat`:

1. `sendMessage()` → `startPendingModule()` (resets the slot)
2. Each `artifact_pending` SSE event → `addToPendingModule(elId)` and tracks the id in a per-turn ref
3. `tutor_response` SSE → `setPendingModuleTitle(moduleTitle)`
4. `done` SSE → use the per-turn id ref (NOT a time window) to find resolved artifacts → `addModule(...)` builds the real grouped layout → `clearPendingModule()`
5. `error` / `catch` → `clearPendingModule()` so the dashed boundary doesn't get stuck on screen

The per-turn id ref is what fixes the previous "long generation drops the group" bug: the old code filtered fresh elements by `createdAt > now - 30s`, so any turn taking >30s ended up with orphan ungrouped artifacts.

### Live status surface (no canvas toasts)

The canvas intentionally does **not** carry a transient "thinking…/adding to canvas" toast. The only on-canvas in-progress signal is the dashed `PendingGroupBoundary` (above). Per-step status — turn started, each artifact generating, each artifact resolved, errors — is pushed to `useCanvasStore().updates` via `addUpdate(...)` and surfaced in `RightSidebar` → "Activity". See `COMPONENTS.md → useAIChat → Activity feed entries` for the full list of event types.

---

## Rendering Layer Order

Elements are rendered in two passes to guarantee stroke annotations are always visible:

1. Non-stroke elements (`artifact`, `text`, `sticky`) — sorted by `zIndex`
2. Stroke elements — sorted by `zIndex`, but with a base `zIndex` of `9000 + element.zIndex`

This ensures pen annotations are never occluded by artifact cards, regardless of their `zIndex` values.

---

## Element Drag Model

InfiniteCanvas uses native `addEventListener` on its container. To avoid pointer capture conflicts:

- InfiniteCanvas returns early (no pan/rubber-band) when `e.target.closest("[data-element-id]")` is found
- Each `ElementCard` / `StrokeElement` uses React `onPointerDown` + `e.currentTarget.setPointerCapture(e.pointerId)` to own the pointer exclusively
- The grip handle works in **Hand** and **Select** modes; the root element drag works in **Select** mode only

---

## Rubber-Band Box Selection

In **Select** mode, dragging over empty canvas draws a selection rectangle. On release, all elements whose bounding boxes intersect the rect become selected. If a selected element belongs to a group, only that element (not the whole group) is selected via box select — group-select-all only triggers on individual click.

---

## Double-Click Behavior

| Target | Result |
|--------|--------|
| Empty canvas | Opens `DoubtPopup` at cursor world position |
| Element or group | Zooms canvas to fit the element's group bounds (or element bounds if ungrouped) |

---

## Connection Arrows

Connections between groups are stored in `useCanvasStore().connections`.

Rendered by the `FlowArrows` SVG component:
- **Side selection — adaptive (`pickSides`)**: measure four edge-pair gaps (right→left, left→right, bottom→top, top→bottom).
  - **Both axes separated** (diagonal layout): pick the axis with the *smaller* positive gap — exits through the closer pair of faces.
  - **Only one axis separated**: must use that axis (the other axis overlaps, so its faces would route inside the other box).
  - **Overlap on both axes**: fall back to dominant center-to-center axis.
- **Anchor placement — align to the *other* endpoint's center (`anchorOnSide`)**: each anchor's position along its chosen edge is `clamp(otherCenter, edgeStart + inset, edgeEnd - inset)`. This avoids the "long diagonal across two tall boxes" look that happens when each anchor uses its own box center — a short header connecting to a tall column now anchors at the shared overlapping Y, not at midpoints far apart.
- **Path — cubic bezier with perpendicular tangents**: `M start C ctrl1, ctrl2, end`, where each control point sits along its anchor's outward normal at distance `clamp(proj × 0.5 + dist × 0.15, 24, 160)`, with `proj = |dx · dirX + dy · dirY|` (the connector's projection onto the exit direction). One shape covers all cases naturally:
  - colinear anchors → near-straight line,
  - small offset → smooth curve,
  - same-direction sides with perpendicular offset → S-shape,
  - perpendicular sides → 90°-feeling sweep.
- **Bounds use `canvasScale`**: `computeGroupBounds` is called with the live canvas scale so the start/end anchors match the counter-scaled visual positions of group boundaries.
- **Default**: `stroke="rgba(124,58,237,0.18)"`, `strokeWidth=1.5`. Arrowhead `fa-arrow` (5×5).
- **Highlighted** (source or target group is selected): `stroke="rgba(124,58,237,0.6)"` solid. Arrowhead `fa-arrow-hi` (same geometry, fuller fill).

---

## Zoom & Pan

- **Zoom range**: 10% – 400% (`MIN_ZOOM = 0.1`, `MAX_ZOOM = 4`)
- **Zoom**: mouse scroll wheel (centered on cursor), trackpad pinch (`ctrlKey` wheel), `Ctrl`+scroll
- **Pan**: Space + drag (temporary hand mode — restores previous tool on release), middle-mouse drag, Hand tool drag, two-finger trackpad scroll
- **Zoom to new group**: when `groups.length` increases by 1 (AI adds a single module), the canvas zooms to that group at **natural (100%) scale**, only shrinking if the group doesn't fit. Implemented via `zoomToRect(..., padding=80, minScale=1.0)` — `s = max(fitScale, 1.0)`. Small new groups never get zoomed in to artificial sizes.
- **TOC zoom-to-group** (sidebar click): also clamped to `minScale=1.0` for the same reason.
- **Fit all**: when `groups.length` increases by more than 1 (mock data load, initial restore) — fits all content in view (no min-scale clamp).

### Gesture / scroll discrimination (wheel events)

| Condition | Behavior |
|-----------|----------|
| `e.ctrlKey === true` | Trackpad pinch or Ctrl+scroll → **zoom** centered on cursor (pixel-precise sensitivity) |
| `e.deltaMode === 0` (pixel), no ctrlKey | Trackpad two-finger scroll → **pan** by `deltaX`/`deltaY` |
| `e.deltaMode !== 0` (line/page), no ctrlKey | Mouse scroll wheel → **zoom** centered on cursor |

### Hand-tracking gestures (camera, AFK mode)

Hand tracking is opt-in via a toggle on the canvas toolbar. When enabled, `HandTrackingOverlay` runs MediaPipe Hand Landmarker on the user's webcam (mirrored), classifies each frame through a per-hand `HandStateMachine` (temporal majority filter + pinch hysteresis to kill jitter), and emits a small set of high-level `HandGestureEvent`s into `ArtifactCanvas → handleGesture`. Up to two hands are tracked simultaneously.

| Gesture | Hand pose | Effect |
|---------|-----------|--------|
| **Point** | Index up, other fingers curled | Moves the on-canvas cursor; hover-highlights the group under the cursor |
| **Open palm** | All fingers extended | Idle / cursor only — no canvas action |
| **Pinch** | Thumb tip + index tip touching | Quick pinch (<240ms, no movement) = **click** (select element / clear). Hold + move = **drag**: drags the element under the cursor (whole group if grouped) or pans the canvas if pinched on empty space |
| **Fist** | All fingers curled | **Pan** the canvas (drag motion translated to a panBy with gain ≈1.4 so a comfortable hand range covers the viewport) |
| **Peace ✌** | Index + middle up | **Zoom**: vertical hand motion zooms in (up) / out (down), pivoted on the cursor |
| **Two-hand pinch** | Both hands pinching | **Pinch-to-zoom + pan**: distance change = zoom factor, midpoint translation = pan, pivoted on the midpoint |

Visual feedback:
- A glowing cursor follows the user's index/pinch tip; its color and inner-dot size change with the active gesture (purple = point, red = pinch, amber = fist, green = peace).
- A small chip in the corner of the camera badge labels the current gesture and shows `· 2H` when both hands are active.
- A **gesture cheatsheet** popover (toggled by the `?` button on the camera badge, or by the voice command **"help" / "show gestures"**) lists every gesture so users can learn them without leaving the canvas.

### Voice canvas commands (AFK mode)

Speech-to-text input is intercepted by `lib/voice/commands.ts → classifyCommand` BEFORE it reaches the chat orchestrator. Short, well-formed navigation phrases dispatch a `CanvasCommand` over the `synapse:canvas-command` window event (`ArtifactCanvas` listens). Anything that doesn't match a strict pattern falls through to the LLM as a normal tutor question — so "zoom in" steers the canvas, while "can you zoom in on the Maxwell equation?" still asks the tutor.

**Programmatic toggles** (used by scripted demos to flip the product's hands-free surface on mid-walkthrough):
- `synapse:set_hand_tracking` — `CustomEvent<boolean>`. `ArtifactCanvas` listens and sets the local `handTrackingEnabled` state. Detail = `true`/`false` to force a value, or omit to toggle.
- `synapse:show_help` — fired by both the voice "show gestures" command and the demo `sideEffects.showHelp` flag. `HandTrackingOverlay` listens and toggles its cheatsheet panel.

Optional wake-words `synapse` / `canvas` / `hey synapse` are stripped before matching, and a leading `please` is forgiven.

| Phrase(s) | Command |
|-----------|---------|
| `zoom in` / `closer` / `magnify` | Zoom in 25% (`zoom in a lot` = 60%) |
| `zoom out` / `further out` / `smaller` | Zoom out (`zoom out a lot` = bigger step) |
| `reset zoom` / `zoom to 100` / `recenter` | Reset to 100% scale at viewport center |
| `fit all` / `show everything` / `overview` | Fit every element in the viewport |
| `next` / `next module` / `forward` / `continue` | Walk to the next group (creation order) |
| `previous` / `back` / `prev` | Walk to the previous group |
| `go to module 3` / `module three` / `jump to module 2` | Jump straight to a 1-indexed module |
| `pan up/down/left/right` (or `scroll`/`move`) | Pan ~280px in that direction |
| `stop` / `shut up` / `be quiet` | Stop current TTS playback |
| `replay` / `say that again` / `repeat` | Replay the last tutor message |
| `undo` | `undoLastUserAction` (annotation undo stack) |
| `clear selection` / `deselect` | Clear current selection |
| `select all` | Select every element |
| `help` / `what can I say` / `show gestures` | Toggle the gesture cheatsheet |
| `ask a doubt` / `i have a question` | Open `DoubtPopup` at the viewport center |

Module navigation uses an `activeModuleIdxRef` inside `ArtifactCanvas` so `next`/`previous` walks predictably; `goto_module` resyncs the index. Every command also re-uses existing canvas primitives — there is no parallel "voice command" code path, just a different way to dispatch them.

### Multi-touch pinch (touch screens & tablets)

Two simultaneous pointers anywhere on the canvas (including over elements or in Interaction mode) trigger pinch handling:
- **Distance change** → zoom, centered on the midpoint between the two fingers
- **Midpoint translation** → pan simultaneously with zoom
- Single-pointer operations (rubber-band, pen stroke, element drag) are cancelled when a second pointer lands
- Click events are suppressed after a pinch gesture ends

---

## Element Birth-Scale (Counter-Transform)

The canvas itself is intentionally **infinite** — `MIN_ZOOM = 0.05`, `MAX_ZOOM = 8`. Artifacts, however, cap their on-screen pixel size so they never become uselessly huge or microscopic. The cap is `VISUAL_SCALE_CAP = 1.5` (150%) and lives in `src/store/canvas.ts` alongside the shared helper `visualCounterScale(canvasScale, birthScale)`.

Each element stores `birthScale = 1` (always). `ElementCard` applies a CSS counter-transform on the outer positioning div:

- **`canvasScale ≤ 1.5`** → counter-scale = 1. Element grows naturally with the canvas (zoom in 1.5× → content also visually grows to 1.5×).
- **`canvasScale > 1.5`** → counter-scale = `1.5 / canvasScale`. Element world width shrinks so the on-screen pixel size stays at exactly 1.5× natural.

This means: zoom in to 4× and the artifact is still rendered at 150% of its natural size, while the empty whitespace around it keeps spreading out. Group navigation (`zoomToRect`) treats `1.5` as a soft upper bound for "fit the visible content", but the user is free to zoom further.

### GroupBoundary follows the same cap (and counter-scales its padding)

`GroupBoundary` uses the same `visualCounterScale` helper for two things:

1. **Element edges** — `right = el.x + el.w * counterScale`, `bottom = el.y + el.h * counterScale`. So the boundary tracks the visible edges of (counter-scaled) artifacts.
2. **Padding, border-radius, border-thickness** — multiplied by `padCS = min over members of visualCounterScale(...)`. Without this, zooming past the cap kept inflating the padding and corner-radius of the violet wrapper while the artifacts inside stayed the same size — the "huge violet box around frozen content" bug from earlier screenshots. With the counter-scale, both the artifacts and their wrapper visually freeze together at `canvasScale = 1.5`.

The Caveat group label still counter-scales independently (`fontSize = 15 / canvasScale` past 1×) so it stays at natural reading size at any zoom.

### Formula

```ts
// canvasScale ≤ VISUAL_SCALE_CAP (≤ 1.5): no counter-transform, scale naturally
counterScale = 1

// canvasScale > VISUAL_SCALE_CAP: cap at 1.5× natural
counterScale = VISUAL_SCALE_CAP / canvasScale
```

`counterScale` is applied as `transform: scale(counterScale)` with `transformOrigin: "0 0"` on the outer positioning div. Same formula is reused inside `GroupBoundary` for both the per-element edges AND the wrapper's padding / radius / border, so artifacts and their group wrappers freeze together.

---

## Artifact Dark Mode

`useUIStore.darkMode` flips the canvas background between light/dark, and `ElementCard` threads `dark={darkMode}` into every artifact card that supports it. Three categories:

1. **Re-themed in dark mode** — `GraphCard` (+ all five chart hooks via `chartTheme(dark)`), `FlashcardCard`, `LookupCard`, `NotationCard`. Series colors / accent hues are preserved across themes; only chrome (grid, axis labels, legend, card chrome, body text) flips so artifact identity stays consistent.
2. **Soft-paper fallback** — `VisualCard`. The AI-authored SVG sketch can't be recoloured, so in dark mode the SVG is mounted inside a soft off-white paper panel (`#f5f1e8`, faint border, subtle shadow). Reads as paper pinned on the dark canvas — readable without burning the user's eyes with pure white.
3. **Always-dark by design** — `DiagramCard`, `SimulationCard`, `Render3DCard`. They render on their own intrinsically dark surface (`rgba(12,12,24)` / `#0a0b14`) and look correct on either canvas. They don't accept a `dark` prop.

Charts use a dedicated palette helper at `src/components/canvas/graph/theme.ts` because canvas-drawn pixels can't pick up CSS variables — colors are baked at paint time, so the helper returns the right `grid` / `axis` / `axisLabel` / `legendLabel` / `pieHole` / `pieDivider` strings based on the `dark` flag and each chart hook re-runs its `useEffect` when `dark` changes.

---

## Dot Grid Background

```css
background-image: radial-gradient(circle, rgba(124,58,237,0.07) 1px, transparent 1px);
background-size: {28 × scale}px {28 × scale}px;
background-position: {x % (28 × scale)}px {y % (28 × scale)}px;
```

Dots move with pan and scale with zoom to create the infinite-canvas illusion.

---

## Eraser & Annotation Undo

User-added annotations (`text`, `sticky`, `stroke` — see `ANNOTATION_TYPES` and `isUserAnnotation` in `src/store/canvas.ts`) get a dedicated reversible-action layer. **AI-generated artifacts are excluded** — they're not erased by the eraser tool and never land on the annotation undo stack.

### Eraser tool (`E`)

`InfiniteCanvas` registers a separate pointer path for `tool === "eraser"`:
- A pointer-events overlay is placed above all world content (same trick as the pen) so the sweep reaches annotations regardless of their own listeners
- Every pointer sample fires `onEraseAt(worldX, worldY, radius)` where `radius = ERASER_RADIUS / canvasScale` (constant 18 screen-px footprint at every zoom)
- A pink halo div tracks the cursor while the eraser is active — the native cursor is hidden (`cursor: none`) so the halo IS the cursor
- `ArtifactCanvas → handleEraseAt` does a reverse-z bounding-box hit test against `isUserAnnotation(el)` only, and deletes the topmost match via `removeUserAnnotation(id)`

### Annotation undo stack (`Cmd/Ctrl + Z`)

`useCanvasStore().annotationHistory` holds the last 50 reversible entries:

```ts
type AnnotationHistoryEntry = { kind: "add" | "remove"; element: CanvasElement };
```

Pushed by `addUserAnnotation` (kind: `"add"`) and `removeUserAnnotation` (kind: `"remove"`). `undoLastUserAction()` pops the last entry and reverses it (re-adding a removed element by id, or removing a just-added one). Cleared by `clearCanvas`.

**Wiring**:
- Pen-stroke commit (`ArtifactCanvas → handleStrokeComplete`) → `addUserAnnotation`
- Click-to-place text / sticky (canvas click + `CanvasContextMenu`) → `addUserAnnotation`
- Eraser sweep → `removeUserAnnotation` (which is a no-op for non-annotation types, so callers don't need to gate)
- `SelectionBar` delete + `ElementCard` X-button → route text / sticky / stroke deletes to `removeUserAnnotation`, AI artifacts to plain `removeElement`
- `Cmd/Ctrl + Z` keydown in `InfiniteCanvas` → calls `onUndoAnnotation` → `undoLastUserAction`
- A toolbar Undo button (`Undo2` icon, next to the tool palette) calls the same handler for discoverability

Why the split: the existing `addElement` / `removeElement` paths are also used by AI streams and mock loaders — auto-pushing them onto an undo stack would let Cmd/Ctrl+Z eat AI artifacts the user didn't add. Routing only user-driven mutations through the dedicated annotation actions keeps the undo stack focused on things the user actually authored.

---

## Doubt System

### How it triggers
1. **Double-click empty canvas** → `handleCanvasDoubleClick` → `openDoubtPopup(worldX, worldY)`
2. **Right-click** → context menu → "Ask a doubt here" (or "Ask about this" inside a group — passes the group id as `originGroupId`)
3. **SelectionBar** → "Ask AI" → `openDoubtPopup` pre-filled with the first selected group as `originGroupId`. The Ask AI button is now visible for **single-element selection** too, since marking one artifact and asking about it is the headline use case.

### DoubtPopup positioning
Renders in **screen space** (fixed, not canvas-world) so it stays put during zoom/pan. Screen position = `worldX × scale + panX + containerLeft`.

---

## Responsive Behaviour

The workspace adapts at two breakpoints driven by the `useViewport` hook:

| Breakpoint  | Width   | What changes |
|-------------|---------|--------------|
| `isMobile`  | <640px  | Workspace navbar collapses button labels to icons (`Sources`, `Call a Friend`, `Export`). The `MockButton` is hidden entirely (it's a dev affordance). The mode picker stacks `grid-cols-1`. The landing page's "Enter Synapse" button collapses to a circular arrow. |
| `isCompact` | <1100px | `LeftSidebar` and `RightSidebar` switch from docked columns (which push the canvas) to floating overlay drawers with a tappable backdrop (`min(280px, 86vw)` and `min(320px, 90vw)` respectively). On the first transition into compact, both sidebars are auto-collapsed once. The auto-open-on-`isSpeaking` behaviour for the right sidebar is suppressed in overlay mode. The `ModuleTimeline` auto-minimises to its progress ring on the first compact render and hides its inline step-dots so the title isn't truncated. |
| `lg` (≥1024) | desktop | The `CanvasInputBar` pill sits at `bottom-4`. Below `lg` it lifts to `bottom-16` so it stacks above the canvas's bottom-left tool palette and bottom-right zoom controls instead of colliding with them. |

The `BridgeScreen` whiteboard SVG sizes via `aspectRatio: 980/520` against `width: min(980px, 92vw)` (capped at `60vh` tall) so it scales fluidly down to phone widths instead of bursting out of the viewport.

---

## Tangent Modules + Back Pill

A **tangent module** is a turn that branches off an existing module (the user marked a module and asked a follow-up about it) instead of extending the linear study plan rightward. The system distinguishes "main" modules from "tangents" so it can place them sensibly and offer a way back.

### Data model

`CanvasGroup` carries two extra optional fields:

- `parentGroupId` — the anchor module a tangent branched from
- `isTangent` — `true` when the group was spawned as a tangent

`useCanvasStore` tracks two ids:

- `currentMainGroupId` — the user's "home" module on the main thread, set whenever a non-tangent module is added
- `lastTangentGroupId` — the most recent tangent, used by the back pill

Actions: `setCurrentMain`, `setLastTangent`, `clearTangent`.

### Anchor detection (client → server)

`useAIChat.sendMessage(text, { focusGroupId? })` builds a prioritized `FocusCandidate[]` list:

1. **Explicit focus** — `focusGroupId` passed by `DoubtPopup` / `SelectionBar` / `CanvasContextMenu`
2. **Selection** — unique `groupId`s of `selectedElementIds`
3. **Current main** — `currentMainGroupId`

Up to 3 candidates are sent to `/api/chat` as `{ focus: { candidates } }`. The strategy LLM receives them in its prompt and returns `anchorGroupId` (must be one of the supplied ids — server validates) and `isTangent`. The optimistic anchor (first candidate) is also used client-side to position the in-flight skeleton cards so they appear under the anchor instead of jumping in from the right edge when `done` fires.

### Placement (`addModule`)

`addModule(title, artifacts, _, writtenText, opts?)` accepts `{ anchorGroupId, isTangent }`:

- **With anchor** → places the new group at `(anchorBounds.x, anchorBounds.y + anchorBounds.h + GROUP_GAP_Y)` and slides rightward in `GROUP_GAP_X`-sized steps via a collision check (`findNonOverlappingX`) until it doesn't overlap any sibling. The connection arrow is drawn from the anchor → new group.
- **No anchor** → original behavior preserved: `nextGroupStartX(elements)` at the canvas baseline (`y = 200`), arrow from the previous group.

`addModule` stamps `parentGroupId`/`isTangent` on the new group and updates `currentMainGroupId` (if not a tangent) or `lastTangentGroupId` (if a tangent). It now returns the new group id so callers can act on it.

### Back-to-main pill

`TangentReturnPill` is rendered inside `WorkspaceView` above `CanvasInputBar`. It shows whenever `lastTangentGroupId !== null && currentMainGroupId !== null && they differ`. Clicking it calls `artifactCanvasRef.current?.zoomToGroup(currentMainGroupId)` and `clearTangent()` to dismiss the pill.

Auto-zoom on new groups (`ArtifactCanvas` — zoom to the most recently added group) is unchanged: the user *does* want to see the tangent when it lands. The pill takes over for the return navigation.
