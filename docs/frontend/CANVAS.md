# Canvas Interaction Model

## Interaction Controls

| Input | Action |
|-------|--------|
| **Scroll wheel** | Zoom in/out (centered on cursor) |
| **Space + drag** | Pan canvas |
| **Middle mouse + drag** | Pan canvas |
| **Left click** (select tool) | Select module / deselect |
| **Shift + left click** | Multi-select modules |
| **Double-click** (empty area) | Open DoubtPopup at cursor position |
| **Double-click** (on module) | Expand module to full-screen canvas |
| **Right-click** (empty area) | Context menu: doubt / sticky / text |
| **Right-click** (on module) | Context menu: expand / ask about / delete |
| **V key** | Switch to Select tool |
| **H key** | Switch to Hand (pan) tool |
| **T key** | Switch to Text annotation tool |
| **N key** | Switch to Sticky Note tool |
| **Escape** | Close expanded module / doubt popup / context menu |

---

## Tool Modes

| Tool | Icon | Behavior |
|------|------|----------|
| **Select** | MousePointer | Click modules to select; drag via grip handles only |
| **Hand** | Hand | Click-drag anywhere to pan canvas |
| **Text** | Type | Click empty area to place text annotation |
| **Sticky** | StickyNote | Click empty area to place sticky note |

---

## Double-Click Matrix

| Target | Result |
|--------|--------|
| Empty canvas area | Open `DoubtPopup` at cursor world position |
| Module card | Expand to full-screen `ExpandedModuleCanvas` |
| Module header/grip | (drag — no double-click action) |
| Annotation | Enter edit mode (text/sticky) |

---

## Module Cards

Each module card renders on the canvas as an absolute-positioned div:
- **Width**: 360px fixed
- **Position**: Set by `module.position.{x, y}` in world coordinates
- **Drag**: Pointer down on header grip → moves module → updates `moveModule(id, x, y)`
- **Select**: Single click → `clearSelection()` (deselect others) OR shift-click → `toggleModuleSelected(id)`

### Card structure
```
ModuleCard (360px × dynamic height)
  ├── Header (grip + title + expand button)
  ├── Artifact previews (2-column grid, max 4 shown)
  ├── Type badges row
  └── Crumbs row (notes / hints / tips chips)
```

### Selection state
- Normal: `border-white/[0.08]`
- Selected: `ring-2 ring-[#7c3aed] + purple glow shadow`
- Hover: `border-white/[0.15] + deeper shadow`

---

## Connection Arrows

Connections are stored in `useCanvasStore().connections: ModuleConnection[]`.

Arrow rendering (`FlowArrows` SVG component):
- **Path**: Cubic bezier from bottom-center of source to top-center of target
- **Default**: `stroke="rgba(124,58,237,0.22)"` dashed, animated `stroke-dashoffset`
- **Highlighted** (when source or target is selected): `stroke="rgba(124,58,237,0.7)"` solid

When `addModule` is called, a connection is automatically created from the previous module to the new one.

---

## Doubt System

### How it triggers
1. **Double-click empty canvas** → `handleCanvasDoubleClick` → `openDoubtPopup(worldX, worldY)`
2. **Right-click** → context menu → "Ask a doubt here" → same
3. **SelectionBar** → "Ask about selection" → `openDoubtPopup` pre-filled

### DoubtPopup positioning
The popup renders in **screen space** (not canvas world space) so it stays fixed regardless of zoom. Screen position = `worldX × scale + panX + containerLeft`.

### Mock mode vs. real mode
| Mode | Behavior |
|------|----------|
| Mock (`isMockMode: true`) | Creates a `FlashcardArtifact` module immediately, no API call |
| Real (`isMockMode: false`) | Calls `sendMessage(question)` via `useAIChat`, AI generates artifacts |

---

## Zoom & Pan

- **Zoom range**: 10% – 300% (`MIN_ZOOM = 0.1`, `MAX_ZOOM = 3`)
- **Zoom step**: 10% of current scale per scroll tick (multiplicative)
- **Center-zoom**: Zoom is always centered on the cursor position
- **Zoom to fit**: Button resets transform to `{x:0, y:0, scale:1}`
- **Pan speed**: 1:1 with pointer movement when using hand tool

---

## Dark Mode Dot Grid

The canvas background uses a radial-gradient dot grid:
```css
background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
background-size: {24 × scale}px {24 × scale}px;
background-position: {x % (24 × scale)}px {y % (24 × scale)}px;
```
This creates the infinite-canvas illusion — dots move with pan, scale with zoom.
