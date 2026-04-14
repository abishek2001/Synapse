---
name: Friend agent JSON parsing risk
description: The friend agent uses a regex+JSON.parse approach that can throw on malformed output
type: project
---

In `src/lib/agents/orchestrator.ts`, `executeFriendTurn()` line ~112:
```
const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
```

The `!` non-null assertion on the regex match will throw a TypeError if the LLM returns a response with no JSON object at all. The outer try/catch catches this and falls back gracefully, but the error swallowing means the raw response is used as `analogy` — which may contain JSON fragments or error text shown to the user.

Additionally, in `CallFriendModal.tsx`, the modal reads `data.friend?.analogy` (safe) but also `data.rawResponse` as fallback. If friend JSON parsing fails, `rawResponse` contains the raw OpenAI output (potentially including JSON wrapper text).

**How to apply:** When modifying the friend agent or its prompt, always test with a response that doesn't return JSON to verify the fallback path produces user-friendly output.
