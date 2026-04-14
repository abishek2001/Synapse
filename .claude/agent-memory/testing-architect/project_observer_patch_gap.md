---
name: Observer patch application gap
description: The observer produces a conceptStates full-object patch that can conflict with conceptUpdates in the client-side merge logic
type: project
---

**Bug (MEDIUM severity):** In `src/lib/agents/observer.ts`, when confusion is detected AND there are conceptsToTrack, the observer sets `patch.conceptStates` to the ENTIRE current conceptStates object (a full copy). This patch field is a `Partial<SessionContext>` field (not `conceptUpdates`).

In `TutorPanel.tsx` (line 219), the merge logic destructures: `const { conceptUpdates, ...directPatch } = data.contextPatch`. The `directPatch` spread is then merged directly onto the session context — meaning if `conceptStates` is present in `directPatch`, it replaces the entire `conceptStates` map rather than merging concept-by-concept. This can cause previously tracked concepts to be dropped.

**The two code paths diverge:**
- Normal concept tracking: goes through `conceptUpdates` (correctly merged per-concept in TutorPanel)
- Confusion-attributed concept tracking: goes through `patch.conceptStates` (full object, not per-concept)

**Scenario:** Student has 5 tracked concepts. They get confused about concept 1. Observer sets `patch.conceptStates` = copy of all 5 (with concept 1's confusionCount bumped). TutorPanel spreads this into `updated`, overwriting whatever conceptStates was built from `conceptUpdates` for the same turn. Effectively harmless but architecturally inconsistent — could become destructive if `conceptUpdates` is processed after `directPatch` and overwrites the confusion-count update.

**How to apply:** When observer or TutorPanel contextPatch merging logic is changed, verify the two paths (conceptUpdates and directPatch.conceptStates) don't clobber each other.
