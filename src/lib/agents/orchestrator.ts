import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildTutorSystemPrompt, parseTutorResponse } from "./tutor";
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
  StreamEvent,
} from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export async function runOrchestrator(
  input: OrchestratorInput,
  onEvent?: (e: StreamEvent) => void,
): Promise<OrchestratorResult> {
  const {
    query, persona, history, documentContext, canvasContext,
    sessionContext, studyPlan, mode, learningMode = null,
  } = input;

  // Manual friend invocation only (Call a Friend button)
  if (mode === "friend") {
    return executeFriendTurn(query, sessionContext, onEvent);
  }

  // ── PLAN ──────────────────────────────────────────────────────────────────
  onEvent?.({ type: "thinking", message: "Planning approach…" });

  // In auto-explore mode we skip the strategy agent entirely — the auto prompt
  // already tells the model to be comprehensive, no need for per-turn pedagogy.
  let decision: TeachingDecision | null = null;
  if (sessionContext && learningMode !== "auto") {
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
  return executeTutorTurn(
    query, persona, history, documentContext, canvasContext,
    decision, sessionContext, learningMode, onEvent,
  );
}

async function executeFriendTurn(
  query: string,
  sessionContext: OrchestratorInput["sessionContext"],
  onEvent?: (e: StreamEvent) => void,
): Promise<OrchestratorResult> {
  onEvent?.({ type: "thinking", message: "Crafting analogy…" });

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

  const spokenText = friend.analogy;
  const writtenText = friend.analogy;

  onEvent?.({
    type: "tutor_response",
    writtenText,
    spokenText,
    questionsForUser: [friend.followUp],
  });
  onEvent?.({ type: "done", contextPatch });

  return {
    type: "friend",
    friend,
    tutor: { writtenText, spokenText, questionsForUser: [friend.followUp] },
    artifacts: [],
    canvasAnnotations: [],
    decision: null,
    contextPatch,
    rawResponse: raw,
    followUpQuestions: [],
    pauseForInput: false,
  };
}

async function executeTutorTurn(
  query: string,
  persona: string,
  history: AgentMessage[],
  documentContext: string | undefined,
  canvasContext: string | undefined,
  decision: TeachingDecision | null,
  sessionContext: OrchestratorInput["sessionContext"],
  learningMode: "guided" | "auto" | null,
  onEvent?: (e: StreamEvent) => void,
): Promise<OrchestratorResult> {
  let systemPrompt = buildTutorSystemPrompt(persona, documentContext, learningMode);

  // Mode-aware budgets — auto-explore needs more rounds + tokens to drop multiple artifacts in one turn.
  const maxRounds = learningMode === "auto" ? 8 : 4;
  const maxTokens = learningMode === "auto" ? 4096 : 1536;

  // Inject canvas context so the AI knows what's already on the board
  if (canvasContext) {
    systemPrompt += `\n\n## CURRENT CANVAS STATE\nThe following artifacts are already on the student's canvas — do not duplicate them:\n${canvasContext}`;
  }

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

  const { tools: initialTools, toolChoice: initialToolChoiceFromDecision } = decision
    ? getToolsForAction(decision.action)
    : { tools: CANVAS_TOOLS, toolChoice: "auto" as const };

  // Force tool use on round 0 in auto-explore (always), or in guided mode when the strategy
  // agent already said the artifacts are required. Without this, the model sometimes responds
  // with text only on the first turn — defeating the whole "thinking environment" pitch.
  const initialToolChoice: "auto" | "required" =
    learningMode === "auto" ? "required" : initialToolChoiceFromDecision;

  const artifacts: CanvasArtifact[] = [];
  const canvasAnnotations: DelegatedAnnotation[] = [];
  const toolCallNames: string[] = [];
  const toolCallArgs: Record<string, unknown>[] = [];
  // Map from tool call id → pending element id so we can resolve skeletons
  const pendingIdMap = new Map<string, string>();
  let finalExplanation = "";

  for (let round = 0; round < maxRounds; round++) {
    // Round 0: use action-filtered tools, force tool use if no artifacts yet.
    // Subsequent rounds: open up to all tools, model decides whether to keep going.
    const toolsForRound   = round === 0 ? initialTools : CANVAS_TOOLS;
    const forceTools = round === 0 && artifacts.length === 0 && initialToolChoice === "required";
    const toolChoiceRound = forceTools ? ("required" as const) : ("auto" as const);

    const res = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: toolsForRound,
      tool_choice: toolChoiceRound,
      temperature: 0.7,
      max_tokens: maxTokens,
      // Force JSON output whenever the model is allowed to write content (i.e. tool_choice="auto").
      // When tool_choice="required" the model cannot return content, so JSON mode would be a no-op.
      // OpenAI requires the prompt to mention "json" — our system prompt does.
      ...(toolChoiceRound === "auto" ? { response_format: { type: "json_object" as const } } : {}),
    });

    const assistantMsg = res.choices[0].message;

    if (!assistantMsg.tool_calls?.length) {
      // Final round — no more tools; this content is the structured JSON response
      if (assistantMsg.content) finalExplanation = assistantMsg.content;
      break;
    }

    // Intermediate round has tool calls — ignore any content (model reasoning chatter)

    messages.push(assistantMsg);

    // Emit pending skeletons for all tool calls in this round before awaiting them
    for (const toolCall of assistantMsg.tool_calls) {
      if (toolCall.type !== "function") continue;
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown> = {};
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }

      // Determine artifact type from tool name
      const artifactType = toolNameToArtifactType(fnName);
      if (artifactType) {
        const pendingId = `pending-${toolCall.id}`;
        pendingIdMap.set(toolCall.id, pendingId);
        onEvent?.({
          type: "artifact_pending",
          pendingId,
          artifactType,
          title: (fnArgs.title as string) || artifactType,
        });
      }

      toolCallNames.push(fnName);
      toolCallArgs.push(fnArgs);
    }

    // Now execute each tool call and emit artifact_done
    for (const toolCall of assistantMsg.tool_calls) {
      if (toolCall.type !== "function") continue;
      const fnName = toolCall.function.name;
      let fnArgs: Record<string, unknown> = {};
      try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { fnArgs = {}; }

      try {
        const toolResult = await handleToolCall(fnName, fnArgs, documentContext);
        if (toolResult.artifact) {
          artifacts.push(toolResult.artifact);
          const pendingId = pendingIdMap.get(toolCall.id);
          if (pendingId) {
            onEvent?.({ type: "artifact_done", pendingId, artifact: toolResult.artifact });
          }
        }
        if (toolResult.annotations) canvasAnnotations.push(...toolResult.annotations);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult.result,
        });
      } catch (toolErr) {
        // One bad tool call shouldn't sink the whole turn — clean up the skeleton and tell the model.
        const errMsg = toolErr instanceof Error ? toolErr.message : "tool execution failed";
        console.error(`Tool ${fnName} failed:`, errMsg);
        const pendingId = pendingIdMap.get(toolCall.id);
        if (pendingId) {
          // Drop the skeleton so the user doesn't see a forever-loading card
          onEvent?.({
            type: "artifact_done",
            pendingId,
            artifact: { id: pendingId, type: "lookup", title: "Failed to render", status: "error", query: fnName, results: [] } as CanvasArtifact,
          });
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `[Tool error: ${errMsg}. Continue without this artifact.]`,
        });
      }
    }
  }

  // Parse structured tutor response (writtenText / spokenText / questionsForUser)
  const rawFinal = finalExplanation || '{"writtenText":"Let me show you on the canvas.","spokenText":"Check out what I just placed on the canvas.","questionsForUser":[]}';
  const tutorResponse = parseTutorResponse(rawFinal);

  const contextPatch: SessionContextPatch = sessionContext
    ? observeTurn({
        userMessage: query,
        tutorResponse: tutorResponse.writtenText,
        toolCallNames,
        toolCallArgs,
        decision,
        currentContext: sessionContext,
      })
    : { lastActivityAt: Date.now() };

  const followUpQuestions = decision?.followUpQuestions ?? [];
  const pauseForInput = decision?.pauseForInput ?? false;

  // Emit structured tutor response
  onEvent?.({
    type: "tutor_response",
    writtenText: tutorResponse.writtenText,
    spokenText: tutorResponse.spokenText,
    questionsForUser: tutorResponse.questionsForUser,
  });

  // Emit strategy follow-up suggestions (tier 2 chips)
  if (followUpQuestions.length > 0) {
    onEvent?.({ type: "follow_up", questions: followUpQuestions });
  }
  if (pauseForInput) {
    onEvent?.({ type: "pause_for_input" });
  }
  onEvent?.({ type: "done", contextPatch });

  return {
    type: "tutor",
    tutor: {
      writtenText: tutorResponse.writtenText,
      spokenText: tutorResponse.spokenText,
      questionsForUser: tutorResponse.questionsForUser,
    },
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
    rawResponse: tutorResponse.writtenText,
    followUpQuestions,
    pauseForInput,
  };
}

function toolNameToArtifactType(toolName: string): string | null {
  const map: Record<string, string> = {
    canvas_generate_visual:     "visual",
    canvas_generate_graph:      "graph",
    canvas_generate_notation:   "notation",
    flashcard_create:           "flashcard",
    knowledge_lookup:           "lookup",
    canvas_generate_diagram:    "diagram",
    canvas_generate_simulation: "simulation",
    canvas_generate_3d_render:  "render3d",
  };
  return map[toolName] ?? null;
}
