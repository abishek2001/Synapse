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
- **Writes**: `useSessionStore.initSession(query, persona, files)` on submit
- **Features**: text input, file upload, persona selector, URL detection feedback, mic button (Web Speech API)
- **Navigation**: pushes `/workspace?q=...&persona=...` on submit

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
              │           │     │     ├── CanvasTitle
              │           │     │     ├── FlowArrows (SVG)
              │           │     │     ├── ModuleCard × N
              │           │     │     └── CanvasAnnotationCard × N
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
- **Reads**: `useSessionStore` (query, persona, files, etc.), `useGroundingStore`, `useUIStore` (leftSidebarOpen)
- **Writes**: orchestrates bridge sequence, calls all store inits
- **Responsibilities**: bridge loading sequence, layout composition, workspace dark theme container

### `BridgeScreen` (`src/components/workspace/BridgeScreen.tsx`)
- **Props**: `query, persona, stages, logs, contextCard, latencyMs, fileNames`
- **Visual**: dark full-screen overlay with ghost module shimmer, staged progress, live log
- **Exit**: `AnimatePresence` with `exit={{ opacity:0, scale:0.98 }}`

### `WorkspaceNavbar` (`src/components/workspace/WorkspaceNavbar.tsx`)
- **Props**: `title, onCallFriend, hasFiles, showSources, onToggleSources, onToggleSidebar?, sidebarOpen?`
- **Theme**: dark (`text-white/40`, `border-white/[0.05]`)

### `LeftSidebar` (`src/components/workspace/LeftSidebar.tsx`)
- **Reads**: `useSessionStore` (messages, isStreaming), `useCanvasStore` (updates), `useUIStore` (transcriptExpanded, updatesExpanded)
- **Writes**: `setTranscriptExpanded`, `setUpdatesExpanded`
- **Animation**: `motion.div` width `0 → 272px` on open/close

### `ArtifactCanvas` (`src/components/workspace/ArtifactCanvas.tsx`)
- **Reads**: `useCanvasStore` (modules, connections, annotations, toasts, selectedModuleIds), `useUIStore` (doubtPopup, contextMenu)
- **Writes**: annotation CRUD, `toggleModuleSelected`, `clearSelection`, `setAutoExpandModuleId`
- **Wires events**: `onDoubleClick → openDoubtPopup`, `onRightClick → openContextMenu`, `onShiftClick → toggleModuleSelected`

### `InfiniteCanvas` (`src/components/workspace/InfiniteCanvas.tsx`)
- **Props**: `children, onCanvasClick?, onDoubleClick?, onRightClick?, onShiftClick?, externalTool?, onToolChange?, hideTools?, handTrackingEnabled?, onToggleHandTracking?, darkMode?`
- **Ref handle**: `getTransform(), panBy(), screenToWorld(), worldToScreen()`
- **Manages**: pan/zoom transform, tool state, keyboard shortcuts

### `ModuleCard` (`src/components/workspace/ModuleCard.tsx`)
- **Props**: `module, isSelected, onExpand, onSelect, onShiftSelect`
- **Reads**: `useCanvasStore.moveModule` (for drag)
- **Visual**: dark card with drag header, 2-col artifact preview grid, type badges, crumb chips

### `CanvasInputBar` (`src/components/workspace/CanvasInputBar.tsx`)
- **Reads**: `useSessionStore` (messages, voiceMode, liveCaption, isSpeaking, etc.)
- **Writes**: `setVoiceMode`, `setLiveCaption`, `sendMessage` via `useAIChat`
- **Modes**: normal (full input bar) | voice (floating pulse pill + caption)
- **Replaces**: `TutorPanel` from original implementation

### `DoubtPopup` (`src/components/workspace/DoubtPopup.tsx`)
- **Props**: `worldX, worldY, screenX, screenY, prefill?, onClose`
- **Positioned**: fixed screen coords (not canvas-space)
- **Mock mode**: creates dummy `FlashcardArtifact` module immediately
- **Real mode**: calls `useAIChat.sendMessage(question)`

### `SelectionBar` (`src/components/workspace/SelectionBar.tsx`)
- **Reads**: `useCanvasStore` (selectedModuleIds, modules)
- **Writes**: `clearSelection`, `openDoubtPopup` (via UIStore)
- **Visible when**: `selectedModuleIds.length > 1`

### `MockButton` (`src/components/workspace/MockButton.tsx`)
- **Reads/Writes**: `useCanvasStore` (isMockMode, loadMockData, clearModules, setMockMode)
- **Position**: `absolute bottom-20 right-4 z-40`
- **Note**: Remove this component (one import line in WorkspaceView) before production

### `CanvasContextMenu` (`src/components/workspace/CanvasContextMenu.tsx`)
- **Props**: `screenX, screenY, worldX, worldY, targetModuleId?, onClose, onSetTool, onExpandModule`
- **Positioned**: `fixed` at screen coords, clamped to viewport
- **Two modes**: empty canvas menu | module menu

---

## Hooks

### `useAIChat` (`src/hooks/useAIChat.ts`)
- **Returns**: `{ sendMessage, isStreaming, latestTutor, query }`
- **Reads**: session store, canvas store, grounding store
- **Pipeline**: user message → strategy agent → chat API → artifacts + annotations → canvas

---

## Stores

### `useCanvasStore` (`src/store/canvas.ts`)
- **Key state**: `modules, connections, updates, selectedModuleIds, isMockMode, annotations, toasts`
- **Key actions**: `addModule, loadMockData, addConnection, addUpdate, toggleModuleSelected, addCrumbToModule`

### `useSessionStore` (`src/store/session.ts`)
- **Key state**: `query, persona, files, messages, isStreaming, voiceMode, liveCaption`
- **Key actions**: `initSession, addMessage, setVoiceMode, setLiveCaption`

### `useUIStore` (`src/store/ui.ts`)
- **Key state**: `leftSidebarOpen, doubtPopup, contextMenu, transcriptExpanded, updatesExpanded`
- **Key actions**: `openDoubtPopup, closeDoubtPopup, openContextMenu, closeContextMenu`

### `useGroundingStore` (`src/store/grounding.ts`)
- **Key state**: `studyPlan, sessionContext, retrievalIndexed`
- **Key actions**: `setStudyPlan, setSessionContext, updateContext, setRetrievalIndexed`
