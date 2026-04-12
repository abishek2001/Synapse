@AGENTS.md

# Project: Synapse — AI Teaching Assistant

Edtech app: AI tutor monitors study sessions and populates an infinite canvas with sequential learning artifacts (visuals, graphs, notation, flashcards, simulations, lookups).

## Tech Stack
- Next.js 16.2.3 (non-standard — check `node_modules/next/dist/docs/` before using Next APIs)
- React 19, TypeScript, Zustand (state), tldraw (unused placeholder), Three.js + R3F (3D sims)
- OpenAI SDK (gpt-4o-mini default), KaTeX (math), MediaPipe (hand tracking), Web Speech API (voice)
- Prisma + SQLite (User, Session, Document models)

## Architecture

### Orchestrator Loop (server-side, implemented 2026-04-11)
Single server-side turn per user message: Plan → Route → Execute → Observe.

1. **Plan**: Strategy agent (`src/lib/agents/strategy.ts`) decides next pedagogical action (explain/visualize/quiz/simplify/advance/summarize/deep_dive)
2. **Route**: Auto-invokes Friend agent if `action=simplify` AND `confusionSignals >= 3`. Manual friend via `mode: "friend"`.
3. **Execute**: Tutor agent runs with action-filtered tools (`getToolsForAction()` in `src/lib/tools/schemas.ts`). Up to 4 tool rounds.
4. **Observe**: Heuristic observer (`src/lib/agents/observer.ts`) produces `SessionContextPatch` — confusion detection (regex), concept tracking from tool args, artifact counting, module advancement.

Entry: `runOrchestrator()` in `src/lib/agents/orchestrator.ts`, called by `/api/chat` route.

### Key directories
- `src/lib/agents/` — tutor, friend, strategy, orchestrator, observer, types
- `src/lib/tools/` — schemas (tool definitions + `getToolsForAction`), handlers, types
- `src/lib/grounding/` — session-context, study-plan, retrieval
- `src/store/` — canvas, session, grounding (Zustand)
- `src/components/workspace/` — TutorPanel, InfiniteCanvas, VoiceIsland, HandTrackingOverlay, etc.
- `src/components/canvas/` — VisualCard, GraphCard, NotationCard, FlashcardCard, LookupCard, SimulationCard

## Project Management
- `tasks/todo.md` — Next steps and upcoming work
- `tasks/lessons.md` — Lessons learned, debugging rules (review at start of each session)

## Known Gaps (as of 2026-04-11)
- No OpenAI Realtime API (voice is browser Web Speech + chat completions)
- No persistent vector store (embeddings in-memory only, clear on restart)
- Streaming mode (`/api/chat/stream`) has no tool calling (text-only)
- No code artifact type (no `canvas_generate_code` tool)
- No session resume / second brain layer
- tldraw placeholder (`TldrawCanvas.tsx`) is unused
