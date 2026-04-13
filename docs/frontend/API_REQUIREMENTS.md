# API Requirements

## Existing Endpoints

### `POST /api/chat`

Primary AI tutor endpoint. Supports two modes.

**Request body**
```json
{
  "query": "string (required)",
  "persona": "professor | socratic | coach | eli5 (default: professor)",
  "history": "AgentMessage[] (default: [])",
  "documentContext": "string (optional) — extracted file/URL text",
  "mode": "tutor | friend (default: tutor)",
  "strategyHint": "string (optional) — injected by strategy agent"
}
```

**Response — tutor mode**
```json
{
  "type": "tutor",
  "tutor": { "explanation": "string" },
  "artifacts": "CanvasArtifact[]",
  "canvasAnnotations": "DelegatedAnnotation[]",
  "rawResponse": "string"
}
```

**Response — friend mode**
```json
{
  "type": "friend",
  "friend": { "analogy": "string", "followUp": "string" },
  "rawResponse": "string"
}
```

**Notes**
- Runs up to 4 tool-use rounds (MAX_TOOL_ROUNDS)
- Artifacts are produced via CANVAS_TOOLS (visual, graph, notation, flashcard, lookup, simulation)
- Model: `OPENAI_MODEL` env var (default `gpt-4o-mini`)

---

### `POST /api/chat/stream`

Streaming variant of `/api/chat`. Returns `text/event-stream` SSE.

**Request**: same shape as `/api/chat`

**Events**
```
data: { type: "delta", content: "string" }
data: { type: "artifact", artifact: CanvasArtifact }
data: { type: "done" }
data: { type: "error", error: "string" }
```

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

### `POST /api/doubt` *(not yet implemented)*

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

### `POST /api/url-fetch` *(not yet implemented)*

Fetches and extracts readable text from a URL. Used when the user pastes a URL into the landing page InputBar.

**Request body**
```json
{
  "url": "string"
}
```

**Response**
```json
{
  "url": "string",
  "title": "string",
  "text": "string",
  "wordCount": "number"
}
```

**Error response**
```json
{
  "error": "string",
  "url": "string"
}
```

**Implementation notes**
- Use `fetch(url)` server-side to avoid CORS
- Strip HTML with a lightweight parser (e.g., `node-html-parser` or regex on `<p>`, `<article>` tags)
- Truncate to 12,000 tokens before passing to `documentContext`
- Reject non-HTTP URLs; allowlist common content types (`text/html`, `application/pdf`)
- Rate-limit to 5 req/min per IP to prevent abuse
