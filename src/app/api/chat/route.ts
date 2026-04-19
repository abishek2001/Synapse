import { NextRequest } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentMessage, StreamEvent } from "@/lib/agents/types";
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
  } = body;

  if (!query) {
    return new Response(JSON.stringify({ error: "query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── SSE stream ─────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        const line = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(line));
      };

      try {
        await runOrchestrator(
          { query, persona, history, documentContext, canvasContext, sessionContext, studyPlan, mode, learningMode },
          emit,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("Chat API error:", message);
        emit({ type: "error", message });
      } finally {
        controller.close();
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
