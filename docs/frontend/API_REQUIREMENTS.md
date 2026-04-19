# API Requirements

## Existing Endpoints

### `POST /api/chat`

Primary AI tutor endpoint. Returns **Server-Sent Events** (`text/event-stream`).

**Request body**
```json
{
  "query": "string (required)",
  "persona": "professor | socratic | coach | eli5 (default: professor)",
  "history": "AgentMessage[] (default: [])",
  "documentContext": "string (optional) — extracted file/URL text",
  "canvasContext": "string (optional) — serialized list of current canvas artifacts to avoid duplication",
  "sessionContext": "SessionContext | null",
  "studyPlan": "StudyPlan | null",
  "mode": "tutor | friend (default: tutor)",
  "learningMode": "guided | auto | null (default: null)"
}
```

**`learningMode` semantics**:
- `"guided"` — tutor uses `GUIDED_RULES` system prompt (short, 2–3 sentences, one focused artifact per turn, ends with a question). Tool budget: 4 rounds, 1536 tokens.
- `"auto"` — tutor uses `AUTO_RULES` system prompt (comprehensive walkthrough, 3–6 artifacts per turn, 4–8 sentence synthesis). Tool budget: 8 rounds, 4096 tokens, `tool_choice: "required"`. Strategy agent is also bypassed (`if (sessionContext && learningMode !== "auto")`).
- `null` — falls back to guided rules.

**SSE Event stream** — events emitted in order:
```
data: { "type": "thinking", "message": "string" }
data: { "type": "artifact_pending", "pendingId": "string", "artifactType": "string", "title": "string" }
data: { "type": "artifact_done", "pendingId": "string", "artifact": CanvasArtifact }
data: { "type": "tutor_response", "moduleTitle": "string", "writtenText": "string", "spokenText": "string", "questionsForUser": ["string", ...] }
data: { "type": "follow_up", "questions": ["string", ...] }
data: { "type": "pause_for_input" }
data: { "type": "done", "contextPatch": SessionContextPatch }
data: { "type": "error", "message": "string" }
```

**Structured tutor response** (`tutor_response` event):
- `moduleTitle` — 3–6 word topic title (e.g. "How Neural Networks Learn"). Used as the `group.name` (heading) on the canvas module. May be empty (e.g. friend-mode turn) — client falls back to truncated user query.
- `writtenText` — 2–4 sentence prose shown in the dismissible Synapse bubble, the transcript, and as a `text` element at the top of the canvas module group. Plain text, no markdown.
- `spokenText` — 1–2 short conversational sentences for TTS. Only spoken when user clicks the Speak button (`speakReady` state).
- `questionsForUser` — direct questions the tutor wants to ask the student; rendered as violet (tier-1) chips above `CanvasInputBar` (capped to 2 by the client).

**Parser resilience**: `parseTutorResponse` runs up to 3 unwrap passes on the model's final message. Some models occasionally emit JSON with `writtenText` itself containing nested JSON; the parser detects and unwraps this before populating the event.

**Flow per turn**:
1. `thinking` — strategy agent is deciding action
2. One `artifact_pending` per tool call (before execution) → client places skeleton on canvas
3. One `artifact_done` per tool call (after execution) → client resolves skeleton → real artifact
4. `tutor_response` — structured text: writtenText to canvas/transcript, spokenText to TTS, questionsForUser to chips
5. `follow_up` — 2-3 strategy-suggested next questions (tier-2 neutral chips)
6. `done` — includes contextPatch for session state update

**Notes**
- Pipeline: Strategy Agent (skipped in `auto` mode) → Tool Loop (4 rounds in guided, 8 in auto) → Observer
- `canvasContext` is a text summary of existing elements; AI skips duplicating them
- `followUpQuestions` come from the Strategy agent, not the tutor LLM
- Model: `OPENAI_MODEL` env var (default `gpt-4o-mini`)

---

### `POST /api/strategy`

Teaching strategy oracle. Two actions:

**Request body**
```json
{
  "action": "decide | summarize",
  "userMessage": "string",
  "sessionContext": "SessionContext",
  "studyPlan": "StudyPlan | null",
  "recentHistory": [{ "role": "string", "content": "string" }]
}
```

**Response — decide**
```json
{ "decision": "TeachingDecision" }
```

**Response — summarize**
```json
{ "summary": "string" }
```

---

### `POST /api/study-plan`

Generates a structured learning plan for a topic.

**Request body**
```json
{
  "topic": "string",
  "persona": "string",
  "documentContext": "string (optional)"
}
```

**Response**
```json
{
  "studyPlan": {
    "topic": "string",
    "modules": [{ "title": "string", "concepts": "string[]", "estimatedMinutes": "number" }],
    "prerequisites": "string[]",
    "totalEstimatedMinutes": "number"
  }
}
```

---

### `POST /api/embed`

Embeds text chunks for retrieval.

**Request body**
```json
{
  "texts": "string[]",
  "namespace": "string (optional)"
}
```

**Response**
```json
{ "embeddings": "number[][]", "indexed": "boolean" }
```

---

### `POST /api/parse-doc`

Extracts text from uploaded documents (PDF, DOCX, TXT).

**Request**: `multipart/form-data` with `file` field

**Response**
```json
{
  "text": "string",
  "pageCount": "number (optional)",
  "filename": "string"
}
```

---

### `POST /api/simulate`

Generates simulation parameters for physics/chemistry/math scenarios.

**Request body**
```json
{
  "topic": "string",
  "simulationType": "pendulum | wave | orbit | molecule | custom"
}
```

**Response**
```json
{
  "params": "Record<string, number | string>",
  "description": "string"
}
```

---

## New Endpoints Required

### `POST /api/doubt` *(implemented)*

Processes a doubt question in the context of the current canvas state. Produces artifacts specifically for answering the user's conceptual question.

**Request body**
```json
{
  "question": "string",
  "context": {
    "nearbyModuleTitles": "string[]",
    "topic": "string",
    "persona": "string"
  },
  "history": "AgentMessage[] (optional)"
}
```

**Response**
```json
{
  "module": {
    "title": "string",
    "artifacts": "CanvasArtifact[]",
    "crumbs": "Crumb[]"
  },
  "tutor": { "explanation": "string" }
}
```

**Implementation notes**
- Reuses the `handleTutorMode` pipeline from `/api/chat`
- Prompt engineered to always produce at least one explanatory artifact
- `nearbyModuleTitles` injected into system prompt as context for relevance

---

---

### `POST /api/fetch-url` *(implemented — Bundle B)*

Fetches readable text from a URL via Jina Reader. Used by the bridge loading sequence when the user submits URLs in `InputBar`.

**Request body**
```json
{ "url": "string" }
```

**Response**
```json
{ "name": "string (hostname)", "text": "string (markdown, capped at 80k chars)" }
```

**Implementation notes**
- Proxies to `https://r.jina.ai/{url}` — no API key required
- Returns clean markdown; 15s timeout, 80k char cap
- `name` is the hostname with `www.` stripped

---

### `POST /api/extract-title` *(implemented)*

Extracts a short topic title (3–8 words) from document text. Called during bridge loading after URL/file content is parsed.

**Request body**
```json
{ "text": "string" }
```

**Response**
```json
{ "title": "string" }
```

**Implementation notes**
- Uses `gpt-4o-mini` with a tight system prompt and `max_tokens: 24`
- Falls back to `""` on any error (best-effort, non-critical)
