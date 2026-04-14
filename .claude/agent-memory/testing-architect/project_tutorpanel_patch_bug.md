---
name: TutorPanel contextPatch application conditional bug
description: contextPatch from observer is only applied client-side when the local sessionContext is non-null, creating a race condition
type: project
---

In `TutorPanel.tsx` lines 218-241:
```typescript
if (data.contextPatch && sessionContext) { ... updateContext(updated); }
```

The condition checks `sessionContext` from the Zustand store at call time. If the grounding store hasn't been populated yet (e.g., the study plan API call is still in progress on the bridge screen), sessionContext will be null and the patch is silently dropped.

**Race condition scenario:** User fires a message very quickly after the workspace loads. The bridge sequence (runBridgeSequence in WorkspaceView) runs study plan and embed in parallel — if study plan hasn't resolved yet, sessionContext is null. The first message's contextPatch (which would set questionsAsked=1 and potentially track first concepts) is dropped. Session context starts tracking from the second message.

**Separate issue:** The contextPatch from the orchestrator observer always sets `questionsAsked: currentContext.questionsAsked + 1` — but `currentContext` is the server-side snapshot passed in the request body. If the client sends a stale sessionContext (e.g., due to a lost patch from the race condition above), questionsAsked will be reset to an incorrect value.

**How to apply:** When debugging session context drift or incorrect confusion threshold behavior, check whether patches are being silently dropped due to this null guard.
