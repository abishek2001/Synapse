import { NextRequest, NextResponse } from "next/server";
import { getTeachingDecision, generateSessionSummary } from "@/lib/agents/strategy";
import type { StudyPlan } from "@/lib/grounding/study-plan";
import type { SessionContext } from "@/lib/grounding/session-context";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action = "decide",
      userMessage,
      sessionContext,
      studyPlan,
      recentHistory,
    } = body as {
      action: "decide" | "summarize";
      userMessage: string;
      sessionContext: SessionContext;
      studyPlan: StudyPlan | null;
      recentHistory: { role: string; content: string }[];
    };

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    if (action === "summarize") {
      const summary = await generateSessionSummary(sessionContext, recentHistory);
      return NextResponse.json({ summary });
    }

    const decision = await getTeachingDecision(
      userMessage,
      sessionContext,
      studyPlan,
      recentHistory,
    );

    return NextResponse.json({ decision });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Strategy API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
