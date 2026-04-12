import { NextRequest, NextResponse } from "next/server";
import { generateStudyPlan } from "@/lib/grounding/study-plan";

export async function POST(req: NextRequest) {
  try {
    const { topic, documentContext } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const plan = await generateStudyPlan(topic, documentContext);
    return NextResponse.json({ plan });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Study plan API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
