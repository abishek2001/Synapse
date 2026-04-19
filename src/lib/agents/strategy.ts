import type { StudyPlan } from "@/lib/grounding/study-plan";
import type { SessionContext } from "@/lib/grounding/session-context";
import { serializeForPrompt, getSessionStats } from "@/lib/grounding/session-context";
import { openai } from "@/lib/openai-client";

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
  followUpQuestions: string[];
  pauseForInput: boolean;
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
| **simulation** | canvas_generate_simulation | Physics, chemistry, biology, or math concepts that benefit from interactive 3D animation of *behaviour* (pendulums, orbits, waves, molecules in motion, electric fields, projectile motion). Use when the concept is dynamic/moving in nature. |
| **render3d** | canvas_generate_3d_render | STRONGLY PREFERRED whenever the topic is a real 3D structure or object: anatomy (heart, lungs, respiratory system, brain, kidneys, skeleton, eye), cells/organelles, molecules, crystal lattices, planets, mechanical assemblies, architecture, 3D geometry. The tutor supplies a sketchfab_query (e.g. "human respiratory system anatomy") and the server resolves it to a real Sketchfab model; if Sketchfab has no match, the tutor falls back to a Three.js scene that loads an open-source GLB/OBJ, or finally to hand-written Three.js. Pick this over diagram whenever the concept is a 3D thing rather than a 2D process. |

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

- **explain** → render3d (if the topic is a 3D anatomical/structural/molecular object), diagram or visual (otherwise), optionally notation (for formulas)
- **visualize** → render3d (FIRST CHOICE for anatomy/organs/cells/molecules/crystals/planets/3D geometry), diagram (entities/relationships), graph (mathematical), simulation (dynamic physics), visual (free-form)
- **quiz** → flashcard (always), optionally lookup (if doc-grounded)
- **simplify** → visual or diagram (simpler version), optionally flashcard
- **deep_dive** → render3d + notation + diagram + simulation (pick what's most relevant — for anatomy/biology topics, render3d is mandatory)
- **summarize** → diagram (concept map) or notation (key formulas), or render3d (for anatomy modules)
- **advance** → nothing, or a single diagram summarizing the completed module

## TRIGGER RULES

1. Student says "show me" / "draw" / "diagram" / "visualize" / "can I see" → "visualize"
2. Topic involves an organ system / anatomy / cell / organelle / molecule / crystal / planet / 3D geometry / mechanical assembly → ALWAYS include "render3d" in suggestedArtifacts (e.g. respiratory system, heart, brain, kidneys, eye, DNA, water molecule, NaCl lattice, solar system). Prefer render3d over diagram for these.
3. Student mentions physics/motion/waves/orbits → consider "simulation" in suggestedArtifacts
4. Student asks about formulas / equations / math → include "notation" in suggestedArtifacts
5. Student says "quiz me" / "test me" / "flashcards" → "quiz"
6. Student says "next" / "move on" / "I get it" / "got it" → "advance"
7. Student says "why" / "how exactly" / "go deeper" → "deep_dive"
8. Confusion signals > 2 → "simplify"
9. After 3+ explanation exchanges without confusion → "quiz"
10. After completing a module → "summarize"

Output ONLY valid JSON:
{
  "action": "explain|visualize|quiz|simplify|advance|summarize|deep_dive",
  "reasoning": "one sentence — why this action given the student's message and session state",
  "suggestedPrompt": "specific instruction for the tutor (what to say/show/produce)",
  "suggestedArtifacts": ["diagram", "notation"],
  "conceptsToTrack": ["concept names mentioned in this turn"],
  "shouldAdvanceModule": false,
  "followUpQuestions": ["2-3 natural follow-up questions the student might want to ask next", "keep them short, curiosity-driven"],
  "pauseForInput": false
}

## followUpQuestions rules
- Always provide 2-3 short follow-up questions (10 words or fewer each) based on what the student is currently learning
- Make them feel like natural next steps — not generic ("tell me more") but specific to the concept
- pauseForInput: set to true ONLY when the tutor explanation ends with a direct question TO the student that requires their answer before continuing (e.g. after a quiz action)`;

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
      followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [],
      pauseForInput: parsed.pauseForInput || false,
    };
  } catch {
    return {
      action: "explain",
      reasoning: "Fallback — couldn't parse strategy decision",
      suggestedPrompt: "",
      suggestedArtifacts: [],
      conceptsToTrack: [],
      shouldAdvanceModule: false,
      followUpQuestions: [],
      pauseForInput: false,
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
