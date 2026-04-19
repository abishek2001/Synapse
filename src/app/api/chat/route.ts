import { NextRequest } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentMessage, FocusInput, StreamEvent } from "@/lib/agents/types";
import type { SessionContext } from "@/lib/grounding/session-context";
import type { StudyPlan } from "@/lib/grounding/study-plan";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    query?: string;
    persona?: string;
    history?: AgentMessage[];
    documentContext?: string;
    canvasContext?: string;
    sessionContext?: SessionContext | null;
    studyPlan?: StudyPlan | null;
    mode?: "tutor" | "friend";
    learningMode?: "guided" | "auto" | null;
    focus?: FocusInput;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    query,
    persona = "professor",
    history = [],
    documentContext,
    canvasContext,
    sessionContext = null,
    studyPlan = null,
    mode,
    learningMode = null,
    focus,
  } = body;

  if (!query) {
    return new Response(JSON.stringify({ error: "query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── SSE stream ─────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const t0 = Date.now();
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[chat:${reqId}] ▶ open  query="${query.slice(0, 60)}" mode=${learningMode ?? "—"}`);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      const emit = (event: StreamEvent) => {
        if (closed) return;
        try {
          const line = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          // Client disconnected mid-stream — stop trying to write.
          closed = true;
          return;
        }
        const dt = Date.now() - t0;
        const summary =
          event.type === "artifact_pending" ? `${event.artifactType} "${event.title}"`
          : event.type === "artifact_done"   ? `id=${event.pendingId}`
          : event.type === "artifact_error"  ? `${event.artifactType} id=${event.pendingId} reason=${event.reason}`
          : event.type === "thinking"        ? event.message
          : event.type === "error"           ? event.message
          : "";
        console.log(`[chat:${reqId}] +${dt}ms  ${event.type}${summary ? `  ${summary}` : ""}`);
      };

      // Forward client cancellation (stop button, tab close) to OpenAI calls.
      req.signal.addEventListener("abort", () => {
        console.log(`[chat:${reqId}] ✋ client aborted (${Date.now() - t0}ms)`);
      });

      try {
        await runOrchestrator(
          { query, persona, history, documentContext, canvasContext, sessionContext, studyPlan, mode, learningMode, focus },
          emit,
          req.signal,
        );
      } catch (err: unknown) {
        // Aborts come back as DOMException("AbortError") or OpenAI APIUserAbortError.
        const isAbort =
          (err instanceof Error && (err.name === "AbortError" || err.name === "APIUserAbortError")) ||
          req.signal.aborted;
        if (isAbort) {
          console.log(`[chat:${reqId}] aborted cleanly`);
        } else {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error(`[chat:${reqId}] ✖ error:`, message);
          emit({ type: "error", message });
        }
      } finally {
        safeClose();
        console.log(`[chat:${reqId}] ■ close (${Date.now() - t0}ms total)`);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
