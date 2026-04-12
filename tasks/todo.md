# TODO — Synapse Next Steps

## Completed
- [x] Multi-agent orchestrator loop (Plan → Route → Execute → Observe) — 2026-04-11
  - Server-side orchestration in `src/lib/agents/orchestrator.ts`
  - Strategy → Tutor/Friend routing with auto-friend on heavy confusion
  - Action-biased tool filtering (`getToolsForAction()`)
  - Heuristic observer for session context feedback (`src/lib/agents/observer.ts`)
  - Deleted `/api/strategy` route (Strategy now internal to orchestrator)
  - TutorPanel simplified — no separate strategy fetch, applies contextPatch from response

## Architecture Gaps (from planned diagrams)

### High Priority
- [ ] Streaming with tools — rewrite `/api/chat/stream` to support tool calling (currently text-only, canvas can't update mid-stream)
- [ ] Persistent vector store — move embeddings from in-memory to Prisma/pgvector so they survive server restarts
- [ ] Code artifact type — add `canvas_generate_code` tool + CodeCard component (syntax highlighting, optional execution)

### Medium Priority
- [ ] OpenAI Realtime API — replace browser Web Speech + chat completions with true voice-in/voice-out streaming
- [ ] Session resume / second brain — wire Prisma Session model into a resume flow so learners can return to a canvas
- [ ] 3D math artifact — generic 3D math objects (vectors, surfaces, manifolds) tied to math topics, beyond physics sims

### Low Priority / Cleanup
- [ ] Delete unused tldraw placeholder (`src/components/workspace/TldrawCanvas.tsx`)
- [ ] Wire Prisma Document model into retrieval (currently documents parsed but not persisted)
- [ ] Add `/api/chat/stream` tool calling support (depends on streaming-with-tools above)
