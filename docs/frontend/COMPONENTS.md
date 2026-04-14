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
- **Reads**: `useSessionStore`, `useGroundingStore`, `useUIStore`
- **Responsibilities**: bridge loading sequence, layout composition, workspace container

### `BridgeScreen` (`src/components/workspace/BridgeScreen.tsx`)
- **Props**: `query, persona, stages, logs, contextCard, latencyMs, fileNames`
- **Visual**: full-screen light overlay with animated whiteboard — group boxes draw in via SVG `pathLength` animation, connection arrows route direction-aware (horizontal right→left, vertical bottom→top), floating cursor dot
- **Exit**: `AnimatePresence` with `exit={{ opacity:0, scale:0.98 }}`
- **Arrow animation**: uses Framer Motion `pathLength` (0→1) instead of manual `strokeDasharray`/`strokeDashoffset` to ensure correct length calculation

### `ArtifactCanvas` (`src/components/workspace/ArtifactCanvas.tsx`)
- **Reads**: `useCanvasStore` (elements, groups, connections, toasts, selectedElementIds), `useUIStore`
- **State**: `tool`, `canvasScale`, `hoveredGroupId`
- **Writes**: `selectElements`, `toggleElementSelected`, `clearSelection`, `addElement`, `moveElement`, `removeElement`
- **Key logic**:
  - `handleElementSelect(id, multi)` — if element is grouped, selects/toggles the **entire group**
  - `hoveredGroupId` — set by `onGroupHover` from each element; passed to `GroupBoundary` as `isHovered`
  - Elements render in two layers: non-strokes first (sorted by `zIndex`), then strokes (always on top, `zIndex: 9000 + element.zIndex`)
  - `canvasScale` updated via `onTransformChange` and passed to elements for correct drag delta math

### `InfiniteCanvas` (`src/components/workspace/InfiniteCanvas.tsx`)
- **Props**: `children, onCanvasClick?, onDoubleClick?, onRightClick?, onShiftClick?, onBoxSelect?, externalTool?, onToolChange?, darkMode?, onStrokeComplete?, strokeColor?, onTransformChange?`
- **Ref handle** (`InfiniteCanvasHandle`): `getTransform(), panBy(), screenToWorld(), worldToScreen(), zoomToRect(), fitAll()`
- **Tool type**: `"interaction" | "select" | "hand" | "text" | "sticky" | "pen"`
- **Event delegation**: returns early (no capture) when `e.target.closest("[data-element-id]")` — gives element React handlers uncontested pointer ownership
- **Rubber-band**: drawn in Select mode over empty canvas; fires `onBoxSelect(x1, y1, x2, y2)` in world coords

### `ElementCard` (`src/components/workspace/ElementCard.tsx`)
- **Props**: `element, isSelected, onSelect, canvasScale, currentTool, onGroupHover?`
- **Handles**: `artifact`, `text`, `sticky` element types
- **Drag model**: `useRef` drag state with `groupMembers` snapshot; `onGripDown` works in Hand+Select; `onRootDown` works in Select only. Group drag moves all members uniformly.
- **Group hover**: fires `onGroupHover(element.groupId)` on enter, `onGroupHover(null)` on leave
- **Identifier**: `data-element-id={element.id}` on root div (InfiniteCanvas key for early-return)
- **Height measurement**: `ResizeObserver` on the root div calls `setElementHeight(id, offsetHeight)` after every resize. Uses `offsetHeight` (not `getBoundingClientRect`) so the measurement is transform-independent and unaffected by canvas zoom.

### `StrokeElement` (`src/components/workspace/StrokeElement.tsx`)
- **Props**: `element, isSelected, onSelect, canvasScale, currentTool, onGroupHover?`
- **Renders**: SVG `<path>` from stroke points using quadratic bezier smoothing
- **z-index**: `9000 + element.zIndex` — always above all artifact cards
- **Drag**: same grip handle + group drag logic as `ElementCard`
- **Identifier**: `data-element-id={element.id}`

### `GroupBoundary` (`src/components/workspace/GroupBoundary.tsx`)
- **Props**: `group, elements, hasSelectedMember, isHovered`
- **Visual**: rounded rect with group name label; border highlights when `isHovered || hasSelectedMember`
- **Interaction**: `pointer-events-none` — no toolbar buttons. Group controls live in `SelectionBar`.
- **Exports**: `computeGroupBounds(groupId, elements)` — returns world-space bounding box `{x, y, w, h}` used for zoom-to-fit and hit testing
- **Height**: uses `el.h ?? estimateElemH(el.type)` — prefers the measured height from `ElementCard`'s ResizeObserver; falls back to the static estimate only before the first measurement.

### `SelectionBar` (`src/components/workspace/SelectionBar.tsx`)
- **Reads**: `useCanvasStore` (selectedElementIds, elements, groups)
- **Visible when**: `selectedElementIds.length >= 1`
- **Actions**: clear selection, group selected elements, ungroup (when all selected share one `groupId`), ask doubt about selection
- **Primary UI for group management** — GroupBoundary intentionally has no toolbar

### `CanvasInputBar` (`src/components/workspace/CanvasInputBar.tsx`)
- **Reads**: `useSessionStore` (messages, voiceMode, liveCaption, isSpeaking, etc.)
- **Writes**: `setVoiceMode`, `setLiveCaption`, `sendMessage` via `useAIChat`
- **Modes**: normal (full input bar) | voice (floating pulse pill + live caption)

### `DoubtPopup` (`src/components/workspace/DoubtPopup.tsx`)
- **Props**: `worldX, worldY, screenX, screenY, prefill?, onClose`
- **Positioned**: fixed screen coords (not canvas-space)

### `MockButton` (`src/components/workspace/MockButton.tsx`)
- **Position**: `absolute bottom-20 right-4 z-40`
- **Note**: Remove before production

### `CanvasContextMenu` (`src/components/workspace/CanvasContextMenu.tsx`)
- **Props**: `screenX, screenY, worldX, worldY, targetModuleId?, onClose, onSetTool, onExpandModule`
- **Positioned**: `fixed` at screen coords, clamped to viewport

---

## Hooks

### `useAIChat` (`src/hooks/useAIChat.ts`)
- **Returns**: `{ sendMessage, isStreaming, latestTutor, query }`
- **Pipeline**: user message → strategy agent → chat API → artifacts → canvas elements

---

## Stores

### `useCanvasStore` (`src/store/canvas.ts`)
- **Key state**: `elements: CanvasElement[], groups: CanvasGroup[], connections, selectedElementIds, toasts`
- **Key actions**: `addElement, removeElement, moveElement, setElementHeight, updateElementText, updateStickyContent, selectElements, toggleElementSelected, clearSelection, groupSelected, ungroupElements`
- **`setElementHeight(id, h)`**: writes the measured pixel height onto `el.h`; skipped when height hasn't changed to avoid spurious re-renders.

### `useSessionStore` (`src/store/session.ts`)
- **Key state**: `query, persona, files, messages, isStreaming, voiceMode, liveCaption`
- **Key actions**: `initSession, addMessage, setVoiceMode, setLiveCaption`

### `useUIStore` (`src/store/ui.ts`)
- **Key state**: `leftSidebarOpen, doubtPopup, contextMenu, darkMode`
- **Key actions**: `openDoubtPopup, closeDoubtPopup, openContextMenu, closeContextMenu`

### `useGroundingStore` (`src/store/grounding.ts`)
- **Key state**: `studyPlan, sessionContext, retrievalIndexed`
- **Key actions**: `setStudyPlan, setSessionContext, setRetrievalIndexed`
