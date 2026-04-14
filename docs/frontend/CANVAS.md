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
| `Escape` | Back to Interaction mode |

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
| `simulation` | `SimulationCard` | Self-contained HTML/JS in a sandboxed iframe, fixed `380px` height |
| `render3d` | `Render3DCard` | Interactive Three.js scene in a sandboxed iframe, fixed `420px` height. Rotate/zoom/pan via OrbitControls. AI writes scene-building JS; wrapper pre-boots Three.js r160 + OrbitControls + lighting |

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
  w: number        // width
  h?: number       // measured pixel height — written by ElementCard's ResizeObserver
  zIndex: number
  groupId?: string // set when element belongs to a group
  createdAt: number
  // one of: artifact, text, sticky, stroke
}
```

`h` is set automatically after the first render via `ResizeObserver` inside `ElementCard`. `GroupBoundary`, `computeGroupBounds`, hit-testing, and fit-all all prefer `el.h` and fall back to `estimateElemH(el.type)` until the measurement arrives. This means group boxes always match the true rendered height regardless of content length or zoom level.

---

## Groups

Elements can be grouped into a `CanvasGroup`. When `element.groupId` is set:

- **Drag any member** → entire group moves together (all member positions snapshot at drag start, uniform delta applied)
- **Hover any member** → the group boundary (`GroupBoundary`) highlights with a purple border
- **Click any member** (select mode) → selects ALL group members
- **Shift-click any member** (select mode) → toggles all group members in/out of selection
- **Ungroup** → available in `SelectionBar` when all selected elements share the same `groupId`
- **Group boundary** → rendered as a rounded rect with a label; `pointer-events-none` (no toolbar buttons on the boundary itself)

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
- **Path**: Cubic bezier. Edge selection is direction-aware — horizontal connections exit right/enter left; vertical connections exit bottom/enter top
- **Default**: `stroke="rgba(124,58,237,0.22)"` dashed, animated `stroke-dashoffset`
- **Highlighted** (source or target group is selected): `stroke="rgba(124,58,237,0.7)"` solid

---

## Zoom & Pan

- **Zoom range**: 10% – 300% (`MIN_ZOOM = 0.1`, `MAX_ZOOM = 3`)
- **Zoom**: scroll wheel, centered on cursor
- **Pan**: Space + drag, middle-mouse drag, or Hand tool drag
- **Fit all**: auto-triggered when `groups.length` changes (new AI module added)

---

## Dot Grid Background

```css
background-image: radial-gradient(circle, rgba(124,58,237,0.07) 1px, transparent 1px);
background-size: {28 × scale}px {28 × scale}px;
background-position: {x % (28 × scale)}px {y % (28 × scale)}px;
```

Dots move with pan and scale with zoom to create the infinite-canvas illusion.

---

## Doubt System

### How it triggers
1. **Double-click empty canvas** → `handleCanvasDoubleClick` → `openDoubtPopup(worldX, worldY)`
2. **Right-click** → context menu → "Ask a doubt here"
3. **SelectionBar** → "Ask about selection" → `openDoubtPopup` pre-filled

### DoubtPopup positioning
Renders in **screen space** (fixed, not canvas-world) so it stays put during zoom/pan. Screen position = `worldX × scale + panX + containerLeft`.
