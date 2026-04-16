import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentMessage } from "@/lib/agents/types";
import type { SessionContext } from "@/lib/grounding/session-context";
import type { StudyPlan } from "@/lib/grounding/study-plan";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      persona = "professor",
      history = [],
      documentContext,
      sessionContext = null,
      studyPlan = null,
      mode,
    } = body as {
      query: string;
      persona?: string;
      history?: AgentMessage[];
      documentContext?: string;
      sessionContext?: SessionContext | null;
      studyPlan?: StudyPlan | null;
      mode?: "tutor" | "friend";
    };

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const result = await runOrchestrator({
      query,
      persona,
      history,
      documentContext,
      sessionContext,
      studyPlan,
      mode,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
