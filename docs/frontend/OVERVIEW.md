# Synapse — Frontend Overview

## Vision

Synapse is a **voice-first, infinite-canvas learning environment**. The core philosophy is:

> Learning should feel like a collaborative whiteboard session with the world's best tutor — not a lecture.

### Key Principles

1. **Canvas is king** — All learning content lives on a spatial, infinite canvas. Modules have positions, connections, and relationships that mirror how knowledge is structured.
2. **Doubts are first-class** — Anywhere on the canvas, a user can double-click or select content to ask a question. The AI either creates a new connected module or explains inline.
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
                    │                   │  │  │  ModuleCards + Arrows │   │ │  │
                    │                   │  │  │  Annotations          │   │ │  │
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
2. App navigates to `/workspace?q=...&persona=...`
3. `BridgeScreen` shows staged loading (source parsing → AI warmup → canvas → 3D)
4. Canvas slides in — `CanvasInputBar` at bottom awaits input
5. User speaks or types → `CanvasInputBar` → `useAIChat` hook → API → modules appear
6. User double-clicks empty canvas → `DoubtPopup` → new connected module
7. User shift-clicks 2+ modules → `SelectionBar` → "Ask about selection"
8. Modules connect via animated purple arrows showing the learning path

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| Animations | Framer Motion |
| State | Zustand |
| 3D | React Three Fiber + Three.js |
| Drawing | Tldraw v4 (canvas panel) |
| Voice | Web Speech API (native browser) |
| Math | KaTeX |
| Hand tracking | MediaPipe Tasks Vision |

---

## Color Palette (Workspace)

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#06060f` | Canvas, workspace base |
| Surface | `#0a0a18` | Sidebar, navbar |
| Card | `#12121f` | Module cards |
| Card header | `#0f0f1e` | Module header bar |
| Accent | `#7c3aed` | Purple — buttons, selection, connections |
| Border | `rgba(255,255,255,0.08)` | Card borders |
| Text primary | `rgba(255,255,255,0.80)` | Main content |
| Text muted | `rgba(255,255,255,0.35)` | Labels, timestamps |
