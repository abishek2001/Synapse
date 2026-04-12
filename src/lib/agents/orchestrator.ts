import { buildTutorMessages, parseTutorResponse, type TutorResponse } from "./tutor";
import { buildFriendMessages } from "./friend";
import type { AgentMessage, FriendResponse } from "./types";

interface OrchestratorInput {
  query: string;
  persona: string;
  history: AgentMessage[];
  documentContext?: string;
  mode: "tutor" | "friend";
}

interface OrchestratorResult {
  type: "tutor" | "friend";
  tutor?: TutorResponse;
  friend?: FriendResponse;
  rawResponse: string;
}

export async function orchestrate(
  input: OrchestratorInput,
  callLLM: (messages: AgentMessage[]) => Promise<string>,
): Promise<OrchestratorResult> {
  if (input.mode === "friend") {
    const messages = buildFriendMessages(input.query, input.query);
    const raw = await callLLM(messages);
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
    return { type: "friend", friend, rawResponse: raw };
  }

  const messages = buildTutorMessages(
    input.persona,
    input.query,
    input.history,
    input.documentContext,
  );
  const raw = await callLLM(messages);
  const tutor = parseTutorResponse(raw);

  return { type: "tutor", tutor, rawResponse: raw };
}
