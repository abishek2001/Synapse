import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildTutorSystemPrompt } from "./tutor";
import { buildFriendMessages } from "./friend";
import { getTeachingDecision, type TeachingDecision } from "./strategy";
import { observeTurn } from "./observer";
import { CANVAS_TOOLS, getToolsForAction } from "@/lib/tools/schemas";
import { handleToolCall, type DelegatedAnnotation } from "@/lib/tools/handlers";
import type { CanvasArtifact } from "@/lib/tools/types";
import type {
  AgentMessage,
  FriendResponse,
  OrchestratorInput,
  OrchestratorResult,
  SessionContextPatch,
} from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const MAX_TOOL_ROUNDS = 4;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export async function runOrchestrator(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const { query, persona, history, documentContext, sessionContext, studyPlan, mode } = input;

  // Manual friend invocation only (Call a Friend button)
  if (mode === "friend") {
    return executeFriendTurn(query, sessionContext);
  }

  // ── PLAN ──────────────────────────────────────────────────────────────────
  let decision: TeachingDecision | null = null;
  if (sessionContext) {
    try {
      decision = await getTeachingDecision(
        query,
        sessionContext,
        studyPlan,
        history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      );
    } catch {
      decision = null;
    }
  }

  // ── EXECUTE ───────────────────────────────────────────────────────────────
  return executeTutorTurn(query, persona, history, documentContext, decision, sessionContext);
}

async function executeFriendTurn(
  query: string,
  sessionContext: OrchestratorInput["sessionContext"],
): Promise<OrchestratorResult> {
  const messages = buildFriendMessages(query, query);
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: 0.7,
    max_tokens: 1024,
  });

  const raw = res.choices[0]?.message?.content ?? "";
  let friend: FriendResponse;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    friend = {
      analogy: parsed?.analogy || raw,
      followUp: parsed?.followUp || "Does that make more sense?",
    };
  } catch {
    friend = { analogy: raw, followUp: "Does that make more sense?" };
  }

  const contextPatch: SessionContextPatch = sessionContext
    ? observeTurn({
        userMessage: query,
        tutorResponse: friend.analogy,
        toolCallNames: [],
        toolCallArgs: [],
        decision: null,
        currentContext: sessionContext,
      })
    : { lastActivityAt: Date.now() };

  return {
    type: "friend",
    friend,
    tutor: { explanation: friend.analogy },
    artifacts: [],
    canvasAnnotations: [],
    decision: null,
    contextPatch,
    rawResponse: raw,
  };
}

async function executeTutorTurn(
  query: string,
  persona: string,
  history: AgentMessage[],
  documentContext: string | undefined,
  decision: TeachingDecision | null,
  sessionContext: OrchestratorInput["sessionContext"],
): Promise<OrchestratorResult> {
  let systemPrompt = buildTutorSystemPrompt(persona, documentContext);

  // Inject strategy decision as a directive at the end of the system prompt
  if (decision) {
    const artifactHint = decision.suggestedArtifacts.length > 0
      ? `\nPrioritize these artifact types for this turn: ${decision.suggestedArtifacts.join(", ")}.`
      : "";

    systemPrompt += `\n\n## TEACHING STRATEGY FOR THIS TURN
Action: ${decision.action}
Reasoning: ${decision.reasoning}
Instruction: ${decision.suggestedPrompt}${artifactHint}
Follow this guidance. The artifact types listed are what the pedagogical layer determined would be most effective right now.`;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: query },
  ];

  const { tools: initialTools, toolChoice: initialToolChoice } = decision
    ? getToolsForAction(decision.action)
    : { tools: CANVAS_TOOLS, toolChoice: "auto" as const };

  const artifacts: CanvasArtifact[] = [];
  const canvasAnnotations: DelegatedAnnotation[] = [];
  const toolCallNames: string[] = [];
  const toolCallArgs: Record<string, unknown>[] = [];
  let finalExplanation = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Round 0: use action-filtered tools. Subsequent rounds: open up to all tools.
    const toolsForRound   = round === 0 ? initialTools : CANVAS_TOOLS;
    const toolChoiceRound = round === 0 ? initialToolChoice : ("auto" as const);

    const res = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: toolsForRound,
      tool_choice: toolChoiceRound,
      temperature: 0.7,
      max_tokens: 1536,
    });

    const assistantMsg = res.choices[0].message;

    if (assistantMsg.content) {
      finalExplanation += (finalExplanation ? " " : "") + assistantMsg.content;
    }

    if (!assistantMsg.tool_calls?.length) break;

    messages.push(assistantMsg);

    for (const toolCall of assistantMsg.tool_calls) {
      if (toolCall.type !== "function") continue;

      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown> = {};
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }

      toolCallNames.push(fnName);
      toolCallArgs.push(fnArgs);

      const toolResult = await handleToolCall(fnName, fnArgs, documentContext);
      if (toolResult.artifact)    artifacts.push(toolResult.artifact);
      if (toolResult.annotations) canvasAnnotations.push(...toolResult.annotations);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult.result,
      });
    }
  }

  const explanation = finalExplanation || "Let me show you on the canvas.";

  const contextPatch: SessionContextPatch = sessionContext
    ? observeTurn({
        userMessage: query,
        tutorResponse: explanation,
        toolCallNames,
        toolCallArgs,
        decision,
        currentContext: sessionContext,
      })
    : { lastActivityAt: Date.now() };

  return {
    type: "tutor",
    tutor: { explanation },
    artifacts,
    canvasAnnotations,
    decision: decision
      ? {
          action: decision.action,
          reasoning: decision.reasoning,
          suggestedPrompt: decision.suggestedPrompt,
        }
      : null,
    contextPatch,
    rawResponse: explanation,
  };
}
