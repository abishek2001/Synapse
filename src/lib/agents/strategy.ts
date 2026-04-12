import OpenAI from "openai";
import type { StudyPlan } from "@/lib/grounding/study-plan";
import type { SessionContext } from "@/lib/grounding/session-context";
import { serializeForPrompt, getSessionStats } from "@/lib/grounding/session-context";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

export interface TeachingDecision {
  action:
    | "explain"
    | "visualize"
    | "quiz"
    | "simplify"
    | "advance"
    | "summarize"
    | "deep_dive";
  reasoning: string;
  suggestedPrompt: string;
  conceptsToTrack: string[];
  shouldAdvanceModule: boolean;
}

const STRATEGY_SYSTEM = `You are the Teaching Strategy agent for Synapse. You observe the learning session and decide the BEST next pedagogical action.

You receive:
- The student's latest message
- Session context (progress, confusion signals, concept mastery)
- The study plan (what modules exist)
- Recent conversation history

Your job: output a JSON decision for what the tutor should do next.

Decision types:
- "explain" — introduce or explain a concept (default)
- "visualize" — the tutor should generate a visual/graph/diagram
- "quiz" — test the student with flashcards or a question
- "simplify" — the student seems confused, simplify the current topic
- "advance" — the student has mastered this, move to next module
- "summarize" — summarize what was covered before moving on
- "deep_dive" — the student wants to go deeper on a specific sub-topic

Rules:
1. If confusionSignals > 2 on same concept, suggest "simplify"
2. If student says "next" / "move on" / "got it", suggest "advance" 
3. After 3+ exchanges on one concept without confusion, suggest "quiz" to test
4. After completing a module, suggest "summarize" before "advance"
5. If student asks "why" or "how", suggest "deep_dive" or "visualize"
6. If student says "show me" / "draw" / "can I see", suggest "visualize"

Output ONLY valid JSON:
{
  "action": "explain|visualize|quiz|simplify|advance|summarize|deep_dive",
  "reasoning": "why this action (1 sentence)",
  "suggestedPrompt": "hint for the tutor on what to say/do",
  "conceptsToTrack": ["concept names mentioned"],
  "shouldAdvanceModule": false
}`;

export async function getTeachingDecision(
  userMessage: string,
  sessionContext: SessionContext,
  studyPlan: StudyPlan | null,
  recentHistory: { role: string; content: string }[],
): Promise<TeachingDecision> {
  const ctxPrompt = serializeForPrompt(sessionContext);
  const stats = getSessionStats(sessionContext);

  const planInfo = studyPlan
    ? `STUDY PLAN: ${studyPlan.totalModules} modules\nCurrent: Module ${sessionContext.currentModuleIndex + 1} — "${studyPlan.modules[sessionContext.currentModuleIndex]?.title ?? "?"}" (${studyPlan.modules[sessionContext.currentModuleIndex]?.description ?? ""})\nKey terms: ${studyPlan.modules[sessionContext.currentModuleIndex]?.keyTerms.join(", ") ?? "none"}\nNext up: "${studyPlan.modules[sessionContext.currentModuleIndex + 1]?.title ?? "End"}"`
    : "No study plan available — free exploration mode.";

  const historyStr = recentHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const prompt = `${ctxPrompt}

${planInfo}

RECENT CONVERSATION:
${historyStr}

STUDENT'S LATEST MESSAGE: "${userMessage}"

Stats: ${stats.questionsAsked} questions, ${stats.mastered} concepts mastered, ${stats.needsWork.length} need work

What should the tutor do next?`;

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: STRATEGY_SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      action: parsed.action || "explain",
      reasoning: parsed.reasoning || "",
      suggestedPrompt: parsed.suggestedPrompt || "",
      conceptsToTrack: parsed.conceptsToTrack || [],
      shouldAdvanceModule: parsed.shouldAdvanceModule || false,
    };
  } catch {
    return {
      action: "explain",
      reasoning: "Fallback — couldn't parse strategy decision",
      suggestedPrompt: "",
      conceptsToTrack: [],
      shouldAdvanceModule: false,
    };
  }
}

export async function generateSessionSummary(
  sessionContext: SessionContext,
  recentHistory: { role: string; content: string }[],
): Promise<string> {
  const historyStr = recentHistory
    .slice(-10)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Summarize this learning session segment in 2-3 sentences. Focus on what the student learned, what they struggled with, and what comes next. Be concise.",
        },
        {
          role: "user",
          content: `${serializeForPrompt(sessionContext)}\n\nConversation:\n${historyStr}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    return res.choices[0]?.message?.content?.trim() ?? "Session in progress.";
  } catch {
    return "Session in progress.";
  }
}
