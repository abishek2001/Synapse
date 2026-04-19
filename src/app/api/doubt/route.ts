import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentMessage } from "@/lib/agents/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: {
    question?: string;
    context?: {
      nearbyModuleTitles?: string[];
      topic?: string;
      persona?: string;
    };
    history?: AgentMessage[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { question, context = {}, history = [] } = body;

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const { nearbyModuleTitles = [], topic = "", persona = "professor" } = context;

  // Build a canvas context hint from nearby modules so the AI knows what's already visible
  const canvasContext = nearbyModuleTitles.length > 0
    ? nearbyModuleTitles.map((t) => `- [group] "${t}"`).join("\n")
    : undefined;

  // Inject topic into the query if provided
  const enrichedQuery = topic
    ? `[Topic: ${topic}]\n${question}`
    : question;

  try {
    const result = await runOrchestrator({
      query: enrichedQuery,
      persona,
      history,
      canvasContext,
      sessionContext: null,
      studyPlan: null,
    });

    return NextResponse.json({
      module: {
        title: question.length > 60 ? question.slice(0, 60) + "…" : question,
        artifacts: result.artifacts,
        crumbs: [],
      },
      tutor: {
        explanation: result.tutor?.writtenText ?? "",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Doubt API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
