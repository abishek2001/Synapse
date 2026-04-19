import { NextRequest } from "next/server";
import { rawClient as openai, normalizeChatParams, pickModel } from "@/lib/logging/openai";
import { buildTutorMessages } from "@/lib/agents/tutor";
import type { AgentMessage } from "@/lib/agents/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    query,
    persona = "professor",
    history = [],
    documentContext,
  } = body as {
    query: string;
    persona: string;
    history: AgentMessage[];
    documentContext?: string;
  };

  if (!process.env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY not configured", { status: 500 });
  }

  const messages = buildTutorMessages(persona, query, history, documentContext);

  const stream = await openai.chat.completions.create(
    normalizeChatParams({
      model: pickModel("complex"),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    }),
  );

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
