@AGENTS.md

# Synapse — Project Memory & Source of Truth

## Docs are the single source of truth

All knowledge about this project lives in [`docs/frontend/`](docs/frontend/). Before writing any code, read the relevant doc. After making any significant change, update the relevant doc.

| File | What it covers |
|------|---------------|
| [`docs/frontend/OVERVIEW.md`](docs/frontend/OVERVIEW.md) | Vision, product architecture diagram, session flow, tech stack, color palette |
| [`docs/frontend/CANVAS.md`](docs/frontend/CANVAS.md) | Tool modes, element types, groups, drag model, rendering layer order, zoom/pan, dot grid, doubt system |
| [`docs/frontend/COMPONENTS.md`](docs/frontend/COMPONENTS.md) | Full component tree, every component's props/responsibilities, stores, hooks |
| [`docs/frontend/FLOWS.md`](docs/frontend/FLOWS.md) | Step-by-step user journey flows (topic entry, voice, file upload, group select, pen annotation, group drag, mock demo) |
| [`docs/frontend/API_REQUIREMENTS.md`](docs/frontend/API_REQUIREMENTS.md) | All existing API endpoints + unimplemented ones with full request/response shapes |

---

## Rules for keeping docs current

1. **Every new component** → add an entry to `COMPONENTS.md` under the right section (landing / workspace / hooks / stores).
2. **Every new tool mode, interaction, or keyboard shortcut** → update `CANVAS.md`.
3. **Every new user-facing flow** → add a numbered flow to `FLOWS.md`.
4. **Every new or changed API endpoint** → update `API_REQUIREMENTS.md`.
5. **Architectural changes** (new major feature, store restructure, tech swap) → update `OVERVIEW.md`.
6. **Create new doc files** in `docs/frontend/` when a topic grows too large or doesn't fit an existing file (e.g. `VOICE.md`, `HAND_TRACKING.md`, `ACCESSIBILITY.md`).
7. **Keep the table above in sync** — if you add a new doc file, add it to the table in this file.

The goal: any new session should be able to read `docs/` and have a complete, accurate picture of the project without needing to grep the codebase.

---

## Key design decisions (why things are the way they are)

- **Interaction mode as default** — artifacts are interactive (flashcards flip, graphs pan). Select/Hand modes are opt-in so the default feel is "use it", not "manage it".
- **InfiniteCanvas early-return on element hits** — React 19's `stopPropagation` doesn't stop native DOM listeners. InfiniteCanvas checks `e.target.closest("[data-element-id]")` and returns early, giving element components uncontested pointer capture.
- **Two-pass element render** — strokes always render after artifacts in the DOM AND get `zIndex: 9000 + element.zIndex`. Both are needed because artifact `motion.div`s create stacking contexts with explicit positive z-indices.
- **Group drag via snapshot** — no dedicated "move group" store action. Each element snapshots all group member positions at drag start and applies a uniform delta. Keeps the store simple.
- **GroupBoundary is pointer-events-none** — no toolbar buttons on the boundary. Group controls live in SelectionBar. Avoids UI overlapping artifact content.
- **BridgeScreen arrows use Framer Motion `pathLength`** — not manual `strokeDasharray` estimates. `pathLength` calls `getTotalLength()` internally and is always correct.
- **Arrow routing is direction-aware** — horizontal connections exit right/enter left; vertical exit bottom/enter top. Prevents backward loops.
- **Whiteboard-native artifact rendering** — only `flashcard` artifacts render inside a card box (white bg, border, shadow). All other artifact types (graph, notation, visual, lookup, simulation) render directly on the canvas background with no wrapper. Flashcard is the exception because its page-flip UI needs a contained surface. Unless and until required, we won't put them in a separate card box.