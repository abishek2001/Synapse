import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildTutorSystemPrompt } from "@/lib/agents/tutor";
import { buildFriendMessages } from "@/lib/agents/friend";
import { CANVAS_TOOLS } from "@/lib/tools/schemas";
import { handleToolCall, type DelegatedAnnotation } from "@/lib/tools/handlers";
import type { AgentMessage, FriendResponse } from "@/lib/agents/types";
import type { CanvasArtifact } from "@/lib/tools/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const MAX_TOOL_ROUNDS = 4;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      persona = "professor",
      history = [],
      documentContext,
      mode = "tutor",
      strategyHint,
    } = body as {
      query: string;
      persona: string;
      history: AgentMessage[];
      documentContext?: string;
      mode: "tutor" | "friend";
      strategyHint?: string;
    };

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    if (mode === "friend") {
      return handleFriendMode(query);
    }

    return handleTutorMode(query, persona, history, documentContext, strategyHint);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleFriendMode(query: string) {
  const messages = buildFriendMessages(query, query);
  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: 0.7,
    max_tokens: 1024,
  });

  const raw = res.choices[0]?.message?.content ?? "";
  let friend: FriendResponse;
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)![0]);
    friend = { analogy: parsed.analogy || raw, followUp: parsed.followUp || "Does that make more sense?" };
  } catch {
    friend = { analogy: raw, followUp: "Does that make more sense?" };
  }

  return NextResponse.json({ type: "friend", friend, rawResponse: raw });
}

async function handleTutorMode(
  query: string,
  persona: string,
  history: AgentMessage[],
  documentContext?: string,
  strategyHint?: string,
) {
  let systemPrompt = buildTutorSystemPrompt(persona, documentContext);

  if (strategyHint) {
    systemPrompt += `\n\nTEACHING STRATEGY HINT (from the orchestration layer):\n${strategyHint}\nFollow this guidance for your next response.`;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: query },
  ];

  const artifacts: CanvasArtifact[] = [];
  const canvasAnnotations: DelegatedAnnotation[] = [];
  let finalExplanation = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages,
      tools: CANVAS_TOOLS,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 1536,
    });

    const choice = res.choices[0];
    const assistantMsg = choice.message;

    if (assistantMsg.content) {
      finalExplanation += (finalExplanation ? " " : "") + assistantMsg.content;
    }

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      break;
    }

    messages.push(assistantMsg);

    for (const toolCall of assistantMsg.tool_calls) {
      if (toolCall.type !== "function") continue;

      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown> = {};

      try {
        fnArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        fnArgs = {};
      }

      const toolResult = await handleToolCall(fnName, fnArgs, documentContext);

      if (toolResult.artifact) {
        artifacts.push(toolResult.artifact);
      }

      if (toolResult.annotations) {
        canvasAnnotations.push(...toolResult.annotations);
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult.result,
      });
    }
  }

  return NextResponse.json({
    type: "tutor",
    tutor: { explanation: finalExplanation || "Let me show you on the canvas." },
    artifacts,
    canvasAnnotations,
    rawResponse: finalExplanation,
  });
}
