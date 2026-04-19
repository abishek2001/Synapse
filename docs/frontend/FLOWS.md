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
12. Canvas context serialized (existing element titles/types) and sent to `/api/chat`.
13. SSE stream opens. Events arrive in order:
    - `thinking` → no visible action
    - `artifact_pending` → `addPendingElement` → `SkeletonCard` appears at next canvas position
    - `artifact_done` → `resolvePendingElement` → skeleton replaced by real artifact
    - `tutor_response` → `writtenText` added to transcript + placed as text element on canvas; `questionsForUser` → tier-1 (violet) chips
    - `follow_up` → tier-2 (neutral) strategy chips appended above `CanvasInputBar`
    - `done` → contextPatch applied, artifacts grouped via `addModule(title, artifacts, undefined, writtenText)`, `speakReady = true`
14. Speak button appears in `CanvasInputBar`. User clicks → TTS plays the explanation.
15. Clicking a follow-up chip → `sendMessage(chip text)` → new turn begins.

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
7. H1/H2 headings extracted from parsed text → stored in `useSessionStore.docHeadings` → `LeftSidebar` shows "Document" outline immediately.
8. Workspace loads. AI has `documentContext` injected into every `/api/chat` call.
9. Generated groups are grounded in the document content.

---

## Flow 3b — URL Submission

**Entry point**: Landing page `/`

1. User types a URL (e.g. `https://en.wikipedia.org/wiki/Photosynthesis`) into `InputBar` — either alone or mixed with a question.
2. `isLikelyUrl(query)` detects it → URL detected banner appears below the input ("URL will be fetched").
3. User clicks "Enter Synapse".
4. `detectUrls(query)` extracts all URLs from the text.
5. `initSession(query, persona, files, urls)` called — URLs stored in `useSessionStore.urls`.
6. Router pushes `/workspace?q=...&persona=...`.
7. `WorkspaceView` mounts. Bridge sequence runs:
   - If `urls.length > 0`, bridge shows "source" stage: "Fetching [hostname]…" in the log.
   - Each URL is fetched via `POST /api/fetch-url` → Jina Reader converts to clean markdown.
   - Collected docs merged with any uploaded files → `setDocuments(collectedDocs)`.
   - `POST /api/extract-title` extracts a short topic title → sets `canvasTitle`.
8. After documents are committed, H1/H2 headings are extracted from all doc text via regex and stored in `useSessionStore.docHeadings`. `LeftSidebar` immediately shows them as a "Document" outline (visible before any AI chat groups exist).
9. `BridgeScreen` exits. AI has full `documentContext` from the fetched URL content.
10. Canvas title shows the extracted topic (e.g. "Photosynthesis: Light Reactions").

---

## Flow 3c — TOC Navigation (Bundle D)

**Entry point**: Workspace with at least one group on canvas

1. User opens the left sidebar (hamburger icon in `WorkspaceNavbar` or sidebar toggle).
2. `LeftSidebar` renders all groups sorted by `orderIndex`, each showing: number chip, name, element type icons, element count.
3. User clicks a group row.
4. `onZoomToGroup(group.id)` fires → `artifactCanvasRef.current?.zoomToGroup(groupId)` in `WorkspaceView`.
5. `ArtifactCanvas.zoomToGroup` reads current elements, calls `computeGroupBounds(groupId, elements)`, then `canvasHandleRef.current.zoomToRect(...)`.
6. Canvas smoothly pans and zooms to frame that group with 60px padding.

---

## Flow 3d — Session Persistence (Bundle E)

**Entry point**: Any workspace session

1. As canvas groups/elements are added, Zustand `persist` middleware auto-writes `{ elements, groups, connections, updates }` to `localStorage["synapse-canvas"]`.
2. Session metadata (`query, persona, messages, canvasTitle, urls`) auto-persists to `localStorage["synapse-session"]`.
3. User closes tab / navigates away.
4. User returns to `/workspace?q=...`.
5. Both stores hydrate from `localStorage` before first render — canvas and conversation history are restored.
6. Heavy payloads (file base64, document text) are excluded from persistence (not stored in localStorage).

---

## Flow 3b — Delayed Speech & Follow-Up Chips

**Entry point**: Workspace, after AI response arrives

1. AI turn completes: `done` SSE event fires.
2. `speakReady = true` in session store.
3. `Volume2` (Speak) button appears to the left of the Send button in `CanvasInputBar`.
4. 2-3 follow-up chips appear above the input pill (e.g. "How does this relate to X?", "Show me an example").
5. User clicks **Speak** → `speakLatest()` → TTS reads the explanation aloud.
6. While speaking: `isSpeaking = true` → RightSidebar auto-opens.
7. `speak()` fires `SpeechSynthesisUtterance.onboundary` on each word → word-boundary callback calls `setLiveCaption(word)` → caption strip in RightSidebar updates word-by-word in real time.
8. Speaking ends → `setSpeaking(false)` + `setLiveCaption("")` → caption strip collapses.
9. User clicks a **chip** → `sendMessage(chip text)` → new turn. Chips disappear immediately.

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
