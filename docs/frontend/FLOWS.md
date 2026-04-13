# User Journey Flows

## Flow 1 — Topic Entry (Standard)

**Entry point**: Landing page `/`

1. User lands on `/`. Sees `HeroTitle`, `InputBar`, `SuggestedTopics`.
2. User types a topic (e.g. "Quantum Entanglement") into `InputBar`.
   - `isLikelyUrl` returns false → no URL pill shown.
3. User selects persona from selector (default: Professor).
4. User clicks "Enter Synapse" or presses Enter.
5. `InputBar.handleSubmit` calls `useSessionStore.initSession(query, persona, [])`.
6. Router pushes `/workspace?q=Quantum+Entanglement&persona=professor`.
7. `WorkspaceView` mounts. `BridgeScreen` appears (full-screen dark overlay).
   - Ghost module shimmer renders behind staged progress.
   - Stages: "Parsing sources" → "Warming up AI" → "Building canvas" → "Loading 3D assets"
8. `WorkspaceView.useEffect` calls `groundingStore.setStudyPlan(...)` and `groundingStore.setSessionContext(...)` using the initial query.
9. BridgeScreen exits with `exit={{ opacity:0, scale:0.98 }}`.
10. Workspace `motion.div` animates in from `initial={{ opacity:0, scale:1.015 }}`.
11. `CanvasInputBar` mounts with a welcome message injected: *"What would you like to learn about Quantum Entanglement?"*
12. User types a question. `CanvasInputBar` calls `useAIChat.sendMessage(text)`.
13. Strategy agent runs (`/api/strategy`) → hint injected into `/api/chat` call.
14. Response artifacts → `addModule(...)` → new `ModuleCard` appears on canvas with animated purple connection from prior module.

---

## Flow 2 — Voice Doubt

**Entry point**: Workspace with at least one module visible

1. User clicks the mic button in `CanvasInputBar`.
2. `setVoiceMode(true)` called. Input bar collapses to pulsing purple pill.
3. `startListening` from `src/lib/voice/speech.ts` begins with interim callback → `setLiveCaption(interim)`.
4. Caption bar appears above the pill showing live text.
5. Waveform animation bars animate alongside the pill.
6. User speaks: *"What happens when two entangled particles are observed simultaneously?"*
7. Speech recognition fires final result. `setLiveCaption(final)` then `sendMessage(final)`.
8. `stopListening` called. `setVoiceMode(false)`. Caption clears.
9. Input bar expands back to normal state.
10. AI processes query → new `ModuleCard` with flashcard or notation artifacts appears.
11. `LeftSidebar` UpdatesPanel shows new `module_added` event with green dot.

---

## Flow 3 — File Upload

**Entry point**: Landing page `/`

1. User clicks the `[+]` expand button in `InputBar` to show the file drop zone.
2. User drags a PDF (e.g., lecture notes) onto the drop zone.
3. `InputBar` state: `files = [File]`. File chip appears below the input: *"lecture-notes.pdf"*
4. User types "Summarize and explain the key theorems" and clicks "Enter Synapse".
5. `initSession(query, persona, files)` called.
6. Router pushes `/workspace?q=...&persona=...` (files stored in session store, not URL).
7. `WorkspaceView.useEffect` calls `parseAndEmbedFiles(files)`:
   - `POST /api/parse-doc` → extracts text
   - `POST /api/embed` → indexes chunks
   - `setDocumentContext(text)`, `setRetrievalIndexed(true)` on grounding store
8. `BridgeScreen` stage "Parsing sources" → shows filename(s) in the log.
9. Workspace loads. AI has `documentContext` injected into every `/api/chat` call.
10. Modules generated are grounded in the document content.

---

## Flow 4 — Multi-Select Doubt

**Entry point**: Workspace with 2+ modules on canvas

1. User shift-clicks `ModuleCard` A → `toggleModuleSelected("A")` → purple ring appears.
2. User shift-clicks `ModuleCard` B → `toggleModuleSelected("B")` → second ring appears.
3. `selectedModuleIds.length === 2` → `SelectionBar` animates down from top-center of canvas.
   - Shows: *"2 selected"* | *[Ask about selection]* | *[×]*
4. User clicks "Ask about selection".
5. `SelectionBar` calls `openDoubtPopup(worldX, worldY, prefill)` where `prefill = "Explain the connection between: Module A, Module B"`.
6. `DoubtPopup` appears at canvas center, pre-filled with that text.
7. User edits or submits.
8. In real mode: `sendMessage(question)` → AI generates a synthesis module connecting the two concepts.
9. In mock mode: dummy `FlashcardArtifact` module created instantly, connected to module A.
10. `clearSelection()` called. SelectionBar animates away. New module appears with arrows from both A and B.

---

## Flow 5 — Mock Demo

**Entry point**: Workspace (fresh, no query needed)

1. Developer navigates to `/workspace?q=demo`.
2. `BridgeScreen` runs its normal sequence and exits.
3. Empty canvas is visible. `[DEV] Mock Canvas` button shows `absolute bottom-20 right-4`.
4. Developer clicks the button.
5. `loadMockData()` called:
   - 5 `CanvasModule` objects created in S-curve layout: `[{x:80,y:180}, {x:480,y:220}, {x:200,y:540}, {x:580,y:580}, {x:340,y:900}]`
   - Each module has 2 `FlashcardArtifact` items + 2 crumbs (1 hint + 1 note)
   - Linear connections: 0→1→2→3→4
6. `setMockMode(true)` called. Button changes to amber *"● Mock Active"*.
7. 5 `ModuleCard` components render. `FlowArrows` SVG draws 4 dashed purple bezier paths.
8. Developer double-clicks empty canvas area → `DoubtPopup` appears.
9. Developer types a question → clicks "Ask Doubt →".
10. Mock mode: new `FlashcardArtifact` module appears immediately (no API call), connected to nearest existing module.
11. Developer right-clicks a module → context menu: "Delete module" removes it; `FlowArrows` re-renders without that connection.
12. Developer clicks *"● Mock Active"* again → `clearModules()` + `setMockMode(false)`. Canvas empties. Button resets.
