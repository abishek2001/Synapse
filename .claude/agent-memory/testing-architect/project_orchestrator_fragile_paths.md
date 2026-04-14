---
name: Orchestrator loop fragile paths
description: Key fragile integration points and bug patterns in the Plan→Route→Execute→Observe loop discovered during the 2026-04-13 test plan analysis
type: project
---

Fragile paths identified in `src/lib/agents/orchestrator.ts`:

1. **Strategy skipped when sessionContext is null** — If sessionContext is null, strategy is entirely skipped and action defaults to "explain". This means the first user message (before grounding store populates) always uses "explain" action. Not a bug per se, but a behavioral gap to test.

2. **MAX_TOOL_ROUNDS accumulation** — finalExplanation is string-concatenated with a space across rounds. If the LLM emits text in round 1 AND round 2 (before and after tool use), the concatenated result may be incoherent or duplicate information. No deduplication or structural joining.

3. **Friend turn uses query as both topic AND confusion** — `buildFriendMessages(query, query)` passes the same string for both `topic` and `confusion` parameters. The friend system prompt asks for a differentiated topic/confusion distinction but gets the same value for both.

4. **tool_choice "required" on round 0 only** — Subsequent rounds use "auto". This means a `visualize` action forces a tool call on round 1, but subsequent rounds are unconstrained. The LLM could produce text-only responses on rounds 2-4 even for visualize intent.

5. **Empty finalExplanation fallback** — "Let me show you on the canvas." is returned when the LLM never emitted text (only tool calls). This is reasonable but completely unhelpful if tools also failed.

**Why:** These were found by static analysis during the comprehensive test plan session on 2026-04-13.
**How to apply:** Flag these when reviewing orchestrator changes or debugging unexpected tutor responses.
