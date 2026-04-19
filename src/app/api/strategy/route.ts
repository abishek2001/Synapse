import { NextRequest, NextResponse } from "next/server";
import { getTeachingDecision, generateSessionSummary } from "@/lib/agents/strategy";
import type { SessionContext } from "@/lib/grounding/session-context";
import type { StudyPlan } from "@/lib/grounding/study-plan";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: {
    action?: "decide" | "summarize";
    userMessage?: string;
    sessionContext?: SessionContext;
    studyPlan?: StudyPlan | null;
    recentHistory?: { role: string; content: string }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action = "decide", userMessage = "", sessionContext, studyPlan = null, recentHistory = [] } = body;

  if (!sessionContext) {
    return NextResponse.json({ error: "sessionContext is required" }, { status: 400 });
  }

  try {
    if (action === "decide") {
      const decision = await getTeachingDecision(userMessage, sessionContext, studyPlan ?? null, recentHistory);
      return NextResponse.json({ decision });
    }

    if (action === "summarize") {
      const summary = await generateSessionSummary(sessionContext, recentHistory);
      return NextResponse.json({ summary });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Strategy API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
