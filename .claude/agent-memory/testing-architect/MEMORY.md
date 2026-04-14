# Testing Architect Memory — Synapse

- [Orchestrator loop fragile paths](project_orchestrator_fragile_paths.md) — Key bugs and fragile integration points in the multi-agent orchestrator loop
- [Observer patch application gap](project_observer_patch_gap.md) — Critical bug: observer conceptStates patch partially overwrites vs. merges
- [Tool filtering coverage gap](project_tool_filtering_gap.md) — flashcard_create missing from observer artifact tracking; simulation type unroutable
- [Friend agent parsing risk](project_friend_parse_risk.md) — Regex JSON extraction can crash on malformed LLM output
- [TutorPanel context patch bug](project_tutorpanel_patch_bug.md) — contextPatch applied only when sessionContext exists in client state, not from server patch
