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
  suggestedArtifacts: string[];
  conceptsToTrack: string[];
  shouldAdvanceModule: boolean;
}

const STRATEGY_SYSTEM = `You are the Teaching Strategy agent for Synapse, an AI-powered learning platform with an infinite canvas. Your job is to decide the best pedagogical action AND the most effective artifacts to place on the canvas for each student turn.

## AVAILABLE CANVAS ARTIFACTS

The tutor can place any combination of these artifacts on the canvas:

| Artifact | Tool name | Best used when |
|----------|-----------|----------------|
| **diagram** | canvas_generate_diagram | Entities with clear relationships — architecture, pipelines, neural nets, flowcharts, state machines, concept maps. Each node is interactive. PREFER over visual for anything node-based. |
| **visual** | canvas_generate_visual | Free-form SVG sketches — waveforms, annotated drawings, comparison tables, timelines, anything that doesn't decompose into discrete nodes. |
| **graph** | canvas_generate_graph | Mathematical functions, data plots, trends, distributions. Expressions written in JS math syntax (Math.sin(x), x*x, etc.). |
| **notation** | canvas_generate_notation | LaTeX equations, derivations, proofs, formulas. Rendered with KaTeX. Use for anything with symbols, summations, integrals, matrices. |
| **flashcard** | flashcard_create | Active recall — testing if the student knows definitions, facts, or can apply concepts. Use after introducing a concept. |
| **lookup** | knowledge_lookup | Pulling precise quotes or definitions from the student's uploaded documents. Only useful when documents are uploaded. |
| **simulation** | canvas_generate_simulation | Physics, chemistry, biology, or math concepts that benefit from interactive 3D animation (pendulums, orbits, waves, molecules, electric fields, projectile motion). Use when the concept is dynamic/moving in nature. |
| **render3d** | canvas_generate_3d_render | Interactive 3D scene written in Three.js — anatomy (heart, brain, lungs), crystal structures, molecular geometry, 3D math shapes, orbital mechanics. LLM writes the Three.js scene code directly. Use when the concept benefits from a precise, hand-crafted 3D visual rather than a generic physics sim. |

## DECISION ACTIONS

- **"explain"** — Introduce or explain a concept in conversation + optional supporting artifact
- **"visualize"** — Student asked to see something; produce diagram/graph/visual/simulation as primary output
- **"quiz"** — Test understanding with flashcards after sufficient explanation
- **"simplify"** — Student is confused; use simpler language + analogy-based artifacts (visual, flashcard)
- **"deep_dive"** — Student wants more depth; use notation + diagram + simulation together
- **"summarize"** — Wrap up a module with notation or a concept map diagram
- **"advance"** — Student is ready for the next module

## ARTIFACT SELECTION RULES

For each action, choose the best combination of suggestedArtifacts:

- **explain** → diagram or visual (to illustrate), optionally notation (for formulas)
- **visualize** → diagram (if entities/relationships), graph (if mathematical), simulation (if dynamic/physical), render3d (if precise 3D anatomy/structure/geometry), visual (if free-form)
- **quiz** → flashcard (always), optionally lookup (if doc-grounded)
- **simplify** → visual or diagram (simpler version), optionally flashcard
- **deep_dive** → notation + diagram + graph + simulation (pick what's most relevant to the sub-topic)
- **summarize** → diagram (concept map) or notation (key formulas)
- **advance** → nothing, or a single diagram summarizing the completed module

## TRIGGER RULES

1. Student says "show me" / "draw" / "diagram" / "visualize" / "can I see" → "visualize"
2. Student mentions physics/motion/waves/orbits/molecules → consider "simulation" in suggestedArtifacts
3. Student asks about formulas / equations / math → include "notation" in suggestedArtifacts
4. Student says "quiz me" / "test me" / "flashcards" → "quiz"
5. Student says "next" / "move on" / "I get it" / "got it" → "advance"
6. Student says "why" / "how exactly" / "go deeper" → "deep_dive"
7. Confusion signals > 2 → "simplify"
8. After 3+ explanation exchanges without confusion → "quiz"
9. After completing a module → "summarize"

Output ONLY valid JSON:
{
  "action": "explain|visualize|quiz|simplify|advance|summarize|deep_dive",
  "reasoning": "one sentence — why this action given the student's message and session state",
  "suggestedPrompt": "specific instruction for the tutor (what to say/show/produce)",
  "suggestedArtifacts": ["diagram", "notation"],
  "conceptsToTrack": ["concept names mentioned in this turn"],
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
    ? `STUDY PLAN: ${studyPlan.totalModules} modules\nCurrent: Module ${sessionContext.currentModuleIndex + 1} — "${studyPlan.modules[sessionContext.currentModuleIndex]?.title ?? "?"}" (${studyPlan.modules[sessionContext.currentModuleIndex]?.description ?? ""})\nKey terms: ${studyPlan.modules[sessionContext.currentModuleIndex]?.keyTerms.join(", ") ?? "none"}\nNext up: "${studyPlan.modules[sessionContext.currentModuleIndex + 1]?.title ?? "End of plan"}"`
    : "No study plan — free exploration mode.";

  const historyStr = recentHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const prompt = `${ctxPrompt}

${planInfo}

RECENT CONVERSATION:
${historyStr}

STUDENT'S LATEST MESSAGE: "${userMessage}"

Session stats: ${stats.questionsAsked} questions asked, ${stats.mastered} concepts mastered, ${stats.needsWork.length} need more work, ${stats.elapsedMinutes} min elapsed

Decide the best action and which artifacts to produce.`;

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: STRATEGY_SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 600,
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      action: parsed.action || "explain",
      reasoning: parsed.reasoning || "",
      suggestedPrompt: parsed.suggestedPrompt || "",
      suggestedArtifacts: Array.isArray(parsed.suggestedArtifacts) ? parsed.suggestedArtifacts : [],
      conceptsToTrack: Array.isArray(parsed.conceptsToTrack) ? parsed.conceptsToTrack : [],
      shouldAdvanceModule: parsed.shouldAdvanceModule || false,
    };
  } catch {
    return {
      action: "explain",
      reasoning: "Fallback — couldn't parse strategy decision",
      suggestedPrompt: "",
      suggestedArtifacts: [],
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
