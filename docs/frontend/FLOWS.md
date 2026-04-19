# User Journey Flows

## Flow 1 — Topic Entry (Standard, Guided Mode)

**Entry point**: Landing page `/`

1. User lands on `/`. Sees `HeroTitle`, `InputBar`, `SuggestedTopics`.
2. User types a topic (e.g. "Quantum Entanglement") into `InputBar`.
3. User selects persona from selector (default: Professor).
4. User clicks "Enter Synapse" or presses Enter.
5. `InputBar.handleSubmit` calls `useSessionStore.initSession(query, persona, [])`.
6. Router pushes `/workspace` (no query string — session lives in the store).
7. `WorkspaceView` mounts. If `sessionId` and `query` are present in the store, the bridge runs; otherwise it `router.replace("/")` back to the landing page.
8. `BridgeScreen` appears (full-screen overlay).
   - Whiteboard animation: 5 group boxes draw in via SVG `pathLength`, connected by direction-aware arrows.
   - Staged progress bar at bottom tracks AI pipeline stages.
9. BridgeScreen exits with `exit={{ opacity:0, scale:0.98 }}`.
10. Workspace `motion.div` animates in. Canvas starts in **Interaction** mode.
11. **Mode picker card** appears in `CanvasInputBar` (because `learningMode === null && messages.length === 0`). Two options: **Guided** (step-by-step) | **Auto Explore** (full picture).
12. User picks **Guided** → `setLearningMode("guided")` → `setPendingVoiceText(topic)` → `CanvasInputBar`'s pending-text effect fires `sendMessage(topic)` on the next non-streaming tick.
13. Canvas context serialized (existing element titles/types) and sent to `/api/chat` along with `learningMode: "guided"`.
14. SSE stream opens. Events arrive in order:
    - `thinking` → no visible action
    - `artifact_pending` → `addPendingElement` → `SkeletonCard` appears at next canvas position
    - `artifact_done` → `resolvePendingElement` → skeleton replaced by real artifact
    - `tutor_response` → `moduleTitle` cached, `writtenText` added to transcript + placed as text element on canvas; `questionsForUser` → tier-1 (violet) chips (max 2)
    - `follow_up` → tier-2 (neutral) strategy chips appended (currently filtered to max 2 tier-1 only by the input bar)
    - `done` → contextPatch applied, artifacts grouped via `addModule(label, artifacts, undefined, writtenText)` where `label = moduleTitle || truncate(query, 50)`, `speakReady = true`
15. The new group's heading is the `moduleTitle` (handwritten Caveat font on `GroupBoundary`). Canvas auto-zooms to the new group at natural (100%) scale.
16. **Synapse bubble** appears in `CanvasInputBar` showing `latestTutor.content` with an inline Speak button and an X to dismiss.
17. User clicks **Speak** (in the bubble or the input pill) → TTS plays `spokenText`. While speaking, a YouTube-style caption pill appears at fixed `bottom-28` over the canvas, updating word-by-word via `SpeechSynthesisUtterance.onboundary`.
18. Clicking a follow-up chip → `sendMessage(chip text)` → new turn begins. If user types instead of picking a mode, `learningMode` silently defaults to `"guided"`.

---

## Flow 1b — Topic Entry (Auto Explore Mode)

**Entry point**: Landing page `/` (same as Flow 1, diverges at the mode picker)

1. Steps 1–11 of Flow 1.
2. User picks **Auto Explore** → `setLearningMode("auto")` → `handlePickMode("auto")`:
   - Reads `useGroundingStore.studyPlan` (built during the bridge sequence).
   - **If plan has multiple modules**: builds a queue from all modules — `[topic, "Continue with: ${m2.title} — ${m2.description}", ...]` — and stores it in `moduleQueue`.
   - **Otherwise**: stores a single comprehensive prompt in `pendingVoiceText` (`"Give me a comprehensive walkthrough of: ${topic}. Use multiple artifacts…"`).
3. `CanvasInputBar` effects fire:
   - The `pendingVoiceText` effect (if set) sends the single comprehensive prompt.
   - The `moduleQueue` effect (if non-empty) shifts the head off the queue and sends it as soon as `isStreaming` clears.
4. Each turn flows through `/api/chat` with `learningMode: "auto"`. The orchestrator uses the `AUTO_RULES` system prompt block (3-6 artifacts per turn, generous tool budget — 8 tool rounds, 4096 tokens, `tool_choice: "required"`).
5. Each completed turn becomes a new group on the canvas with its own `moduleTitle` heading. Canvas auto-zooms to each new group as it lands.
6. The queue drains turn-by-turn — once `moduleQueue.length === 0` the user is back to manual control.
7. Bubble + captions + chips behave the same as Flow 1.

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
6. Router pushes `/workspace` (no query string).
7. `WorkspaceView` mounts. Bridge sequence runs:
   - If `urls.length > 0`, bridge shows "source" stage: "Fetching [hostname]…" in the log.
   - Each URL is fetched via `POST /api/fetch-url` → Jina Reader converts to clean markdown.
   - Collected docs merged with any uploaded files → `setDocuments(collectedDocs)`.
   - `POST /api/extract-title` extracts a short topic title → sets `canvasTitle`.
   - When the study plan resolves, its `plan.topic` is used as the canvas title if no document-extracted title was set (covers the no-files case where the user just typed a topic).
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
2. Session metadata (`query, persona, sessionId, canvasTitle, messages, urls, followUpQuestions, docHeadings`) auto-persists to `localStorage["synapse-session"]`.
3. User closes tab / navigates away.
4. User returns to `/workspace`.
5. Both stores hydrate from `localStorage` before first render — canvas and conversation history are restored.
6. If the session store hydrated with `sessionId` and `query`, the workspace renders immediately. Otherwise `WorkspaceView`'s `useEffect` calls `router.replace("/")` to send the user back to the landing page.
7. Heavy payloads (file base64, document text) and transient UI state (`learningMode`, `moduleQueue`, `pendingVoiceText`) are excluded from persistence.

---

## Flow 3e — Replayable Speech, Sentence Captions & Voice Picker

**Entry point**: Workspace, after AI response arrives

1. AI turn completes: `done` SSE event fires. `addModule(label, artifacts, undefined, writtenText)` runs — `label` is the AI's `moduleTitle` (or truncated user query as fallback).
2. The tutor message was appended to the transcript at `tutor_response` time with both `content: writtenText` AND `spokenText` attached on the message itself (so it can be replayed any time, even on a fresh page load — `spokenText` rides along through Zustand persistence).
3. **Synapse bubble** appears in `CanvasInputBar`'s column (between the mode picker slot and the chips), showing `latestTutor.content`. Inline Speak (`Volume2`) and Dismiss (`X`) controls in the bubble header.
4. **Speak button** also appears in the input pill (`Volume2`) to the left of Send.
5. **Per-message Speak buttons** appear on every tutor row in `RightSidebar`'s transcript (visible on row hover; locked visible while that specific row is playing).
6. Up to 2 tier-1 (violet) follow-up chips appear above the input pill.
7. User clicks any **Speak** button → `usePlayback.toggleMessage(msg)`:
   - If nothing is playing, TTS starts using `spokenText` (falling back to `content` for older messages).
   - If that exact message is already playing, TTS stops.
   - If a different message is playing, the current playback is stopped and the new one starts.
   - `playingMessageId` is set on the session store; every speaker button across the app swaps to a `VolumeX` (stop) icon if it matches.
8. While speaking: `isSpeaking = true`. RightSidebar auto-opens (its own effect). A **YouTube-style caption pill** renders at fixed `bottom-28 left-1/2` over the canvas — dark translucent background, white 17px text, wraps to two lines, max-width 640px. The RightSidebar caption strip mirrors the same text.
9. The TTS layer fires `onSentence(sentence, index)` at each sentence boundary. ElevenLabs estimates boundaries from sentence character-length proportions of `audio.duration`; Kokoro fires per-sentence chunk; Web Speech fires from `utt.onstart`. The callback calls `setLiveCaption(sentence)` → both caption surfaces update sentence-by-sentence (was per-word before, which flickered and only worked on Web Speech).
10. Speaking ends → `usePlayback`'s `onEnd` clears `isSpeaking`, `playingMessageId`, and `liveCaption` → both caption surfaces fade out, all speaker buttons swap back to play icons.
11. User can click the same Speak button again to **replay** — there is no one-shot `speakReady` gate any more.
12. **Voice picker (right-click / long-press)**: right-click any speaker button (or 500ms long-press on touch) → `VoicePickerPopover` opens anchored to the button. Picking a voice updates `useSessionStore.persona` and immediately replays the bubble's message (or that row's message, in the transcript) with the new voice via `usePlayback.playMessage(msg, { voiceId })`.
13. User clicks a **chip** → `sendMessage(chip text)` → new turn. Chips disappear immediately. Sending a new message also stops any in-flight TTS via `usePlayback.stop()`.
14. User clicks the bubble's **X** → `setBubbleDismissed(true)` → bubble hides until the next tutor message arrives (a `useEffect` watching `latestTutor.id` re-shows it).

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
   - `addUserAnnotation({ type: "stroke", stroke: { points, color, width, height } })` called — the stroke is added to the canvas AND pushed onto `annotationHistory` so Cmd/Ctrl+Z (or the toolbar Undo button) can take it back.
4. `StrokeElement` renders the stroke as an SVG path with quadratic bezier smoothing.
5. Stroke is always rendered above all artifact elements (`zIndex: 9000 + element.zIndex`).
6. In **Select** mode, user can click the stroke to select it, drag via grip handle to reposition, or delete via `SelectionBar → Trash`.
7. Stroke can be grouped with artifact elements via `SelectionBar → Group`.

---

## Flow 5b — Erase Annotations & Undo

**Entry point**: Workspace with user-added annotations on canvas (strokes, text, sticky notes)

1. User presses `E` to switch to the **Eraser** tool, or clicks the eraser icon in the bottom-left toolbar.
2. The native cursor is hidden and replaced by a pink halo (constant 18 screen-pixel radius regardless of canvas zoom).
3. User presses and drags over annotations they want to remove. On every pointer sample, `InfiniteCanvas` fires `onEraseAt(worldX, worldY, radius)`.
4. `ArtifactCanvas → handleEraseAt` reverse-iterates `elements`, picks the topmost match for which `isUserAnnotation(el) === true` AND whose bounding box (inflated by `radius`) contains the cursor, and calls `removeUserAnnotation(id)`.
   - **AI-generated artifacts are skipped** — they aren't user annotations and aren't eligible for erasure.
   - Each erase pushes a `{ kind: "remove", element }` entry onto `annotationHistory`.
5. To undo: user presses **`Cmd/Ctrl + Z`** (or clicks the toolbar Undo button next to the tool palette). `InfiniteCanvas` calls `onUndoAnnotation` → `useCanvasStore().undoLastUserAction()` pops the last history entry and reverses it (re-adds the erased annotation, or removes a just-added one).
6. The same Cmd/Ctrl+Z shortcut also reverses the most recent **add** of a user annotation (a freshly drawn stroke, a click-placed text, a click-placed sticky note, including stickies added via `CanvasContextMenu → Add sticky note`).
7. The undo stack holds up to 50 entries (oldest dropped). Cleared by `clearCanvas`.

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

## Flow 7 — Hands-Free (AFK) Navigation — Gestures + Voice

**Entry point**: Workspace with at least one group on canvas

1. User clicks the camera/hand icon in `InfiniteCanvas`'s bottom-right zoom toolbar → `setHandTrackingEnabled(true)` → `HandTrackingOverlay` requests camera access and lazy-loads MediaPipe Hand Landmarker.
2. The mirrored camera preview appears anchored top-right of the canvas. A small chip below it labels the currently detected gesture; a glowing cursor begins tracking the user's index/pinch tip on the canvas.
3. **Discoverability**: user clicks the `?` button on the camera badge OR says "**help**" / "**show gestures**" → `dispatchCanvasCommand({type: "show_help"})` → `synapse:show_help` event → `HandTrackingOverlay` toggles the gesture cheatsheet popover. The popover lists every gesture with a colored swatch.
4. User makes a **point** with one hand → `cursor` events fire every frame → `ArtifactCanvas` hit-tests the world point against `groups` → `hoveredGroupId` updates → the matching `GroupBoundary` highlights with a purple border.
5. User **pinches** (thumb + index) on top of an element → `grab_start` → `ArtifactCanvas` hit-tests the world point, finds the element, snapshots all sibling group positions. As the user moves the pinched hand, `grab_move` events update the element's position (the whole group moves uniformly if the element is grouped). Releasing the pinch fires `grab_end`. A short pinch-and-release on empty canvas clears selection; a short pinch on an element selects it (single-click semantics).
6. User makes a **fist** and moves their hand → `pan` events with `dx/dy` per frame → `panBy(dx × 1.4, dy × 1.4)`. The gain is tuned so a comfortable hand range covers the viewport without forcing the user to swing their arm.
7. User makes a **peace** sign and moves their hand vertically → `zoom` events with `factor = 1 + scaledDeltaY` and the cursor as pivot → `InfiniteCanvasHandle.zoomAt(factor, cx, cy)`. Or: user pinches with **both hands** simultaneously → distance change between the two pinch points = zoom factor, midpoint translation = pan-while-zoom; the chip shows `· 2H`.
8. User says "**next**" → `lib/voice/commands.ts → classifyCommand` matches the navigation pattern → `dispatchCanvasCommand({type: "next_module"})` → `ArtifactCanvas` reads `useCanvasStore().groups`, increments `activeModuleIdxRef`, and calls `zoomToRect(...)` on the next group's bounds. "**previous**" walks the other way; "**module 3**" / "**go to module three**" jumps directly and resyncs the index.
9. User says "**zoom in**" / "**zoom out**" / "**fit all**" / "**reset zoom**" → `classifyCommand` returns the matching command → `ArtifactCanvas`'s window listener calls `zoomAt` / `fitAll` from the viewport center. Pan ("pan up", "scroll left") moves ~280px in that direction.
10. User says "**stop**" while TTS is playing → `dispatchCanvasCommand({type: "stop_speaking"})` → `stopSpeaking()`. "**replay**" / "**say that again**" → `synapse:replay` event → `CanvasInputBar`'s listener calls `toggleMessage(latestTutor)`.
11. User says anything that doesn't match a strict navigation pattern (e.g. "explain entanglement again") → `classifyCommand` returns `null` → the transcript falls through to `sendMessage` and starts a normal tutor turn. Wake words `synapse` / `canvas` / `hey synapse` and a leading `please` are stripped before matching, so "synapse, zoom in" works.
12. User clicks the camera icon again to disable hand tracking. The MediaPipe stream is torn down; voice commands continue working.

This is the AFK story end-to-end: gestures handle direct manipulation (pan / zoom / drag / click / hover), voice handles higher-level navigation (next / fit / module N) and TTS control. They share the same canvas primitives, so anything the keyboard/mouse can do is reachable hands-free.

---

## Flow 8 — Mock Demo

**Entry point**: Workspace (fresh session required — set one via `InputBar` or `initSession` first, then `WorkspaceView` will not bounce you back to `/`)

1. Developer enters any topic via `InputBar` (e.g. "demo") to satisfy the `sessionId/query` guard, then lands on `/workspace`.
2. `BridgeScreen` runs and exits.
3. `[DEV] Mock Canvas` button visible `absolute bottom-20 right-4`.
4. Developer clicks the button → `loadMockData()` populates canvas with grouped elements.
5. `setMockMode(true)` called. Button changes to amber *"● Mock Active"*.
6. Groups and `FlowArrows` render. Interaction mode is default — clicking artifacts interacts with them.
7. Developer switches to Select tool → clicks groups, shifts between selections, tests `SelectionBar`.
8. Developer switches to Pen tool → draws annotations that render above all artifacts.
9. Developer clicks *"● Mock Active"* again → `clearModules()` + `setMockMode(false)`. Canvas empties.
