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
              │           ├── CanvasInputBar (absolute, bottom-center)
              │           └── ChatErrorBanner (absolute, bottom-left — only when rate-limited / timed out)
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
  - **`embed_url` mode** (TIER 1 — Sketchfab): if `artifact.embed_url` is set, renders it directly as `<iframe src>` with `allow-scripts allow-same-origin allow-popups` — used for verified Sketchfab models. Highest visual quality; no Three.js code executed.
  - **`code` mode** (TIER 2 — server-generated scene): sandboxed `<iframe srcdoc>` with Three.js r160 + OrbitControls pre-booted. The injected JS comes from a dedicated server-side generation step (NOT inline from the tutor). It can either load real `.glb`/`.obj` models via `GLTFLoader` / `OBJLoader` / `MTLLoader` (importmap injects `three/addons/...`) from CORS-enabled hosts (`raw.githubusercontent.com`, `cdn.jsdelivr.net/gh`, `modelviewer.dev/shared-assets`, KhronosGroup glTF-Sample-Models, `threejs.org/examples/models`), or build geometry from scratch. The card scaffold pre-defines `scene`, `camera`, `controls`, `renderer`, ambient + directional sun + blue fill + violet accent lights, and the render loop.
- **Source resolution** — happens entirely in `handleGenerate3DRender` (`src/lib/tools/handlers.ts`). The tutor calls `canvas_generate_3d_render` with **`topic` + `concept_brief` + optional `sketchfab_query` + optional `style_hints`** — it never writes Three.js itself.
  - **Tier 1 (Sketchfab)**: if `sketchfab_query` is set, `resolveSketchfabModel` (`src/lib/sketchfab.ts`) hits Sketchfab v3 search, picks the highest-relevance public + embeddable model, and stamps the verified `embed_url` onto the artifact. UIDs from the LLM are never trusted (that path produced 404s).
  - **Tier 2 (dedicated scene generator)**: if Sketchfab missed (or `sketchfab_query` was omitted for an abstract/dynamic concept like projectile motion), the handler calls the OpenAI **Responses API** with `RENDER3D_SYSTEM_PROMPT` + `buildRender3DPrompt` (`src/lib/render3d/prompt.ts`). The default model is **`gpt-5.4`** (overridable via `OPENAI_RENDER3D_MODEL`) with `reasoning.effort: "low"` and `text.verbosity: "high"` and `max_output_tokens: 8000`. The system prompt embeds the hand-crafted **Projectile** and **NaCl** demos from `src/store/canvas.ts` verbatim as gold-standard few-shot examples — describing required quality wasn't enough to lift the smaller models above flat-line output, so the prompt now shows the bar instead. Output is sanitized by `sanitizeRender3DCode` and stamped onto `artifact.code`. Older non-GPT-5 models fall back to Chat Completions with `temperature: 0.4`.
- **Interactions**: drag to rotate, scroll to zoom, right-drag to pan (OrbitControls)
- **Height**: fixed `420px`
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
- **Reads**: `useCanvasStore` (elements, groups, connections, selectedElementIds), `useUIStore`
- **State**: `tool`, `canvasScale`, `hoveredGroupId`
- **Writes**: `selectElements`, `toggleElementSelected`, `clearSelection`, `addElement`, `moveElement`, `removeElement`
- **Ref handle** (`ArtifactCanvasHandle`): `zoomToGroup(groupId: string)` — computes bounds via `computeGroupBounds` and calls `canvasHandleRef.current?.zoomToRect(..., 60, 1.0)` (clamped to 100% min scale so small groups don't get artificially magnified). Used by `WorkspaceView` to wire TOC navigation.
- **Auto-zoom on new AI group**: when `groups.length` increases by 1 it calls `zoomToRect(..., 80, 1.0)` so newly added modules sit at natural scale (only shrinking if too large to fit).
- **Key logic**:
  - `handleElementSelect(id, multi)` — if element is grouped, selects/toggles the **entire group**
  - `hoveredGroupId` — set by `onGroupHover` from each element; passed to `GroupBoundary` as `isHovered`
  - Elements render in two layers: non-strokes first (sorted by `zIndex`), then strokes (always on top, `zIndex: 9000 + element.zIndex`)
  - `canvasScale` updated via `onTransformChange` and passed to elements for correct drag delta math
- **Hand tracking (`handleGesture`)**: receives a stream of `HandGestureEvent`s from `HandTrackingOverlay` and routes them onto canvas state. `cursor` updates the hovered group via `hitTestGroup`. `grab_start` hit-tests the world point — element hit → element-drag (snapshots all sibling group positions for uniform group drag), miss → canvas-drag mode. `grab_move` either moves the dragged element / group or pans the canvas. `grab_end` with `wasClick=true` selects the element under the cursor, or clears selection if the user pinched into empty space. `pan` drags via `panBy(dx × 1.4, dy × 1.4)` (gain so a comfortable hand range covers the viewport). `zoom` calls `zoomAt(factor, cx, cy)` and optionally `panBy` for the two-handed midpoint translation. State for the active pinch lives in `handDragRef` so `grab_start/move/end` can be matched without React re-renders.
- **Voice command listener (`synapse:canvas-command`)**: a window-level `useEffect` listens for `CanvasCommand` events from `lib/voice/commands.ts`. Each command maps onto an existing canvas primitive — `zoom_in/out/reset` → `zoomAt` from the viewport center; `fit_all` → `fitAll` after computing element bounds; `next_module/prev_module/goto_module` → `zoomToGroupAtIndex` (tracks an `activeModuleIdxRef` so successive "next" commands walk through groups in creation order); `pan` → `panBy`; `stop_speaking` → `stopSpeaking()`; `undo` / `clear_selection` / `select_all` → corresponding store actions; `open_doubt` → `openDoubtPopup` at viewport center. `replay` and `show_help` are forwarded as their own window events so `CanvasInputBar` (replay) and `HandTrackingOverlay` (cheatsheet toggle) can react without coupling.

### `InfiniteCanvas` (`src/components/workspace/InfiniteCanvas.tsx`)
- **Props**: `children, onCanvasClick?, onDoubleClick?, onRightClick?, onShiftClick?, onBoxSelect?, externalTool?, onToolChange?, darkMode?, onStrokeComplete?, strokeColor?, onTransformChange?, onEraseAt?, onUndoAnnotation?`
- **Ref handle** (`InfiniteCanvasHandle`): `getTransform(), panBy(), zoomAt(factor, screenX, screenY), screenToWorld(), worldToScreen(), zoomToRect(x, y, w, h, padding=80, minScale=0), fitAll()`. `minScale` clamps the computed fit-to-rect scale so callers can prevent zooming past natural size — `s = max(fitScale, minScale)`. `zoomAt` is the programmatic zoom-around-pivot used by hand-gesture pinch zoom and voice "zoom in/out" commands; it's clamped to `[MIN_ZOOM, MAX_ZOOM]` and matches the wheel/pinch math (cursor stays put under the pivot point).
- **Zoom limits**: `MIN_ZOOM = 0.05`, `MAX_ZOOM = 8`. The canvas is intentionally infinite. Artifact pixel size is capped separately by `VISUAL_SCALE_CAP = 1.5` (per-element counter-transform in `ElementCard` and matching padding counter-scale in `GroupBoundary`), so zooming past 1.5× just spreads out the whitespace between groups while artifacts and their wrappers freeze at 150% of natural size.
- **Tool type**: `"interaction" | "select" | "hand" | "text" | "sticky" | "pen" | "eraser"`
- **Event delegation**: returns early (no capture) when `e.target.closest("[data-element-id]")` — gives element React handlers uncontested pointer ownership. `pen` and `eraser` tools are exempted from this early-return (they need to receive events even over element cards).
- **Rubber-band**: drawn in Select mode over empty canvas; fires `onBoxSelect(x1, y1, x2, y2)` in world coords
- **Eraser tool**: hides the native cursor and renders a pink halo div following the pointer (radius `ERASER_RADIUS = 18` screen-px). Each pointer sample while pressed fires `onEraseAt(worldX, worldY, radius / canvasScale)` so the halo footprint stays constant in screen space at every zoom.
- **Undo shortcut**: `Cmd/Ctrl + Z` keydown calls `onUndoAnnotation` (matched against the canvas store's `annotationHistory`). A toolbar `Undo2` button next to the tool palette calls the same handler.

### `ElementCard` (`src/components/workspace/ElementCard.tsx`)
- **Props**: `element, isSelected, onSelect, canvasScale, currentTool, onGroupHover?`
- **Handles**: `artifact`, `text`, `sticky` element types; `pending` elements (renders `SkeletonCard`)
- **Pending state**: when `element.pending === true`, renders `SkeletonCard` in place of the artifact with a shimmer animation. Skeleton dimensions match the artifact type's expected height.
- **Drag model**: `useRef` drag state with `groupMembers` snapshot; `onGripDown` works in Hand+Select; `onRootDown` works in Select only. Group drag moves all members uniformly.
- **Group hover**: fires `onGroupHover(element.groupId)` on enter, `onGroupHover(null)` on leave
- **Identifier**: `data-element-id={element.id}` on root div (InfiniteCanvas key for early-return)
- **Height measurement**: `ResizeObserver` on the root div calls `setElementHeight(id, offsetHeight)` after every resize. Uses `offsetHeight` (not `getBoundingClientRect`) so the measurement is transform-independent and unaffected by canvas zoom or counter-scale.
- **Birth-scale counter-transform**: outer positioning div gets `transform: scale(counterScale); transformOrigin: 0 0`. `counterScale = visualCounterScale(canvasScale, birthScale)` from `@/store/canvas` — returns `1` while `canvasScale ≤ VISUAL_SCALE_CAP (= 1.5)` (artifact grows naturally with the canvas) and `1.5 / canvasScale` past that (artifact pixel size freezes at 150% of natural). Inner `motion.div` handles only entrance animation and is unaffected.

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
- **Visual**: rounded rect with a handwritten Caveat heading at top-left (`group.name`); border highlights when `isHovered || hasSelectedMember`. Design padding: `PAD_X=20, PAD_TOP=52, PAD_BOTTOM=20` — the larger top pad reserves space for the heading.
- **Counter-scaled heading**: `fontSize = 15 * (1/canvasScale)` when zoomed in past 1× (and the heading's top/left padding scales the same way). This keeps the title readable at natural size at any zoom.
- **Counter-scaled padding & chrome**: every padding value AND `borderRadius` / border-thickness is multiplied by `padCS = min(visualCounterScale(canvasScale, m.birthScale))` across all members. While `canvasScale ≤ VISUAL_SCALE_CAP (= 1.5)` `padCS = 1` and the design values render as-is. Past the cap `padCS = 1.5/canvasScale`, so the on-screen padding / radius / border thickness stay constant in screen pixels — preventing the historical "huge violet box around frozen artifacts" mismatch when zooming way in.
- **Interaction**: `pointer-events-none` — no toolbar buttons. Group controls live in `SelectionBar`.
- **Bounds computation**: uses `canvasScale` to compute each element's visual world-space edges — `right = el.x + el.w * visualCounterScale(...)`, `bottom = el.y + el.h * visualCounterScale(...)` — so the boundary shrinks with content past the visual cap.
- **Exports**: `computeGroupBounds(groupId, elements, canvasScale?)` — returns visual world-space bounding box `{x, y, w, h}` (with the same counter-scaled padding) used for zoom-to-fit and hit testing. `canvasScale` defaults to `1` if omitted. Also exports `PendingGroupBoundary` (see below).

### `PendingGroupBoundary` (in `GroupBoundary.tsx`)
- **Props**: `elements, title, canvasScale`
- **When rendered**: `useCanvasStore().pendingModule != null` — i.e. the AI is actively streaming artifacts for a new module that hasn't been finalized into a real `CanvasGroup` yet.
- **Visual**: dashed violet rounded rectangle with a pulsing dot + handwritten "Generating: <title>" label (or "Generating module…" before the tutor response arrives). `pointer-events-none`.
- **Lifecycle**: see `CANVAS.md → Pending module` for the full state-machine. `useAIChat` drives `startPendingModule / addToPendingModule / setPendingModuleTitle / clearPendingModule` from SSE stream events.

### `ModuleTimeline` (`src/components/workspace/ModuleTimeline.tsx`)
- **Reads**: `useGroundingStore` (`studyPlan, sessionContext`), `useUIStore` (`darkMode, moduleTimelineDock, moduleTimelineMinimized`), `useSessionStore` (`setPendingVoiceText`)
- **Anchored** at one of six dock positions (`tl, tc, tr, bl, bc, br`) — user-configurable via the in-component `DockPicker`, persisted to `localStorage["synapse:moduleTimelineDock"]`.
- **States**:
  - **Pill** (default): rounded-full pill with progress ring + "Module N of T" + step dots. On hover, shows the dropdown.
  - **Dropdown**: separate `rounded-2xl` rectangle that hangs **below** the pill (or **above** when docked at the bottom — controlled by `flex-col-reverse`). Lists every module with status icon (Check / pulsing dot / Circle). Header has the dock picker + minimize button.
  - **Minimized**: a tiny `w-9 h-9` circle showing only the progress ring. Persisted via `localStorage["synapse:moduleTimelineMin"]`. Hover reveals the dock picker so users can move the circle without re-expanding.

### `SelectionBar` (`src/components/workspace/SelectionBar.tsx`)
- **Reads**: `useCanvasStore` (selectedElementIds, elements, groups)
- **Visible when**: `selectedElementIds.length >= 1`
- **Actions**: clear selection, group selected elements, ungroup (when all selected share one `groupId`), ask doubt about selection
- **Ask AI**: visible for **any selection size** (1+). Opens the doubt popup pre-filled with a "explain this" / "explain the relationship between these" prompt and passes the first selected group's id as `originGroupId` so the doubt anchors to the marked module.
- **Primary UI for group management** — GroupBoundary intentionally has no toolbar

### `TangentReturnPill` (`src/components/workspace/TangentReturnPill.tsx`)
- **Reads**: `useCanvasStore` (`groups`, `currentMainGroupId`, `lastTangentGroupId`, `clearTangent`), `useUIStore` (darkMode)
- **Props**: `onReturn(groupId)` — wired in `WorkspaceView` to `artifactCanvasRef.current?.zoomToGroup(...)`
- **Visible when**: `lastTangentGroupId && currentMainGroupId && they differ`. Hidden as soon as the user starts a new linear turn (which becomes the new `currentMainGroupId`) or clicks the pill (which calls `clearTangent()`).
- **Position**: floating pill anchored bottom-center inside the canvas area, above `CanvasInputBar`. Violet accent on the back arrow; truncates long module names to 32 chars.

### `LeftSidebar` (`src/components/workspace/LeftSidebar.tsx`)
- **Props**: `open: boolean, onToggle: () => void, onZoomToGroup?: (groupId: string) => void, overlay?: boolean`
- **Layout modes**: `overlay = false` (default, ≥1100px) — docked column that animates 0 ↔ 240px and pushes the canvas. `overlay = true` (compact viewports, set by `WorkspaceView` via `useViewport`) — slides in from the left as a `min(280px, 86vw)` floating drawer with a tappable backdrop above the canvas.
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
- **Position**: centered horizontally; `bottom-16 lg:bottom-4`. Below `lg` (≤1024px) the pill stacks **above** the canvas's bottom toolbars (tool palette + zoom controls) so it never collides with them; on `lg` and up it sits flush with them at `bottom-4`.
- **Width**: outer container is `max-w-3xl` (~768px) so the **follow-up question chips can stretch past the input pill's edges** and stay on one line — long suggestions like "Do you want to start with forces or with field lines?" used to wrap awkwardly when constrained to the input column. The mode picker, latest-tutor bubble, and input pill themselves clamp to `w-full max-w-xl` (~576px) so they keep their familiar size; only the chip row uses the full `max-w-3xl` width.
- **Mode picker**: `grid-cols-1 sm:grid-cols-2` — stacks vertically on phones, side-by-side everywhere else.
- **Latest tutor bubble**: collapsed by default — shows a single truncated line of the response next to the Synapse mark. Clicking the header (or the chevron) expands the bubble to its full scrollable body (`max-h-[30vh]`); clicking the chevron again collapses it. The bubble is **not dismissable** — it auto-resets to the collapsed state whenever a new tutor message arrives so the canvas stays uncluttered. The chevron is `ChevronUp` when collapsed (peek upward) / `ChevronDown` when expanded (push back down). The speaker button stops propagation so clicking it doesn't accidentally toggle the bubble.
- **Reads**: `useSessionStore` (messages, voiceMode, liveCaption, isSpeaking, followUpQuestions, etc.), `useAIChat` (`playingMessageId`, `latestTutor`, `toggleMessage`)
- **Writes**: `setVoiceMode`, `setLiveCaption`, `sendMessage`, `stop`, `toggleMessage` via `useAIChat`
- **Modes**: normal (full input bar) | voice (floating pulse pill + live caption)
- **Follow-up chip tiers**:
  - Tier 1 (violet) — `questionsForUser` from the tutor's structured response; prepended first
  - Tier 2 (neutral) — `followUpQuestions` from the strategy agent; appended after tier-1
  - Chips clear immediately on click; deduplication applied between tiers
- **Speak button (replayable)**: A `Volume2` button is rendered in **two places** — the inline header of the latest-tutor bubble and to the left of Send in the input pill — whenever `latestTutor` has any playable text (`spokenText` or `content`). Both buttons share state via the `usePlayback` hook. Clicking calls `toggleMessage(latestTutor)`: if that message isn't currently playing, TTS starts; if it is, TTS stops. The button swaps to a `VolumeX` icon (with a violet-tint background) while playing. There is no longer a one-shot `speakReady` gate — the user can replay the same message any number of times.
- **Voice picker (right-click / long-press)**: Both speaker buttons open `VoicePickerPopover` on right-click (or 500ms long-press for touch). Picking a voice updates `useSessionStore.persona` and immediately replays the message with that voice via `usePlayback.playMessage(latestTutor, { voiceId })` so the user hears the change instantly.
- **Sentence-level live captions**: While any TTS is playing, a fixed-position dark pill at `bottom-28` over the canvas shows `liveCaption`. The caption is now sentence-level (was per-word) — emitted by the TTS layer's `onSentence` callback. The pill wraps to two lines (`-webkit-line-clamp: 2`) and is up to 640px wide.
- **Stop button**: while `isStreaming === true` the Send button slot is replaced by a pulsing red `Square` button. Clicking calls `stop()` from `useAIChat`, which aborts the in-flight `/api/chat` fetch — the server forwards the abort to OpenAI and the client tears down skeleton cards and pushes a "Stopped" entry to the activity feed.
- **Voice command interception**: `pendingVoiceText` (set by the speech-to-text layer) is intercepted by `lib/voice/commands.ts → classifyCommand` BEFORE being forwarded to `sendMessage`. If the transcript matches a strict navigation phrase ("zoom in", "next module", "fit all", "stop speaking", "help", etc.), a `CanvasCommand` is dispatched over the `synapse:canvas-command` window event (consumed by `ArtifactCanvas`) and the input is consumed silently. Anything that doesn't classify falls through to the tutor as a normal question. See `CANVAS.md → Voice canvas commands` for the full table. A separate `synapse:replay` listener here also re-plays the latest tutor message via `toggleMessage(latestTutor)` so "say that again" works from any context.

### `RightSidebar` (`src/components/workspace/RightSidebar.tsx`)
- **Props**: `open: boolean, onToggle: () => void, overlay?: boolean`
- **Layout modes**: `overlay = false` (default, ≥1100px) — docked column that animates 0 ↔ 256px and pushes the canvas. `overlay = true` (compact viewports, set by `WorkspaceView` via `useViewport`) — slides in from the right as a `min(320px, 90vw)` floating drawer with a tappable backdrop above the canvas. The auto-open-on-`isSpeaking` behaviour is suppressed in overlay mode so a drawer doesn't slam over the canvas mid-explanation.
- **Sections**: Transcript (collapsible) + Activity (collapsible)
- **Live caption strip**: appears at the top when `isSpeaking` is true — shows the **current sentence** from `liveCaption` or pulsing dots if caption is empty. Has `Volume2` icon.
- **Per-message speaker buttons**: every tutor row in the transcript has a small `Volume2` button anchored to the bottom-right of the bubble. Hidden by default, fades in on row hover; locked visible while that specific message is playing (`playingMessageId === msg.id`) with a violet tint. Click toggles play/stop via `usePlayback.toggleMessage(msg)` — uses `msg.spokenText` if present, else `msg.content`. **Right-click** (or 500ms long-press on touch) opens `VoicePickerPopover` anchored to the button; picking a voice replays that specific message with the new voice.
- **Auto-open**: `useEffect` watches `isSpeaking`; if sidebar is closed when AI starts speaking, calls `onToggle()` to open it automatically
- **Width**: animates 0 ↔ 256px via Framer Motion spring
- **Activity feed**: reads `useCanvasStore().updates` (last 30, newest first). Each row renders a colored status dot (`UPDATE_DOT[type]`), the event `title`, a 2-line clamped `detail`, and a relative timestamp. This is the **only** surface for "what is the AI doing right now" — the canvas no longer carries a separate transient "thinking…/adding to canvas" toast; everything lands here. Event types and dot colors:
  - `thinking` — amber pulse — start of a turn (detail = the user's prompt)
  - `artifact_generating` — amber pulse — per-artifact tool call in flight (detail = artifact title)
  - `artifact_added` — cyan — per-artifact resolved onto canvas (detail = artifact title)
  - `module_added` — emerald — group finalized (detail = "<n> artifacts + explanation on canvas")
  - `doubt_answered` — violet — `DoubtPopup` ran a synthetic group
  - `selection_asked` — blue — selection-bar question
  - `ai_note` — cyan — orchestrator-side note (e.g. "Started: <topic>")
  - `error` — rose — tool failure / stream error / user-cancel

### `DoubtPopup` (`src/components/workspace/DoubtPopup.tsx`)
- **Props**: `worldX, worldY, screenX, screenY, prefill?, onClose`
- **Positioned**: fixed screen coords (not canvas-space)

### `MockButton` (`src/components/workspace/MockButton.tsx`)
- **Position**: `absolute bottom-20 right-4 z-40`. Hidden under `sm` (`<640px`) since it's a dev-only affordance.
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

### `ChatErrorBanner` (`src/components/workspace/ChatErrorBanner.tsx`)
- **Reads**: `useSessionStore` (`chatError`, `isStreaming`), `useUIStore` (`darkMode`)
- **Writes**: `setChatError(null)` on dismiss / on retry success (via `sendMessage` in `useAIChat`)
- **Renders**: only when `chatError !== null`. Floating rose-bordered card anchored at `bottom-20 left-4` of the canvas area (above the tool palette, off-axis from the centred tutor bubble / input pill).
- **Triggered for**: `code === "rate_limit" | "timeout"` only. `unknown` errors still fall through to the legacy "Something went wrong. Let me try again…" tutor message so the apology surface keeps working for true unknowns.
- **Retry**: button calls `useAIChat().sendMessage(chatError.retryPrompt)`. `sendMessage` clears `chatError` at the start of every turn — successful retries make the banner disappear; a second failure repopulates it. While `isStreaming` the button shows a spinning icon and is disabled.
- **Cooldown**: when the upstream provided a `retryAfterMs` (e.g. OpenAI 429 with `Retry-After`) the button is disabled and shows "Retry in Xs", ticking down every 500ms.
- **Icon swap**: `Clock` for timeouts, `AlertTriangle` for rate limits.

### `VoicePickerPopover` (`src/components/workspace/VoicePickerPopover.tsx`)
- **Props**: `anchor: DOMRect, onClose: () => void, replayMessage?: Message`
- **Triggered by**: right-click (or 500ms long-press on touch) on **any** speaker button — the bubble header's, the input pill's, or any per-message row in the transcript.
- **Visual**: small fixed-position popover with a list of `VOICE_OPTIONS` (from `lib/voice/elevenlabs-config.ts`). Each row shows a friendly label + blurb and a `Check` icon next to the currently active persona. Anchored below the trigger by default; flips above when there isn't enough room.
- **On pick**: calls `setPersona(personaKey)` so future TTS uses that voice, AND if a `replayMessage` was provided, immediately calls `usePlayback.playMessage(replayMessage, { voiceId })` so the user hears the change at once.
- **Dismiss**: outside `mousedown` (capture phase, beats `stopPropagation`) or `Escape`.

### `CanvasContextMenu` (`src/components/workspace/CanvasContextMenu.tsx`)
- **Props**: `screenX, screenY, worldX, worldY, targetModuleId?, onClose, onSetTool, onExpandModule`
- **Positioned**: `fixed` at screen coords, clamped to viewport

### `HandTrackingOverlay` (`src/components/workspace/HandTrackingOverlay.tsx`)
- **Props**: `enabled: boolean, onGesture: (e: HandGestureEvent) => void, containerRef, darkMode?`
- **Purpose**: opt-in webcam hand tracking. Lazy-loads `@mediapipe/tasks-vision` Hand Landmarker (numHands=2), classifies each frame through a per-hand `HandStateMachine` from `lib/hand-tracking/gestures.ts`, and emits high-level events to `ArtifactCanvas`.
- **Gesture model** (single hand): `none | point | openPalm | pinch | fist | peace`. The state machine applies temporal majority filtering (sliding window) and pinch hysteresis (different distance thresholds for entering vs leaving the pinch state) so the recognised gesture doesn't flicker between adjacent poses.
- **Two-hand gesture**: when both hands enter pinch on the same frame, distance change between the two pinch points produces a `zoom` event with the midpoint as pivot and the midpoint translation as `dx/dy` (pan-while-zoom).
- **`HandGestureEvent` API** (consumed by `ArtifactCanvas`):
  - `cursor` — every frame; carries the smoothed screen-space pinch/index tip + active gesture, used to drive hover-highlight
  - `grab_start / grab_move / grab_end` — pinch lifecycle. `grab_end.wasClick` is true if the pinch was both short-lived (<240ms) and below a minimum movement threshold, so a quick tap acts like a click
  - `pan` — fired while the active gesture is `fist`; carries `dx/dy` since the previous frame
  - `zoom` — fired while the active gesture is `peace` (vertical hand motion → factor) or two-hand pinch (distance change → factor + midpoint translation)
- **UI affordances**:
  - Mirrored camera preview anchored top-right of the canvas
  - Glowing on-canvas cursor follows the smoothed pinch tip; color/inner-dot size animate with the active gesture (purple = point, red = pinch, amber = fist, green = peace)
  - Gesture label chip + `· 2H` indicator when two hands are tracked
  - **Gesture cheatsheet popover**: toggled by the `?` button on the camera badge OR by the voice command `help`/`show gestures` (which dispatches `synapse:show_help` — `HandTrackingOverlay` listens at the window level so the cheatsheet still toggles whether or not the camera is currently on)
- **State refs** (avoid re-renders): `machineLeft / machineRight` (`HandStateMachine` instances), `smoothPos` (1-Euro-style smoothing for the cursor), `grabStateRef` (active pinch metadata for click-vs-drag), `peaceStateRef` (initial Y for peace-sign vertical-motion zoom), `twoHandStateRef` (initial spread + midpoint for two-hand zoom).

---

## Hooks

### `useViewport` (`src/hooks/useViewport.ts`)
- **Returns**: `{ width, isMobile, isCompact }`
- **Breakpoints**: `isMobile = width < 640`, `isCompact = width < 1100`. Listens to `matchMedia` change events instead of polling `resize`, so re-renders only happen when crossing the threshold.
- **Used by**:
  - `WorkspaceView` — when `isCompact`, both sidebars render in **overlay** mode (floating drawers above the canvas instead of docked columns), and on the first transition into compact both sidebars are auto-closed once.
  - `ModuleTimeline` — auto-minimises the pill to its progress ring on the first compact render; also hides the inline step-dots so the title isn't truncated.

### `usePlayback` (`src/hooks/usePlayback.ts`)
- **Returns**: `{ playingMessageId, playMessage, toggleMessage, stop }`
- **Single source of truth for per-message TTS playback.** Every speaker button in the app (the bubble's, the input pill's, and the per-row buttons in `RightSidebar`'s transcript) goes through this hook so play/stop UI stays in sync no matter which one was clicked last.
- **`playMessage(message, opts?)`**: stops anything currently playing, then calls `speak(message.spokenText ?? message.content, …)`. Updates session store: `playingMessageId = message.id`, `isSpeaking = true`, `liveCaption` cleared (then refreshed by `onSentence`). `opts.voiceId` overrides the session persona's default voice.
- **`toggleMessage(message, opts?)`**: stops if `playingMessageId === message.id` (and no `voiceId` override), else plays.
- **`stop()`**: cancels TTS via `stopSpeaking()` and clears `isSpeaking` / `playingMessageId` / `liveCaption`.
- **`onEnd` guard**: only clears state if **this** playback is still the active one — protects against a second `playMessage` overwriting the first's session state when its older `onEnd` finally fires.

### `useAIChat` (`src/hooks/useAIChat.ts`)
- **Returns**: `{ sendMessage, stop, speakLatest, playMessage, toggleMessage, playingMessageId, isStreaming, latestTutor }`
- **Signature**: `sendMessage(text, opts?: { focusGroupId?: string })`. The optional `focusGroupId` is the explicit "this question is about that module" hint coming from `DoubtPopup` / `SelectionBar` / `CanvasContextMenu`.
- **Pipeline**: user message → derive focus candidates → `/api/chat` SSE → read events → update stores + canvas
- **Canvas context**: `serializeCanvasContext()` converts current canvas elements into a text summary (type, title, groupId) sent with every request to avoid duplicate artifacts
- **Focus candidates**: `deriveFocusCandidates(focusGroupId?)` builds an ordered, deduplicated list (max 3) from explicit focus → selection-derived groups → `currentMainGroupId`. Sent in the request body as `{ focus: { candidates } }`. Skipped entirely when there are no groups yet. The first candidate is also remembered in `turnAnchorRef` so skeleton placement can use it before the server's strategy decision arrives.
- **SSE events handled**:
  - `thinking` — no UI action
  - `artifact_pending` → `addPendingElement` placed under the optimistic anchor (tiles right-ward as more skeletons appear); falls back to right-edge placement when no anchor. Also pushes `addUpdate({type: "artifact_generating", title: "Generating <type>", detail: <artifact title>})`.
  - `artifact_done` → `resolvePendingElement` → skeleton replaced by real artifact + `addUpdate({type: "artifact_added", title: "Drew <type>", detail: <artifact title>})`
  - `artifact_error` → drops the skeleton + `addUpdate({type: "error", title: "Couldn't render <type>", detail: <reason>})`
  - `tutor_response` → stores `moduleTitle`/`writtenText`/`spokenText`/`questionsForUser` in refs; **appends a tutor message to the transcript with both `content: writtenText` AND `spokenText` attached** (so every speaker button — including per-row buttons inside the transcript that may be replayed days later via persisted state — has the TTS-friendly text without depending on a transient ref); sets tier-1 chips from `questionsForUser`
  - `follow_up` → appends tier-2 chips (strategy suggestions); deduplicates against tier-1
  - `done` → `applyPatch`, then `addModule(label, resolvedArtifacts, undefined, writtenText, { anchorGroupId, isTangent })` using the server's anchor decision (validated against the candidates we sent) — falls back to the optimistic anchor if the server returned none. The new group id is then routed into either `setCurrentMain` (linear turn) or `setLastTangent` (tangent), which drives the back pill. `addModule` itself pushes a `module_added` activity entry.
  - `error` → adds error tutor message + `addUpdate({type: "error"})`
- **Activity feed entries**: there is no transient canvas toast layer. Every visible "AI is doing X" signal is an entry in `useCanvasStore().updates` (rendered by `RightSidebar` → "Activity"). On turn start, `sendMessage` pushes a `thinking` entry (detail = the truncated user prompt); each artifact lifecycle event pushes its own entry as listed above.
- **Module title source**: `moduleTitle` comes from the tutor's structured JSON response (3-6 word topic title). Falls back to the truncated user query if the tutor didn't emit one. This becomes the `group.name` shown by `GroupBoundary`.
- **Delayed speech**: on `done`, sets `speakReady = true` (legacy hint — UI no longer gates speaker buttons on it). The speaker button on the latest tutor bubble is always visible while there's a playable tutor message, and the user can replay it any number of times.
- **Cancellation**: each `sendMessage` call creates an `AbortController` stored in `abortRef`; the controller's signal is passed to `fetch("/api/chat", { signal })`. `stop()` aborts the controller AND calls `usePlayback.stop()` to halt any TTS in flight. The catch branch detects `AbortError`, removes any pending skeleton cards, pushes an `error`-type "Stopped" entry to the activity feed, and adds a single "Stopped." tutor message. Server-side, `/api/chat` forwards `req.signal` into `runOrchestrator`, which threads it through `chatCompletion()` so the OpenAI request itself terminates.
- **Recoverable errors (rate limit / model timeout)**: both the SSE `error` event handler and the fetch `catch` branch run results through `classifyError` (`src/lib/agents/error-classify.ts`). For `code: "rate_limit" | "timeout"` the hook calls `setChatError({ code, message, retryPrompt: text, retryAfterMs?, timestamp })` and pushes a typed activity-feed entry — but **does NOT** add a "Something went wrong" tutor message to the transcript. `ChatErrorBanner` consumes `chatError` and renders a side toast with a Retry button. `sendMessage` clears `chatError` at the very start of every turn so the banner auto-disappears on a successful retry. `code: "unknown"` still falls back to the legacy apology message.
- **`speakLatest()`**: thin wrapper — finds the most recent tutor message with playable text in `useSessionStore.messages` and calls `usePlayback.toggleMessage(latest)`. Captions update sentence-by-sentence via the `onSentence` callback (was per-word — see `lib/voice/speech.ts`).

---

## Stores

### `useCanvasStore` (`src/store/canvas.ts`)
- **Key state**: `elements: CanvasElement[], groups: CanvasGroup[], connections, selectedElementIds, updates, currentMainGroupId, lastTangentGroupId`
- **Key actions**: `addElement, removeElement, moveElement, setElementHeight, updateElementText, updateStickyContent, selectElements, toggleElementSelected, clearSelection, groupSelected, ungroupElements, addUserAnnotation, removeUserAnnotation, undoLastUserAction, setCurrentMain, setLastTangent, clearTangent`
- **Annotation undo stack**: `annotationHistory: AnnotationHistoryEntry[]` (max 50). `addUserAnnotation` / `removeUserAnnotation` push entries; `undoLastUserAction` pops + reverses. Only the dedicated user-annotation actions touch the stack — plain `addElement` / `removeElement` (used by AI streams and mock loaders) bypass it. See `CANVAS.md → Eraser & Annotation Undo`.
- **`addPendingElement(el)`**: adds an element with `pending: true`; renders `SkeletonCard` until resolved
- **`resolvePendingElement(id, artifact)`**: sets `pending: false`, sets `artifact`, updates `type` — replaces skeleton with real artifact
- **`setElementHeight(id, h)`**: writes the measured pixel height onto `el.h`; skipped when height hasn't changed to avoid spurious re-renders. **Reflow path**: when the target is a `text` element with a `groupId`, sibling artifacts in the same group that still carry `autoLaidOut: true` are shifted vertically so their top sits at exactly `textY + measuredH + 1.5 × ELEM_GAP`. This is what lets `addModule`'s estimated text height be conservative — once the paragraph paints and the `ResizeObserver` reports the real height, the diagram(s) below slide into place. User-dragged siblings (whose `autoLaidOut` was cleared by `moveElement`) are left alone.
- **`moveElement(id, x, y)`**: moves the element AND clears `autoLaidOut` so it's no longer a candidate for auto-reflow.
- **`addModule(title, artifacts, crumbs?, writtenText?, opts?)`**: creates group + lays out elements; returns the new group's id. Two-pass layout — first probe the artifact rows to learn `totalW`, then size the text element so `textW = clamp(totalW, TEXT_MIN_W = 480, TEXT_MAX_W = 1100)` (paragraph spans the same horizontal extent as the diagrams below it), estimate text height from content + width via `estimateTextHeight()`, then re-place artifacts at `y = startY + textH + 1.5 × ELEM_GAP`. Every laid-out element is flagged `autoLaidOut: true` so the post-mount measurement can reflow them. `opts.anchorGroupId` places the group below that anchor (using a collision-aware horizontal nudge) and draws the connection arrow from the anchor instead of from the chronologically previous group; `opts.isTangent` stamps `parentGroupId`/`isTangent` on the new group and updates `lastTangentGroupId` (vs. `currentMainGroupId` for non-tangents). Without `opts`, behavior matches the original right-edge placement + previous-group connection. Also pushes a `module_added` entry to `updates`. See `CANVAS.md → Module layout` for the full pipeline.
- **`estimateTextHeight(content, width)`** (exported): conservative line-count-based estimator (15px / 22px line height, ~6.6px avg glyph, +0.4 line padding). Honours hard `\n+` paragraph breaks. Slight over-estimate so the diagram below is never placed on top of the still-flowing paragraph; corrected by the `ResizeObserver` reflow.
- **`addUpdate(event)`**: appends a `CanvasUpdateEvent` to the activity feed (capped at the last 50 entries). This is the single source of truth for live AI status — there is no separate canvas toast layer. See `CanvasUpdateEvent.type` for the supported variants and `RightSidebar` for the rendering.
- **Tangent tracking**: `currentMainGroupId` is the user's "home" module on the main thread; `lastTangentGroupId` is the most recent tangent. Both drive `TangentReturnPill` visibility. `clearTangent()` is called when the user clicks the pill back to main. Both ids are persisted.
- **Persistence**: Zustand `persist` middleware writes `{ elements, groups, connections, updates, currentMainGroupId, lastTangentGroupId }` to `localStorage` under key `synapse-canvas`. Transient state (`strokes`, `selectedElementIds`, `isMockMode`) is excluded.

### `useSessionStore` (`src/store/session.ts`)
- **Key state**: `query, persona, sessionId, files, urls, messages, isStreaming, chatError, voiceMode, liveCaption, followUpQuestions, speakReady, playingMessageId, docHeadings, learningMode, moduleQueue, pendingVoiceText`
- **Key actions**: `initSession, addMessage, updateMessage, setChatError, setPersona, setVoiceMode, setLiveCaption, setFollowUpQuestions, setSpeakReady, setPlayingMessageId, setDocHeadings, setLearningMode, setModuleQueue, shiftModuleQueue, setPendingVoiceText`
- **`chatError`**: `ChatError | null` — set by `useAIChat` for recoverable upstream failures (`rate_limit` / `timeout`). Carries `{ code, message, retryPrompt, retryAfterMs?, timestamp }`. Drives the `ChatErrorBanner`. Cleared at the start of every `sendMessage` so a successful retry auto-dismisses the banner. Excluded from persistence.
- **`Message`**: `{ id, role, content, timestamp, spokenText?, voice? }`. `spokenText` is the TTS-friendly version of `content` (no markdown/equations); attached at SSE `tutor_response` time so every speaker button can replay it. `voice` records the ElevenLabs voice ID last used to play it.
- **`urls`**: URLs submitted alongside the query (extracted from InputBar text via `detectUrls`)
- **`followUpQuestions`**: array of 2-3 suggested next questions; displayed as chips above the input bar
- **`speakReady`**: legacy "AI response just landed" hint. UI no longer gates speaker buttons on this — they're always available while a playable tutor message exists.
- **`playingMessageId`**: id of the message currently being spoken by TTS (null = nothing). Single source of truth for every speaker button's play/stop icon swap. Written by `usePlayback`.
- **`liveCaption`**: current SENTENCE being spoken (was per-word). Written by `usePlayback` via the TTS layer's `onSentence` callback.
- **`docHeadings`**: H1/H2 headings extracted from all parsed/fetched documents during the bridge sequence; used by `LeftSidebar` as a document outline before any canvas groups exist
- **`learningMode`**: `"guided" | "auto" | null`. `null` triggers the mode picker in `CanvasInputBar` on the first message of a session. Forwarded to `/api/chat` so the orchestrator can pick the right system prompt and tool budget (`auto` → 8 tool rounds, 4096 tokens, `tool_choice: "required"`; `guided` → 4 rounds, 1536 tokens).
- **`moduleQueue`**: ordered list of prompts to fire one-by-one as `isStreaming` clears. Used by Auto Explore mode to walk the user through every module of a multi-module `studyPlan` without further input.
- **`pendingVoiceText`**: single-shot prompt that `CanvasInputBar` will dispatch on the next non-streaming tick. Used by `handlePickMode` and voice flows.
- **Persistence**: Zustand `persist` middleware writes `{ query, persona, sessionId, canvasTitle, messages, urls, followUpQuestions, docHeadings }` to `localStorage` under key `synapse-session`. **`messages` carries `spokenText` and `voice` along, so on refresh every per-row speaker button in the transcript stays replayable.** Heavy payloads (`files`, `documents`, `documentContext`) and transient UI flags (incl. `learningMode`, `moduleQueue`, `pendingVoiceText`, `playingMessageId`, `liveCaption`) are excluded.

### `useUIStore` (`src/store/ui.ts`)
- **Key state**: `leftSidebarOpen, doubtPopup, contextMenu, darkMode, canvasScale`
- **Key actions**: `openDoubtPopup, closeDoubtPopup, openContextMenu, closeContextMenu, setCanvasScale`
- **`openDoubtPopup(worldX, worldY, prefill?, originGroupId?)`**: `originGroupId` is the explicit "this doubt is about that group" hint. Stored on the popup state and forwarded to `DoubtPopup` as a prop, which uses it to derive the `focusGroupId` it sends to `useAIChat.sendMessage`. Falls back to nearest-group-by-distance when not provided.
- **`canvasScale`**: live canvas zoom level (default 1), synced from `ArtifactCanvas.onTransformChange`. Read non-reactively via `useUIStore.getState().canvasScale` in canvas store actions to stamp `birthScale` at element creation time.

### `useGroundingStore` (`src/store/grounding.ts`)
- **Key state**: `studyPlan, sessionContext, retrievalIndexed`
- **Key actions**: `setStudyPlan, setSessionContext, setRetrievalIndexed`
