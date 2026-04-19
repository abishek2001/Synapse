# Component Hierarchy & Responsibilities

## Landing Page (`/`)

```
app/page.tsx
  └── Navbar
  └── HeroTitle
  └── InputBar           ← topic/URL/file input + persona + voice
  └── SuggestedTopics
```

### `InputBar` (`src/components/InputBar.tsx`)
- **Reads**: nothing (local state only)
- **Writes**: on submit — calls `useCanvasStore.clearCanvas()`, `useGroundingStore.reset()`, then `useSessionStore.initSession(query, persona, files)` in that order, then navigates
- **Features**: text input, file upload, persona selector, URL detection feedback, mic button (Web Speech API)
- **Navigation**: pushes `/workspace` on submit (no query string — session lives in the store, not the URL)
- **Session hygiene**: canvas and grounding are always wiped before a new session so old elements/study-plan never bleed in

---

## Workspace (`/workspace`)

```
app/workspace/page.tsx (Suspense wrapper)
  └── WorkspaceView
        ├── BridgeScreen (AnimatePresence — shown while loading)
        └── motion.div (workspace container)
              ├── WorkspaceNavbar
              ├── flex-row
              │     ├── LeftSidebar
              │     └── canvas-area
              │           ├── ArtifactCanvas
              │           │     ├── InfiniteCanvas
              │           │     │     ├── CanvasIntroText (when intro is set, no elements yet)
              │           │     │     ├── EmptyHint (when canvas is empty)
              │           │     │     ├── GroupBoundary × N   ← rendered below elements
              │           │     │     ├── FlowArrows (SVG)
              │           │     │     ├── ElementCard × N     ← artifact / text / sticky
              │           │     │     └── StrokeElement × N   ← pen annotations (always on top)
              │           │     ├── HandTrackingOverlay
              │           │     ├── SelectionBar (floating)
              │           │     ├── DoubtPopup (fixed screen)
              │           │     └── CanvasContextMenu (fixed screen)
              │           ├── SourcesPanel (absolute, top-right)
              │           ├── MockButton (absolute, bottom-right)
              │           └── CanvasInputBar (absolute, bottom-center)
              └── CallFriendModal (conditional)
```

---

## Component Reference

### `WorkspaceView` (`src/components/workspace/WorkspaceView.tsx`)
- **Reads**: `useSessionStore` (incl. `sessionId`, `query`, `persona`), `useGroundingStore`, `useUIStore`
- **Responsibilities**: bridge loading sequence, layout composition, workspace container
- **Routing**: no longer reads URL query params. If `!sessionId || !query`, calls `router.replace("/")` to send the user back to the landing page. The session is the source of truth — refresh/back/forward all rehydrate from `localStorage["synapse-session"]` via Zustand persistence.

### `BridgeScreen` (`src/components/workspace/BridgeScreen.tsx`)
- **Props**: `query, persona, stages, logs, contextCard, latencyMs, fileNames`
- **Visual**: full-screen light overlay with animated whiteboard — group boxes draw in via SVG `pathLength` animation, connection arrows route direction-aware (horizontal right→left, vertical bottom→top), floating cursor dot
- **Exit**: `AnimatePresence` with `exit={{ opacity:0, scale:0.98 }}`
- **Arrow animation**: uses Framer Motion `pathLength` (0→1) instead of manual `strokeDasharray`/`strokeDashoffset` to ensure correct length calculation

### `Render3DCard` (`src/components/canvas/Render3DCard.tsx`)
- **Props**: `artifact: Render3DArtifact`
- **Two render modes** (selected by which field the artifact carries):
  - **`embed_url` mode** (TIER 1 — preferred): if `artifact.embed_url` is set, renders it directly as `<iframe src>` with `allow-scripts allow-same-origin allow-popups` — used for Sketchfab and other hosted viewers. Highest visual quality; no Three.js code executed.
  - **`code` mode** (TIER 2 / TIER 3): sandboxed `<iframe srcdoc>` with Three.js r160 + OrbitControls pre-booted. The AI either:
    - **TIER 2** — uses `GLTFLoader` / `OBJLoader` / `MTLLoader` from `three/addons/...` to load real models from CORS-enabled hosts (`raw.githubusercontent.com`, `cdn.jsdelivr.net/gh`, `modelviewer.dev/shared-assets`, KhronosGroup glTF-Sample-Models, `threejs.org/examples/models`), then centers + scales them.
    - **TIER 3** — hand-writes `THREE.Mesh` geometries when no real model is reachable.
- **Source resolution**: TIER 1 is resolved server-side. The tool `canvas_generate_3d_render` exposes a `sketchfab_query` parameter (NOT `embed_url`) — `handleGenerate3DRender` in `src/lib/tools/handlers.ts` calls `resolveSketchfabModel` from `src/lib/sketchfab.ts`, which hits the public Sketchfab v3 search API, picks the most-liked public + embeddable result, and stamps the verified `embed_url` onto the artifact. This stops the model from hallucinating UIDs (which 404 in the iframe). If Sketchfab returns no usable result, the handler throws an error like `"Sketchfab returned no embeddable model for X. Retry with `code` instead."` — the orchestrator's per-tool catch reports this back to the model, which then retries with TIER 2 or TIER 3 code in the same turn.
- **Interactions**: drag to rotate, scroll to zoom, right-drag to pan (OrbitControls)
- **Height**: fixed `420px`
- **AI contract** (code mode): Globals: `scene`, `camera`, `THREE`, `controls`, `renderer`. Pre-added: ambient + directional sun + blue fill + violet accent lights. Define `function update(t)` (t in seconds) for per-frame animation.
- **Error handling**: `window.onerror` in iframe posts `render3d_error` via `postMessage`; React state renders an error overlay
- **`bg_color`** / **`camera_distance`**: optional fields controlling scene background and initial camera Z distance (code mode only)

### `GraphCard` (`src/components/canvas/GraphCard.tsx`)
- **Props**: `artifact: GraphArtifact`
- **Chart types**: 12 types dispatched by `artifact.graph_type` — line, area, scatter, trend, forecast, parametric, bar, pie, polar, box, violin, density
- **Sub-renderers** (in `src/components/canvas/graph/`):
  - `LineChart.tsx` — line/area/scatter/trend/forecast/parametric families (canvas hook)
  - `BarChart.tsx` — grouped vertical bars (canvas hook)
  - `PieChart.tsx` — pie/donut (canvas hook)
  - `PolarChart.tsx` — polar r=f(θ) (canvas hook)
  - `DistributionChart.tsx` — box-and-whisker, violin KDE, and density KDE (canvas hook)
- **Slider bank**: rendered when `artifact.variables` is set. Each `GraphVariable` maps to a range input. π-increment sliders (`step_unit: "π"`) display values as π fractions (π/4, π/2, π, ...) and pass `value × Math.PI` to expressions.
- **Tooltip**: crosshair + floating tooltip on line-family charts only

### `ArtifactCanvas` (`src/components/workspace/ArtifactCanvas.tsx`)
- **Reads**: `useCanvasStore` (elements, groups, connections, toasts, selectedElementIds), `useUIStore`
- **State**: `tool`, `canvasScale`, `hoveredGroupId`
- **Writes**: `selectElements`, `toggleElementSelected`, `clearSelection`, `addElement`, `moveElement`, `removeElement`
- **Ref handle** (`ArtifactCanvasHandle`): `zoomToGroup(groupId: string)` — computes bounds via `computeGroupBounds` and calls `canvasHandleRef.current?.zoomToRect(..., 60, 1.0)` (clamped to 100% min scale so small groups don't get artificially magnified). Used by `WorkspaceView` to wire TOC navigation.
- **Auto-zoom on new AI group**: when `groups.length` increases by 1 it calls `zoomToRect(..., 80, 1.0)` so newly added modules sit at natural scale (only shrinking if too large to fit).
- **Key logic**:
  - `handleElementSelect(id, multi)` — if element is grouped, selects/toggles the **entire group**
  - `hoveredGroupId` — set by `onGroupHover` from each element; passed to `GroupBoundary` as `isHovered`
  - Elements render in two layers: non-strokes first (sorted by `zIndex`), then strokes (always on top, `zIndex: 9000 + element.zIndex`)
  - `canvasScale` updated via `onTransformChange` and passed to elements for correct drag delta math

### `InfiniteCanvas` (`src/components/workspace/InfiniteCanvas.tsx`)
- **Props**: `children, onCanvasClick?, onDoubleClick?, onRightClick?, onShiftClick?, onBoxSelect?, externalTool?, onToolChange?, darkMode?, onStrokeComplete?, strokeColor?, onTransformChange?`
- **Ref handle** (`InfiniteCanvasHandle`): `getTransform(), panBy(), screenToWorld(), worldToScreen(), zoomToRect(x, y, w, h, padding=80, minScale=0), fitAll()`. `minScale` clamps the computed fit-to-rect scale so callers can prevent zooming past natural size — `s = max(fitScale, minScale)`.
- **Tool type**: `"interaction" | "select" | "hand" | "text" | "sticky" | "pen"`
- **Event delegation**: returns early (no capture) when `e.target.closest("[data-element-id]")` — gives element React handlers uncontested pointer ownership
- **Rubber-band**: drawn in Select mode over empty canvas; fires `onBoxSelect(x1, y1, x2, y2)` in world coords

### `ElementCard` (`src/components/workspace/ElementCard.tsx`)
- **Props**: `element, isSelected, onSelect, canvasScale, currentTool, onGroupHover?`
- **Handles**: `artifact`, `text`, `sticky` element types; `pending` elements (renders `SkeletonCard`)
- **Pending state**: when `element.pending === true`, renders `SkeletonCard` in place of the artifact with a shimmer animation. Skeleton dimensions match the artifact type's expected height.
- **Drag model**: `useRef` drag state with `groupMembers` snapshot; `onGripDown` works in Hand+Select; `onRootDown` works in Select only. Group drag moves all members uniformly.
- **Group hover**: fires `onGroupHover(element.groupId)` on enter, `onGroupHover(null)` on leave
- **Identifier**: `data-element-id={element.id}` on root div (InfiniteCanvas key for early-return)
- **Height measurement**: `ResizeObserver` on the root div calls `setElementHeight(id, offsetHeight)` after every resize. Uses `offsetHeight` (not `getBoundingClientRect`) so the measurement is transform-independent and unaffected by canvas zoom or counter-scale.
- **Birth-scale counter-transform**: outer positioning div gets `transform: scale(counterScale); transformOrigin: 0 0`. `counterScale = clamp(canvasScale/birthScale, 0.1, 1) / canvasScale`. Elements cap at 100% of their natural size when zooming in, shrink proportionally when zooming out. Inner `motion.div` handles only entrance animation and is unaffected.

### `SkeletonCard` (`src/components/canvas/SkeletonCard.tsx`)
- **Props**: `artifactType: string, title?: string`
- **Visual**: shimmer skeleton matching the expected visual shape of each artifact type (different shimmer layouts for graph, notation, flashcard, simulation, render3d, diagram, visual, lookup)
- **Height**: type-specific heights matching `ELEM_H_EST` estimates
- **Usage**: rendered by `ElementCard` when `element.pending === true`

### `StrokeElement` (`src/components/workspace/StrokeElement.tsx`)
- **Props**: `element, isSelected, onSelect, canvasScale, currentTool, onGroupHover?`
- **Renders**: SVG `<path>` from stroke points using quadratic bezier smoothing
- **z-index**: `9000 + element.zIndex` — always above all artifact cards
- **Drag**: same grip handle + group drag logic as `ElementCard`
- **Identifier**: `data-element-id={element.id}`

### `GroupBoundary` (`src/components/workspace/GroupBoundary.tsx`)
- **Props**: `group, elements, hasSelectedMember, isHovered, canvasScale`
- **Visual**: rounded rect with a handwritten Caveat heading at top-left (`group.name`); border highlights when `isHovered || hasSelectedMember`. Padding: `PAD_X=20, PAD_TOP=52, PAD_BOTTOM=20` — the larger top pad reserves space for the heading.
- **Counter-scaled heading**: `fontSize = 15 * (1/canvasScale)` when zoomed in past 1× (and the heading's top/left padding scales the same way). This keeps the title readable at natural size at any zoom — same trick `ElementCard` applies to artifact content.
- **Interaction**: `pointer-events-none` — no toolbar buttons. Group controls live in `SelectionBar`.
- **Bounds computation**: uses `canvasScale` to compute each element's visual world-space edges — `right = el.x + el.w * counterScale`, `bottom = el.y + el.h * counterScale` — so the boundary shrinks with content when zoomed in past 1×
- **Exports**: `computeGroupBounds(groupId, elements, canvasScale?)` — returns visual world-space bounding box `{x, y, w, h}` used for zoom-to-fit and hit testing. `canvasScale` defaults to `1` if omitted. Also exports `PendingGroupBoundary` (see below).

### `PendingGroupBoundary` (in `GroupBoundary.tsx`)
- **Props**: `elements, title, canvasScale`
- **When rendered**: `useCanvasStore().pendingModule != null` — i.e. the AI is actively streaming artifacts for a new module that hasn't been finalized into a real `CanvasGroup` yet.
- **Visual**: dashed violet rounded rectangle with a pulsing dot + handwritten "Generating: <title>" label (or "Generating module…" before the tutor response arrives). `pointer-events-none`.
- **Lifecycle**: see `CANVAS.md → Pending module` for the full state-machine. `useAIChat` drives `startPendingModule / addToPendingModule / setPendingModuleTitle / clearPendingModule` from SSE stream events.

### `ModuleTimeline` (`src/components/workspace/ModuleTimeline.tsx`)
- **Reads**: `useGroundingStore` (`studyPlan, sessionContext`), `useUIStore` (`darkMode, moduleTimelineDock, moduleTimelineMinimized, moduleTimelineExpanded`), `useSessionStore` (`setPendingVoiceText`)
- **Anchored** at one of six dock positions (`tl, tc, tr, bl, bc, br`) — user-configurable via the in-component `DockPicker`, persisted to `localStorage["synapse:moduleTimelineDock"]`.
- **States**:
  - **Pill** (default): rounded-full pill with progress ring + "Module N of T" + step dots. On hover, shows the dropdown.
  - **Dropdown**: separate `rounded-2xl` rectangle that hangs **below** the pill (or **above** when docked at the bottom — controlled by `flex-col-reverse`). Lists every module with status icon (Check / pulsing dot / Circle). Header has the dock picker + minimize button.
  - **Minimized**: a tiny `w-9 h-9` circle showing only the progress ring. Persisted via `localStorage["synapse:moduleTimelineMin"]`. Hover reveals the dock picker so users can move the circle without re-expanding.
- **Toast coordination**: writes `useUIStore().moduleTimelineExpanded = true` only when the dropdown is open AND `dock === "tc"` — that's the only case where the canvas-toast container at top-center actually overlaps. `ArtifactCanvas`'s toast container reads this flag and springs its `top` from `56px → 280px` to clear the dropdown.

### `SelectionBar` (`src/components/workspace/SelectionBar.tsx`)
- **Reads**: `useCanvasStore` (selectedElementIds, elements, groups)
- **Visible when**: `selectedElementIds.length >= 1`
- **Actions**: clear selection, group selected elements, ungroup (when all selected share one `groupId`), ask doubt about selection
- **Primary UI for group management** — GroupBoundary intentionally has no toolbar

### `LeftSidebar` (`src/components/workspace/LeftSidebar.tsx`)
- **Props**: `open: boolean, onToggle: () => void, onZoomToGroup?: (groupId: string) => void`
- **Reads**: `useCanvasStore` (groups, elements), `useUIStore` (darkMode), `useSessionStore` (docHeadings)
- **Visual**: two sections in the scrollable list —
  - **Document** (when `docHeadings.length > 0`): H1/H2 headings extracted from parsed docs; shown as a bullet-point outline before any canvas groups exist; capped at 20 entries
  - **Canvas** (when `groups.length > 0`): sorted group list with index chip, name, element type icons, element count
  - If only groups exist (no docs): shows groups only, no section label
  - If both exist: a divider + "Canvas" label separates the two sections
  - If neither exists: placeholder "Ask something to add groups…"
- **TOC navigation**: when `onZoomToGroup` is provided, group rows are `cursor-pointer` and clicking calls `onZoomToGroup(group.id)` → canvas pans/zooms to that group's bounds
- **Wiring**: `WorkspaceView` passes `(groupId) => artifactCanvasRef.current?.zoomToGroup(groupId)` as `onZoomToGroup`

### `CanvasInputBar` (`src/components/workspace/CanvasInputBar.tsx`)
- **Reads**: `useSessionStore` (`voiceMode, liveCaption, isSpeaking, speakReady, followUpQuestions, learningMode, messages, query, pendingVoiceText, moduleQueue`), `useAIChat` (`sendMessage, speakLatest, isStreaming, latestTutor`)
- **Writes**: `setVoiceMode, setLiveCaption, setFollowUpQuestions, setLearningMode, setPendingVoiceText, setModuleQueue, shiftModuleQueue` (session store); `sendMessage, speakLatest` (`useAIChat`)
- **Modes**: normal (column of cards above an input pill) | voice (floating pulse pill + live caption)
- **Layout (top → bottom inside the bottom-center column, `max-w-xl`)**:
  1. **Mode picker card** (one-shot) — shown when `learningMode === null && messages.length === 0 && !isStreaming`. Two buttons: **Guided** (`BookOpen`, neutral) and **Auto Explore** (`Wand2`, violet accent). Picking a mode calls `handlePickMode(mode)` which sets `learningMode` and either fires a single comprehensive prompt (auto, no plan) or queues every module from `useGroundingStore.studyPlan` into `moduleQueue` (auto, multi-module plan), or just sends the topic as the first message (guided).
  2. **Dismissible Synapse bubble** — shown when `latestTutor && !showModePicker && !bubbleDismissed`. Compact dark card with a `Sparkles` Synapse badge, an inline Speak button (when `speakReady && !isSpeaking`), an X to dismiss, and a `max-h-[30vh]` scrollable body containing `latestTutor.content`. A `useEffect` resurfaces the bubble (clears `bubbleDismissed`) whenever a new tutor message arrives (tracked via `lastShownTutorId` ref).
  3. **Follow-up chips** — `followUpQuestions.slice(0, 2)` rendered as tier-1 violet chips. Hidden during streaming or when the mode picker is showing. Clicking a chip clears the array and sends the question.
  4. **Single-line input pill** — text input + (streaming spinner | speak/mic/send buttons).
- **YouTube-style live captions** (rendered outside the column, fixed position): `bottom-28 left-1/2`, dark translucent pill with white text, shown only while `isSpeaking && liveCaption`. Replaces the older "snippet card above the input bar" — captions now appear as a TV-style overlay over the canvas during TTS playback.
- **Auto-prompt effects**:
  - When `pendingVoiceText` is set and not streaming → calls `sendMessage(pendingVoiceText)` and clears it.
  - When `moduleQueue.length > 0` and not streaming → shifts the head of the queue and sends it. Used by Auto Explore mode to chain through every module of a multi-module study plan.
- **Defaulting**: if the user types into the pill or clicks a chip without picking a mode, `learningMode` is silently set to `"guided"`.
- **Speak button** (in input pill): `Volume2` appears when `speakReady === true`. Clicking calls `speakLatest()` and clears `speakReady`.

### `RightSidebar` (`src/components/workspace/RightSidebar.tsx`)
- **Props**: `open: boolean, onToggle: () => void`
- **Sections**: Transcript (collapsible) + Activity (collapsible)
- **Live caption strip**: appears at the top when `isSpeaking` is true — shows `liveCaption` text or pulsing dots if caption is empty. Has `Volume2` icon.
- **Auto-open**: `useEffect` watches `isSpeaking`; if sidebar is closed when AI starts speaking, calls `onToggle()` to open it automatically
- **Width**: animates 0 ↔ 256px via Framer Motion spring

### `DoubtPopup` (`src/components/workspace/DoubtPopup.tsx`)
- **Props**: `worldX, worldY, screenX, screenY, prefill?, onClose`
- **Positioned**: fixed screen coords (not canvas-space)

### `MockButton` (`src/components/workspace/MockButton.tsx`)
- **Position**: `absolute bottom-20 right-4 z-40`
- **Note**: Remove before production
- **Calls**: `useCanvasStore().loadMockData(query)` → `buildMockCanvas(topic)` in `src/store/canvas.ts`
- **Mock canvas layout** (3 rows):
  - **Row 1** — 6 groups exercising all visual styles + complementary artifact types (concept map + flashcard, notation + graph-line, timeline + area graph, comparison + lookup, diagram + simulation, flowchart + hierarchy)
  - **Row 2** — Chart Gallery: 12 single-element groups, one per graph type (line, area, scatter, trend, forecast, parametric, bar, pie, polar, box, violin, density)
  - **Row 3** — 3D Render Gallery: 6 single-element groups showcasing `render3d` across disciplines:
    - **Human Heart** — Sketchfab embed (`embed_url` mode); anatomically correct model with all chambers, arteries, and veins
    - **DNA Double Helix** — biology (28 base pairs, color-coded rungs, backbone segments)
    - **H₂O Molecule** — chemistry (CPK spheres, 104.5° bond angle, electron cloud, angle arc)
    - **Projectile Motion** — physics (animated ball + live velocity arrow + drop lines, loops)
    - **NaCl Crystal Lattice** — crystallography (InstancedMesh Na⁺/Cl⁻, LineSegments bonds)
    - **Animal Cell** — biology; loads `CellAnatomy.obj` + `.mtl` from `raw.githubusercontent.com/erick1439/3d-Cell-Model` via `OBJLoader` + `MTLLoader`; auto-centers and scales

### `CanvasContextMenu` (`src/components/workspace/CanvasContextMenu.tsx`)
- **Props**: `screenX, screenY, worldX, worldY, targetModuleId?, onClose, onSetTool, onExpandModule`
- **Positioned**: `fixed` at screen coords, clamped to viewport

---

## Hooks

### `useAIChat` (`src/hooks/useAIChat.ts`)
- **Returns**: `{ sendMessage, speakLatest, isStreaming, latestTutor }`
- **Pipeline**: user message → `/api/chat` SSE → read events → update stores + canvas
- **Canvas context**: `serializeCanvasContext()` converts current canvas elements into a text summary (type, title, groupId) sent with every request to avoid duplicate artifacts
- **SSE events handled**:
  - `thinking` — no UI action
  - `artifact_pending` → `addPendingElement` → `SkeletonCard` appears immediately
  - `artifact_done` → `resolvePendingElement` → skeleton replaced by real artifact
  - `tutor_response` → stores `moduleTitle`/`writtenText`/`spokenText`/`questionsForUser` in refs; `addMessage(writtenText)` to transcript; sets tier-1 chips from `questionsForUser`
  - `follow_up` → appends tier-2 chips (strategy suggestions); deduplicates against tier-1
  - `done` → `applyPatch`, calls `addModule(label, resolvedArtifacts, undefined, writtenText)` where `label = moduleTitleRef.current || truncate(userQuery, 50)`, sets `speakReady = true`
  - `error` → adds error tutor message
- **Module title source**: `moduleTitle` comes from the tutor's structured JSON response (3-6 word topic title). Falls back to the truncated user query if the tutor didn't emit one. This becomes the `group.name` shown by `GroupBoundary`.
- **Delayed speech**: on `done`, sets `speakReady = true`. User clicks the Speak button → `speakLatest()` speaks `spokenText` (not `writtenText`).
- **`speakLatest()`**: reads `spokenTextRef.current`, calls `speak()` with a word-boundary callback that updates `liveCaption` word-by-word via `SpeechSynthesisUtterance.onboundary`; clears `liveCaption` on end. Sets `speakReady = false`.

---

## Stores

### `useCanvasStore` (`src/store/canvas.ts`)
- **Key state**: `elements: CanvasElement[], groups: CanvasGroup[], connections, selectedElementIds, toasts`
- **Key actions**: `addElement, removeElement, moveElement, setElementHeight, updateElementText, updateStickyContent, selectElements, toggleElementSelected, clearSelection, groupSelected, ungroupElements`
- **`addPendingElement(el)`**: adds an element with `pending: true`; renders `SkeletonCard` until resolved
- **`resolvePendingElement(id, artifact)`**: sets `pending: false`, sets `artifact`, updates `type` — replaces skeleton with real artifact
- **`setElementHeight(id, h)`**: writes the measured pixel height onto `el.h`; skipped when height hasn't changed to avoid spurious re-renders.
- **`addModule(title, artifacts, crumbs?, writtenText?)`**: creates group + lays out elements. If `writtenText` is provided, a `text` element is placed at the top of the group before the artifact elements.
- **Persistence**: Zustand `persist` middleware writes `{ elements, groups, connections, updates }` to `localStorage` under key `synapse-canvas`. Transient state (`toasts`, `strokes`, `selectedElementIds`, `isMockMode`) is excluded.

### `useSessionStore` (`src/store/session.ts`)
- **Key state**: `query, persona, sessionId, files, urls, messages, isStreaming, voiceMode, liveCaption, followUpQuestions, speakReady, docHeadings, learningMode, moduleQueue, pendingVoiceText`
- **Key actions**: `initSession, addMessage, setVoiceMode, setLiveCaption, setFollowUpQuestions, setSpeakReady, setDocHeadings, setLearningMode, setModuleQueue, shiftModuleQueue, setPendingVoiceText`
- **`urls`**: URLs submitted alongside the query (extracted from InputBar text via `detectUrls`)
- **`followUpQuestions`**: array of 2-3 suggested next questions; displayed as chips above the input bar
- **`speakReady`**: true when AI response is ready but TTS hasn't played yet; triggers Speak button in `CanvasInputBar`
- **`docHeadings`**: H1/H2 headings extracted from all parsed/fetched documents during the bridge sequence; used by `LeftSidebar` as a document outline before any canvas groups exist
- **`learningMode`**: `"guided" | "auto" | null`. `null` triggers the mode picker in `CanvasInputBar` on the first message of a session. Forwarded to `/api/chat` so the orchestrator can pick the right system prompt and tool budget (`auto` → 8 tool rounds, 4096 tokens, `tool_choice: "required"`; `guided` → 4 rounds, 1536 tokens).
- **`moduleQueue`**: ordered list of prompts to fire one-by-one as `isStreaming` clears. Used by Auto Explore mode to walk the user through every module of a multi-module `studyPlan` without further input.
- **`pendingVoiceText`**: single-shot prompt that `CanvasInputBar` will dispatch on the next non-streaming tick. Used by `handlePickMode` and voice flows.
- **Persistence**: Zustand `persist` middleware writes `{ query, persona, sessionId, canvasTitle, messages, urls, followUpQuestions, docHeadings }` to `localStorage` under key `synapse-session`. Heavy payloads (`files`, `documents`, `documentContext`) and transient UI flags (incl. `learningMode`, `moduleQueue`, `pendingVoiceText`) are excluded.

### `useUIStore` (`src/store/ui.ts`)
- **Key state**: `leftSidebarOpen, doubtPopup, contextMenu, darkMode, canvasScale`
- **Key actions**: `openDoubtPopup, closeDoubtPopup, openContextMenu, closeContextMenu, setCanvasScale`
- **`canvasScale`**: live canvas zoom level (default 1), synced from `ArtifactCanvas.onTransformChange`. Read non-reactively via `useUIStore.getState().canvasScale` in canvas store actions to stamp `birthScale` at element creation time.

### `useGroundingStore` (`src/store/grounding.ts`)
- **Key state**: `studyPlan, sessionContext, retrievalIndexed`
- **Key actions**: `setStudyPlan, setSessionContext, setRetrievalIndexed`
