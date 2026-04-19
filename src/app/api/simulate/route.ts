import { NextRequest, NextResponse } from "next/server";
import { chatCompletion, pickModel } from "@/lib/logging/openai";
import { SIMULATION_SYSTEM_PROMPT, buildSimulationPrompt } from "@/lib/simulation/prompt";
import { sanitizeSimulationCode } from "@/lib/simulation/sanitize";

export async function POST(req: NextRequest) {
  try {
    const { topic, context } = (await req.json()) as {
      topic: string;
      context?: string;
    };

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      );
    }

    const userPrompt = buildSimulationPrompt(topic, context);

    const res = await chatCompletion(
      "simulate.api",
      {
        model: pickModel("medium"),
        messages: [
          { role: "system", content: SIMULATION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      },
      { signal: req.signal },
    );

    const raw = res.choices[0]?.message?.content ?? "";
    const { safe, code, issues } = sanitizeSimulationCode(raw);

    return NextResponse.json({
      code,
      safe,
      issues,
      usage: {
        prompt_tokens: res.usage?.prompt_tokens,
        completion_tokens: res.usage?.completion_tokens,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Simulate API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
