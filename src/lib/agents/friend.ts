import type { AgentMessage } from "./types";

const FRIEND_SYSTEM = `You are the "Call a Friend" agent in Synapse. When a user is stuck or confused, you jump in with casual, intuitive explanations.

Your response MUST be valid JSON:
{
  "analogy": "Your casual, analogy-based explanation",
  "followUp": "A short follow-up question or encouraging remark"
}

Rules:
- Use everyday analogies (throwing balls, pouring water, etc.)
- Keep it SHORT — 2-3 sentences max for the analogy
- Be warm and encouraging
- Never use jargon
- Make the user feel like they're talking to a smart friend on the phone`;

export function buildFriendMessages(
  topic: string,
  confusion: string,
): AgentMessage[] {
  return [
    { role: "system", content: FRIEND_SYSTEM },
    {
      role: "user",
      content: `I'm learning about "${topic}" and I'm confused about: ${confusion}. Can you explain it simply?`,
    },
  ];
}
