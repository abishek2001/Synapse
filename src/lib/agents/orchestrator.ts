import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildTutorSystemPrompt } from "./tutor";
import { buildFriendMessages } from "./friend";
import { getTeachingDecision, type TeachingDecision } from "./strategy";
import { observeTurn } from "./observer";
import type {
  AgentMessage,
  FriendResponse,
  OrchestratorInput,
  OrchestratorResult,
  SessionContextPatch,
} from "./types";
import { createSessionContext } from "@/lib/grounding/session-context";
import { getToolsForAction } from "@/lib/tools/schemas";
import { handleToolCall, type DelegatedAnnotation } from "@/lib/tools/handlers";
import type { CanvasArtifact } from "@/lib/tools/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const MAX_TOOL_ROUNDS = 4;
const FRIEND_CONFUSION_THRESHOLD = 3;

// ── Orchestrator entry point ────────────────────────────────────────────

export async function runOrchestrator(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const {
    query,
    persona,
    history,
    documentContext,
    sessionContext,
    studyPlan,
    mode,
  } = input;

  // ── 0. FORCED FRIEND MODE (manual "Call a Friend" button) ────────────
  if (mode === "friend") {
    return executeFriendTurn(
      query,
      null,
      sessionContext ?? createSessionContext(0),
    );
  }

  // ── 1. PLAN ──────────────────────────────────────────────────────────
  let decision: TeachingDecision | null = null;

  if (sessionContext) {
    const recentHistory = history
      .filter((m) => m.role !== "system")
      .slice(-6)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    try {
      decision = await getTeachingDecision(
        query,
        sessionContext,
        studyPlan,
        recentHistory,
      );
    } catch {
      // Strategy is best-effort — fall through to default
    }
  }

  const action = decision?.action ?? "explain";

  // ── 2. ROUTE ─────────────────────────────────────────────────────────
  const shouldAutoFriend =
    action === "simplify" &&
    sessionContext !== null &&
    sessionContext.confusionSignals >= FRIEND_CONFUSION_THRESHOLD;

  if (shouldAutoFriend) {
    return executeFriendTurn(query, decision, sessionContext!);
  }

  return executeTutorTurn(
    query,
    persona,
    history,
    documentContext,
    decision,
    sessionContext,
  );
}

// ── Friend path ─────────────────────────────────────────────────────────

async function executeFriendTurn(
  query: string,
  decision: TeachingDecision | null,
  sessionContext: import("@/lib/grounding/session-context").SessionContext,
): Promise<OrchestratorResult> {
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
    friend = {
      analogy: parsed.analogy || raw,
      followUp: parsed.followUp || "Does that make more sense?",
    };
  } catch {
    friend = { analogy: raw, followUp: "Does that make more sense?" };
  }

  const explanation = `${friend.analogy}\n\n${friend.followUp}`;

  // Observe even on friend turns
  const contextPatch = observeTurn({
    userMessage: query,
    tutorResponse: explanation,
    toolCallNames: [],
    toolCallArgs: [],
    decision,
    currentContext: sessionContext,
  });

  return {
    type: "friend",
    explanation,
    artifacts: [],
    canvasAnnotations: [],
    decision: decision
      ? { action: decision.action, reasoning: decision.reasoning }
      : null,
    contextPatch,
    rawResponse: raw,
    friend,
  };
}

// ── Tutor path ──────────────────────────────────────────────────────────

async function executeTutorTurn(
  query: string,
  persona: string,
  history: AgentMessage[],
  documentContext: string | undefined,
  decision: TeachingDecision | null,
  sessionContext: import("@/lib/grounding/session-context").SessionContext | null,
): Promise<OrchestratorResult> {
  // Build system prompt with strategy hint
  let systemPrompt = buildTutorSystemPrompt(persona, documentContext);

  if (decision) {
    systemPrompt += `\n\nTEACHING STRATEGY (from orchestration layer):\nAction: ${decision.action}\nReasoning: ${decision.reasoning}\n${decision.suggestedPrompt}\nFollow this guidance for your next response.`;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: query },
  ];

  // Get action-biased tool set
  const action = decision?.action ?? "explain";
  const { tools, toolChoice } = getToolsForAction(action);

  const artifacts: CanvasArtifact[] = [];
  const canvasAnnotations: DelegatedAnnotation[] = [];
  const allToolCallNames: string[] = [];
  const allToolCallArgs: Record<string, unknown>[] = [];
  let finalExplanation = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages,
      tools,
      tool_choice: round === 0 ? toolChoice : "auto",
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

      allToolCallNames.push(fnName);
      allToolCallArgs.push(fnArgs);

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

  if (!finalExplanation) {
    finalExplanation = "Let me show you on the canvas.";
  }

  // ── 4. OBSERVE ─────────────────────────────────────────────────────────
  let contextPatch: SessionContextPatch = {};

  if (sessionContext) {
    contextPatch = observeTurn({
      userMessage: query,
      tutorResponse: finalExplanation,
      toolCallNames: allToolCallNames,
      toolCallArgs: allToolCallArgs,
      decision,
      currentContext: sessionContext,
    });
  }

  return {
    type: "tutor",
    explanation: finalExplanation,
    artifacts,
    canvasAnnotations,
    decision: decision
      ? { action: decision.action, reasoning: decision.reasoning }
      : null,
    contextPatch,
    rawResponse: finalExplanation,
  };
}
