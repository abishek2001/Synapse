import { NextRequest, NextResponse } from "next/server";
import { chatCompletion, pickModel } from "@/lib/logging/openai";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json() as { text: string };
    if (!text) return NextResponse.json({ title: "" });

    const res = await chatCompletion("extract-title", {
      model: pickModel("easy"),
      messages: [
        {
          role: "system",
          content: "Extract a short, clear topic title (3-8 words max) from the text. Reply with ONLY the title — no quotes, no punctuation at the end, nothing else.",
        },
        { role: "user", content: text.slice(0, 1500) },
      ],
      temperature: 0.2,
      max_tokens: 24,
    });

    const title = (res.choices[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: "" });
  }
}
