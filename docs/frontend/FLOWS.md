# User Journey Flows

## Flow 1 — Topic Entry (Standard)

**Entry point**: Landing page `/`

1. User lands on `/`. Sees `HeroTitle`, `InputBar`, `SuggestedTopics`.
2. User types a topic (e.g. "Quantum Entanglement") into `InputBar`.
3. User selects persona from selector (default: Professor).
4. User clicks "Enter Synapse" or presses Enter.
5. `InputBar.handleSubmit` calls `useSessionStore.initSession(query, persona, [])`.
6. Router pushes `/workspace?q=Quantum+Entanglement&persona=professor`.
7. `WorkspaceView` mounts. `BridgeScreen` appears (full-screen overlay).
   - Whiteboard animation: 5 group boxes draw in via SVG `pathLength`, connected by direction-aware arrows.
   - Staged progress bar at bottom tracks AI pipeline stages.
8. BridgeScreen exits with `exit={{ opacity:0, scale:0.98 }}`.
9. Workspace `motion.div` animates in.
10. Canvas starts in **Interaction** mode. `CanvasInputBar` mounts with a welcome message.
11. User types a question. `CanvasInputBar` calls `useAIChat.sendMessage(text)`.
12. Strategy agent runs → hint injected into `/api/chat`.
13. Response artifacts → `addElement(...)` calls → new `ElementCard` components appear, grouped under a `CanvasGroup`, with an animated purple connection from prior group.

---

## Flow 2 — Voice Doubt

**Entry point**: Workspace with at least one group visible

1. User clicks the mic button in `CanvasInputBar`.
2. `setVoiceMode(true)` called. Input bar collapses to pulsing purple pill.
3. `startListening` begins with interim callback → `setLiveCaption(interim)`.
4. Caption bar appears above the pill showing live text.
5. User speaks: *"What happens when two entangled particles are observed simultaneously?"*
6. Speech recognition fires final result. `sendMessage(final)` called. `setVoiceMode(false)`.
7. AI processes query → new grouped `ElementCard` components appear on canvas.

---

## Flow 3 — File Upload

**Entry point**: Landing page `/`

1. User clicks the `[+]` expand button in `InputBar` to show the file drop zone.
2. User drags a PDF onto the drop zone. File chip appears.
3. User types a question and clicks "Enter Synapse".
4. `initSession(query, persona, files)` called.
5. `WorkspaceView` calls `parseAndEmbedFiles(files)`:
   - `POST /api/parse-doc` → extracts text
   - `POST /api/embed` → indexes chunks
6. `BridgeScreen` stage "Parsing sources" shows filename(s) in the log.
7. Workspace loads. AI has `documentContext` injected into every `/api/chat` call.
8. Generated groups are grounded in the document content.

---

## Flow 4 — Group Selection & Doubt

**Entry point**: Workspace with 2+ groups on canvas

1. User switches to **Select** tool (`V`).
2. User clicks any element in Group A → all members of Group A are selected (purple outline on `GroupBoundary`).
3. User shift-clicks any element in Group B → Group B members added to selection.
4. `selectedElementIds.length > 1` → `SelectionBar` animates down from top-center.
   - Shows: *"N selected"* | *[Group]* | *[Ungroup]* (if same group) | *[Ask about selection]* | *[×]*
5. User clicks "Ask about selection".
6. `DoubtPopup` appears pre-filled with *"Explain the connection between: [Group A title], [Group B title]"*.
7. User submits → AI generates a synthesis group connected to both.
8. `clearSelection()` called. SelectionBar animates away.

---

## Flow 5 — Pen Annotation

**Entry point**: Workspace with content on canvas

1. User presses `P` to switch to **Pen** tool. Cursor becomes a crosshair.
2. User draws a freehand stroke on the canvas (e.g., an arrow pointing at a formula).
3. On pointer up, `handleStrokeComplete` fires:
   - Bounding box computed from stroke points
   - `addElement({ type: "stroke", stroke: { points, color, width, height } })` called
4. `StrokeElement` renders the stroke as an SVG path with quadratic bezier smoothing.
5. Stroke is always rendered above all artifact elements (`zIndex: 9000 + element.zIndex`).
6. In **Select** mode, user can click the stroke to select it, drag via grip handle to reposition, or delete via the `X` button.
7. Stroke can be grouped with artifact elements via `SelectionBar → Group`.

---

## Flow 6 — Group Drag

**Entry point**: Workspace with grouped elements

1. User switches to **Select** tool (`V`).
2. User clicks any element in a group → entire group selected.
3. User drags the selected element → all group members move together.
   - At drag start, all group member positions are snapshotted
   - On each pointer move, uniform delta applied to all members
4. Alternatively, in **Hand** or **Select** mode, user drags the grip handle on any group member → same group-move behavior.
5. Drag ends; group is repositioned. No explicit "move group" action needed.

---

## Flow 7 — Mock Demo

**Entry point**: Workspace (fresh, no query needed)

1. Developer navigates to `/workspace?q=demo`.
2. `BridgeScreen` runs and exits.
3. `[DEV] Mock Canvas` button visible `absolute bottom-20 right-4`.
4. Developer clicks the button → `loadMockData()` populates canvas with grouped elements.
5. `setMockMode(true)` called. Button changes to amber *"● Mock Active"*.
6. Groups and `FlowArrows` render. Interaction mode is default — clicking artifacts interacts with them.
7. Developer switches to Select tool → clicks groups, shifts between selections, tests `SelectionBar`.
8. Developer switches to Pen tool → draws annotations that render above all artifacts.
9. Developer clicks *"● Mock Active"* again → `clearModules()` + `setMockMode(false)`. Canvas empties.
