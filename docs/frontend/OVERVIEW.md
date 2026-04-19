# Synapse — Frontend Overview

## Vision

Synapse is a **voice-first, infinite-canvas learning environment**. The core philosophy is:

> Learning should feel like a collaborative whiteboard session with the world's best tutor — not a lecture.

### Key Principles

1. **Canvas is king** — All learning content lives on a spatial, infinite canvas. Elements have positions and groups that mirror how knowledge is structured.
2. **Doubts are first-class** — Anywhere on the canvas, a user can double-click or select content to ask a question. The AI creates a new connected group or explains inline.
3. **Voice-first** — The primary interaction mode is speaking. The input bar collapses to a voice pill when in voice mode; captions appear live.
4. **Show, don't tell** — Every explanation is paired with an interactive artifact: 3D simulations, live graphs, flashcards, LaTeX notation, or SVG diagrams.

---

## Product Architecture

```
Landing page (/) → BridgeScreen (loading) → Workspace (/workspace)
                                               │
                    ┌──────────────────────────┴───────────────────────────────┐
                    │                    WorkspaceView                          │
                    │  ┌─────────────┐  ┌──────────────────────────────────┐  │
                    │  │ LeftSidebar │  │         Canvas Area              │  │
                    │  │ ─────────── │  │  ┌─────────────────────────────┐ │  │
                    │  │ Transcript  │  │  │     ArtifactCanvas          │ │  │
                    │  │ Updates     │  │  │  ┌──────────────────────┐   │ │  │
                    │  └─────────────┘  │  │  │  InfiniteCanvas      │   │ │  │
                    │                   │  │  │  GroupBoundary × N    │   │ │  │
                    │                   │  │  │  FlowArrows (SVG)     │   │ │  │
                    │                   │  │  │  ElementCard × N      │   │ │  │
                    │                   │  │  │  StrokeElement × N    │   │ │  │
                    │                   │  │  └──────────────────────┘   │ │  │
                    │                   │  │  SelectionBar (floating)     │ │  │
                    │                   │  │  DoubtPopup (floating)       │ │  │
                    │                   │  │  ContextMenu (floating)      │ │  │
                    │                   │  │  MockButton (dev)            │ │  │
                    │                   │  │  CanvasInputBar (bottom)     │ │  │
                    │                   │  └─────────────────────────────┘ │  │
                    │                   └──────────────────────────────────┘  │
                    └──────────────────────────────────────────────────────────┘
```

---

## Learning Session Flow

1. User enters topic / URL / uploads files on landing page → `InputBar`
2. App navigates to `/workspace` (URL has no query string — session lives in the Zustand store, persisted to `localStorage`)
3. `BridgeScreen` shows staged loading animation (whiteboard boxes draw in, arrows connect them)
4. Canvas slides in — default tool is **Interaction** mode; `CanvasInputBar` awaits input
5. **Mode picker** card appears in `CanvasInputBar` on the first message of a session — user picks **Guided** (step-by-step) or **Auto Explore** (queue every module of the study plan back-to-back)
6. User speaks or types → `CanvasInputBar` → `useAIChat` → `/api/chat` SSE → grouped elements appear, each group titled with the AI's `moduleTitle` (handwritten heading on `GroupBoundary`)
7. After each turn: a dismissible **Synapse bubble** shows the explanation; **YouTube-style live captions** appear over the canvas during TTS playback
8. User double-clicks empty canvas → `DoubtPopup` → new connected group
9. User clicks elements in Select mode → group-aware selection → `SelectionBar` → "Ask about selection" or "Ungroup"
10. Groups connect via animated purple arrows (quadratic bezier, nearest-faces routing) showing the learning path
11. If user refreshes or navigates away and back, the workspace rehydrates from `localStorage`. If the store has no `sessionId/query` (e.g. someone hits `/workspace` directly), `WorkspaceView` redirects to `/`.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js (App Router) |
| UI | React 19, Tailwind CSS v4 |
| Animations | Framer Motion |
| State | Zustand |
| 3D | React Three Fiber + Three.js |
| Drawing | Pen tool (native SVG stroke → CanvasElement) |
| Voice | Web Speech API (native browser) |
| Math | KaTeX |
| Hand tracking | MediaPipe Tasks Vision |

---

## Color Palette (Light / Dark)

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Background | `#fafafa` | `#06060f` | Canvas, workspace base |
| Surface | white | `#0a0a18` | Sidebar, navbar |
| Accent | `#7c3aed` | `#7c3aed` | Purple — selection, connections, pen strokes |
| Border | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` | Card borders |
| Text primary | `rgba(0,0,0,0.78)` | `rgba(255,255,255,0.80)` | Main content |
| Text muted | `rgba(0,0,0,0.35)` | `rgba(255,255,255,0.35)` | Labels, timestamps |
