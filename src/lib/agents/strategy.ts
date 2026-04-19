import { chatCompletion, pickModel } from "@/lib/logging/openai";
import type { StudyPlan } from "@/lib/grounding/study-plan";
import type { SessionContext } from "@/lib/grounding/session-context";
import { serializeForPrompt, getSessionStats } from "@/lib/grounding/session-context";
import type { FocusCandidate } from "./types";

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
  /** Group id (from focus.candidates) the new module should anchor to, or null. */
  anchorGroupId: string | null;
  /** True when the new module is a tangent off the anchor (vs. extending main). */
  isTangent: boolean;
}

const STRATEGY_SYSTEM = `You are the Teaching Strategy agent for Synapse, an AI-powered learning platform with an infinite canvas. Your job is to decide the best pedagogical action AND the most effective artifacts to place on the canvas for each student turn.

## AVAILABLE CANVAS ARTIFACTS

The tutor can place any combination of these artifacts on the canvas:

| Artifact | Tool name | Best fit (think: "this representation makes the concept *click*") |
|----------|-----------|----------------|
| **simulation** | canvas_generate_simulation | The concept is a **process unfolding over time** that the student must SEE move to understand: projectile flight, pendulum swing, wave propagation, orbital mechanics, charge in an electric field, fluid flow, diffusion, planetary motion, double-slit interference. A static picture would lose the essence. |
| **render3d** | canvas_generate_3d_render | The concept is a **real 3D object whose spatial form matters**: anatomy (heart chambers, lung lobes, brain regions), cells/organelles, molecules with non-trivial geometry, crystal lattices, planets, mechanical assemblies, 3D math surfaces. The student needs to rotate it to grasp the structure. Server tries Sketchfab (sketchfab_query) first, then a dedicated server-side scene generator (concept_brief) — the tutor never writes Three.js code. |
| **graph** | canvas_generate_graph | Mathematical functions, data plots, trends, distributions, parametric curves with sliders. The concept is best understood by seeing how y depends on x. |
| **notation** | canvas_generate_notation | The concept is a **symbolic relationship** — laws, derivations, proofs, formulas. Use when the equation IS the insight (E=mc², F=ma, range = v²sin(2θ)/g). |
| **diagram** | canvas_generate_diagram | The concept is a **2D static process or relationship between discrete entities**: architectures, pipelines, request flows, state machines, decision trees, taxonomy, before/after, cause/effect. Each node is interactive. The concept must actually decompose into nodes-and-edges — NOT just three vocabulary words with arrows between them. |
| **visual** | canvas_generate_visual | Free-form SVG sketches when no structured artifact fits — annotated waveforms, comparison tables, timelines, illustrative metaphors. Use sparingly; prefer diagram if the content has nodes. |
| **flashcard** | flashcard_create | Active recall after a concept has been taught. The concept can be tested with a short question/answer pair. |
| **lookup** | knowledge_lookup | Pulling precise quotes from uploaded documents. Only when documents exist AND precision matters. |

## DECISION ACTIONS

- **"explain"** — Introduce or explain a concept in conversation + the single best supporting artifact
- **"visualize"** — Student asked to see something; lead with the artifact that makes the concept click
- **"quiz"** — Test understanding with flashcards after sufficient explanation
- **"simplify"** — Student is confused; use simpler language + analogy-based artifacts
- **"deep_dive"** — Student wants more depth; combine 2-4 complementary artifacts (e.g. simulation + notation + flashcard)
- **"summarize"** — Wrap up a module with a concept-map diagram or key-formulas notation
- **"advance"** — Student is ready for the next module

## ARTIFACT SELECTION — PICK BY CONCEPT FIT, NOT BY TOPIC SHORTCUT

\`suggestedArtifacts\` is an **ordered priority list**, best first. The tutor will produce the top one and only add lower-priority ones if they teach something the top one misses. Do NOT just list every artifact — pick what the concept actually needs.

For each concept, ask these questions in order and let the answers drive the ranking:

1. **Does it move?** Is the essence a process unfolding in time/space (motion, propagation, transformation)? → **simulation** is primary. This applies broadly: physics motion, chemistry reactions/diffusion, biology processes (blood flow, neuron firing, cell division, peristalsis), engineering mechanisms in action, algorithms stepping through state, economic/population dynamics. If the student needs to SEE it change to get it, simulation is primary.
2. **Is its 3D shape part of the answer?** Would rotating, slicing, or seeing it from multiple angles teach something a 2D picture cannot? → **render3d** is primary. This is true whenever the topic IS a real-world 3D object or spatial structure, **regardless of how the module is framed** ("overview", "functions", "introduction", "anatomy of…", "structure of…" all qualify). Default-yes categories:
   - **Any human / animal organ or organ system** (respiratory, cardiovascular, digestive, nervous, endocrine, reproductive, musculoskeletal, urinary, lymphatic, sensory) — at every zoom level (whole system, single organ, tissue, cell).
   - **Cells and organelles**, microorganisms, viruses.
   - **Molecules** with non-trivial geometry (proteins, DNA, complex organics), **crystal lattices**, **chemical structures**.
   - **Astronomical bodies** and systems (planets, moons, solar system layout, galaxies).
   - **Geology / earth science** structures (tectonic plates, volcanoes, rock layers, cave systems).
   - **Mechanical assemblies, engines, gears, robotic arms, architectural structures, buildings, vehicles**.
   - **3D math surfaces** (paraboloids, manifolds, vector fields in 3D).
   - **Archaeological / historical artifacts** where shape matters (pyramids, statues, fossils).
   For these categories, render3d should be primary even if the module is framed around "function" or "overview" — pair it with diagram for any flow/process the function involves.
3. **Is the insight an equation?** Does understanding hinge on a symbolic relationship (force law, conservation, derivation)? → **notation** is primary or strong complement.
4. **Is it a function or distribution?** Does it have a curve worth plotting (any f(x), data trends, distributions)? → **graph** is primary or strong complement.
5. **Is it a system of discrete parts with named relationships?** Architecture, request flow, state machine, taxonomy? → **diagram** is primary. *Only* if the parts are genuinely discrete and the edges carry real meaning — not just vocabulary words connected by arrows. **Important:** if the parts are physical 3D objects (organs, planets, machine components), render3d should usually lead and diagram should complement — don't let "discrete parts" alone push diagram above render3d for spatial topics.
6. **Has the concept already been taught and you want recall?** → **flashcard**.

A concept can score on multiple questions — that's fine, output them in priority order. Examples:
- Projectile motion → \`["simulation", "notation"]\` (motion + range equation).
- Respiratory system overview → \`["render3d", "diagram"]\` (3D lungs/airways + air-path flow).
- Male reproductive system overview → \`["render3d", "diagram"]\` (3D anatomy + organ-function flow).
- Heart and circulation → \`["render3d", "simulation", "diagram"]\` (3D heart + blood flow animation + circuit diagram).
- Solar system → \`["render3d", "simulation"]\` (3D layout + orbital motion).
- DNA structure → \`["render3d", "notation"]\` (double helix + base-pairing rules).
- Internal combustion engine → \`["render3d", "simulation"]\` (3D engine + 4-stroke cycle in motion).

## ANTI-PATTERNS (what NOT to do)

These are the bad picks the previous heuristics produced. Avoid them:

- ❌ **"Projectile motion"** → diagram with boxes \`Projectile → Trajectory → Parabola\`. That's a glossary, not physics. ✅ Do: \`["simulation", "notation"]\` — animated arc under gravity + range/height equations.
- ❌ **"Pendulum"** → diagram of \`Bob → String → Pivot\`. ✅ Do: \`["simulation", "notation"]\` — swinging pendulum + θ(t) = θ₀cos(ωt).
- ❌ **"Wave interference"** → diagram of \`Source 1 + Source 2 → Pattern\`. ✅ Do: \`["simulation"]\` — animated overlapping wavefronts.
- ❌ **"Orbital mechanics"** → diagram of \`Planet → Orbit → Sun\`. ✅ Do: \`["simulation", "notation"]\` — animated ellipse + Kepler's law.
- ❌ **Any anatomy / organ-system "overview" or "functions" module** (respiratory, reproductive, digestive, cardiovascular, nervous, urinary, endocrine, musculoskeletal, etc.) → diagram of \`Part A → Part B → Part C\` only. ✅ Do: \`["render3d", "diagram"]\` — 3D anatomical model + a flow diagram for the process. Words like "overview", "introduction", "functions of…" do NOT downgrade render3d for spatial topics.
- ❌ **Cell biology** (mitochondria, neuron, animal cell) → diagram with labeled boxes only. ✅ Do: \`["render3d", "diagram"]\` — rotatable 3D cell/organelle + labeled diagram for parts.
- ❌ **Solar system / planet structure / galaxy** → diagram of \`Sun → Mercury → Venus → …\`. ✅ Do: \`["render3d", "simulation"]\` — 3D scale layout + orbital animation.
- ❌ **Molecular structure** (DNA, water, methane, proteins) → diagram of \`Atom → Bond → Molecule\`. ✅ Do: \`["render3d", "notation"]\` — 3D molecule + bonding/structural notation.
- ❌ **Mechanical systems** (engines, gears, robotic arms, bridges) static "parts list" diagram. ✅ Do: \`["render3d", "simulation"]\` — 3D assembly + animated operation cycle.
- ❌ **Geological structures** (volcano, tectonic plates, cave) flat cross-section diagram only. ✅ Do: \`["render3d", "diagram"]\` — 3D structure + process/flow diagram.
- ❌ **"Newton's first law"** → render3d of a ball. The insight is the *principle*, not the object. ✅ Do: \`["notation", "simulation"]\` — F=ma + a brief inertia simulation.
- ❌ **"Photosynthesis"** as a chemical equation → render3d of a leaf. The insight is the reaction. ✅ Do: \`["notation", "diagram"]\` — balanced equation + light/dark reactions diagram.
- ❌ Listing every artifact \`["diagram","render3d","simulation","notation","graph"]\` because it's "comprehensive". ✅ Do: rank ruthlessly. 1-2 artifacts that nail the concept beats 5 mediocre ones.

## DOMAIN-AGNOSTIC RULE OF THUMB FOR render3d

Before defaulting to diagram, ask: **"Is the thing I'm explaining a real, tangible 3D structure that exists in space?"** If yes — across ANY domain (biology, chemistry, astronomy, geology, engineering, mechanical, architecture, archaeology, math surfaces) — render3d should lead and diagram/notation/simulation complement. Diagrams are for **abstract relationships and processes**, not for substituting when the topic is inherently spatial. The framing of the module ("overview", "introduction", "functions", "anatomy", "structure") is irrelevant to this judgement — only the nature of the underlying concept matters.

## TRIGGER RULES (action selection — separate from artifact selection)

1. Student says "show me" / "draw" / "diagram" / "visualize" / "can I see" → action = "visualize"
2. Student says "quiz me" / "test me" / "flashcards" → action = "quiz"
3. Student says "next" / "move on" / "continue" / "carry on" / "let's continue" / "I get it" / "got it" / "understood" / "makes sense" / "okay" / "sounds good" / "ready for the next" → action = "advance". Brief acknowledgements followed by ANY forward word ("understood, next", "okay continue", "makes sense, what's next") are also "advance".
4. Student says "why" / "how exactly" / "go deeper" / "explain in depth" → action = "deep_dive"
5. Confusion signals > 2 → action = "simplify"
6. After 3+ explanation exchanges without confusion → action = "quiz"
7. After completing a module → action = "summarize"
8. Otherwise → action = "explain"

Artifact selection is independent of action — apply the 6-question rubric above to whatever the concept is, regardless of action. The ONLY exceptions: "quiz" forces flashcard primary; "advance" usually has empty suggestedArtifacts.

## ANCHOR / TANGENT RULES (MODULE PLACEMENT)

The student's canvas is a graph of modules connected by arrows. When a list of FOCUS CANDIDATES is supplied, the student is probably asking about one of those existing modules, not extending the linear study plan. You must decide where the new module attaches:

- "anchorGroupId" = id of the candidate module this turn is "about", or null when the question is the next step in the linear study plan.
- "isTangent" = true when the new module DEEPENS / ELABORATES one of the candidate modules (deep_dive on an existing concept). false when it's the natural NEXT step in the study plan.

Heuristics:
- If the student "marked" or selected a specific module (isExplicitFocus / isFromSelection in candidates) AND their question is a follow-up about it → isTangent: true, anchorGroupId: that candidate.
- If the question is just forward progression — "next", "continue", "what's next", "got it", "understood", "okay continue", "makes sense", "ready for the next", or any short acknowledgement that ends with a forward verb — → isTangent: false, anchorGroupId: null. The new module becomes the new main thread, NOT a side branch off the previous one.
- If you're unsure, prefer isTangent: true with the explicit/selected candidate, since attaching the answer near what the student was looking at is rarely wrong.
- When there are zero candidates, set both to null/false.

HARD CONSTRAINT — anchor/tangent must be consistent with action:
- action === "advance" → isTangent MUST be false AND anchorGroupId MUST be null. The student is moving forward; do NOT branch off any candidate.
- action === "deep_dive" + an explicit/selected candidate → isTangent MUST be true with that candidate as anchorGroupId.

Output ONLY valid JSON:
{
  "action": "explain|visualize|quiz|simplify|advance|summarize|deep_dive",
  "reasoning": "one sentence — why this action given the student's message and session state",
  "suggestedPrompt": "specific instruction for the tutor (what to say/show/produce)",
  "suggestedArtifacts": ["diagram", "notation"],
  "conceptsToTrack": ["concept names mentioned in this turn"],
  "shouldAdvanceModule": false,
  "followUpQuestions": ["2-3 short content questions the STUDENT would ask next", "phrased from the student's POV"],
  "pauseForInput": false,
  "anchorGroupId": "grp-xxx or null",
  "isTangent": false
}

## followUpQuestions rules — CRITICAL, READ CAREFULLY

These are chips the student taps to send as their NEXT message. They must be questions the student would actually ask to learn more — NOT questions the tutor asks the student, and NOT meta-questions about the UI.

Hard rules:
1. Phrase from the STUDENT's point of view ("How does X work?", "Why is Y...?", "What happens when Z?", "Show me ..."). Never "Does this help?" / "Want to explore...?" / "Do you understand?" — those are tutor-checks, not learner curiosity.
2. Each question MUST name a specific concept, term, or entity that just appeared in the explanation (e.g. "alveoli", "cerebellum", "gas exchange", "myelin sheath"). No generic "this", "this topic", "more about it".
3. Drive depth or breadth: "How does …?", "Why …?", "What happens if …?", "Show me a …", "Compare … vs …", "What's the role of …?". Mix mechanism, cause, comparison, and visualization across the 2-3 chips.
4. NEVER ask yes/no questions. NEVER ask the student about their preferences, comfort, or comprehension.
5. ≤ 9 words each. No trailing platitudes. End with "?".
6. Always provide exactly 2 (preferred) or 3 questions.

GOOD examples (alveoli/respiration just explained):
- "How does oxygen cross the alveolar wall?"
- "Why are alveoli shaped like tiny sacs?"
- "Show me gas exchange in slow motion"

GOOD examples (brain anatomy just explained):
- "What does the cerebellum control?"
- "How do the brainstem and cerebrum connect?"
- "Show me where memories are stored"

BAD examples — DO NOT generate anything like these:
- "Does this diagram help clarify things?"   ← meta-UX, yes/no
- "Want to explore alveoli function more?"   ← yes/no, tutor framing
- "Do you have questions about brain anatomy?" ← tutor-check, not a learner's question
- "Want to learn more?" / "Ready to continue?" ← generic, not content
- "Is this making sense?"                    ← comprehension check

If you cannot produce 2 specific content questions tied to concepts in this turn, return an empty array rather than generic filler.

## pauseForInput
- Set to true ONLY when the tutor explanation ends with a direct question TO the student that requires their answer before continuing (e.g. after a quiz action).`;

export async function getTeachingDecision(
  userMessage: string,
  sessionContext: SessionContext,
  studyPlan: StudyPlan | null,
  recentHistory: { role: string; content: string }[],
  signal?: AbortSignal,
  focusCandidates: FocusCandidate[] = [],
): Promise<TeachingDecision> {
  // Fast path: zero candidates → linear placement, no LLM disambiguation needed.
  // Single explicit candidate → bias toward tangent on that module without needing
  // the model to repeat the id back to us; we still let it decide isTangent.
  const fastAnchor: string | null =
    focusCandidates.length === 1 ? focusCandidates[0].groupId : null;
  const ctxPrompt = serializeForPrompt(sessionContext);
  const stats = getSessionStats(sessionContext);

  const planInfo = studyPlan
    ? `STUDY PLAN: ${studyPlan.totalModules} modules\nCurrent: Module ${sessionContext.currentModuleIndex + 1} — "${studyPlan.modules[sessionContext.currentModuleIndex]?.title ?? "?"}" (${studyPlan.modules[sessionContext.currentModuleIndex]?.description ?? ""})\nKey terms: ${studyPlan.modules[sessionContext.currentModuleIndex]?.keyTerms.join(", ") ?? "none"}\nNext up: "${studyPlan.modules[sessionContext.currentModuleIndex + 1]?.title ?? "End of plan"}"`
    : "No study plan — free exploration mode.";

  const historyStr = recentHistory
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const candidatesStr = focusCandidates.length > 0
    ? `\nFOCUS CANDIDATES (existing modules the student may be asking about, in priority order):\n${focusCandidates
        .map((c, i) => {
          const tags: string[] = [];
          if (c.isExplicitFocus) tags.push("explicit-focus");
          if (c.isFromSelection) tags.push("from-selection");
          if (c.isCurrentMain) tags.push("current-main");
          return `  ${i + 1}. id="${c.groupId}" title="${c.title}"${tags.length ? ` [${tags.join(",")}]` : ""}`;
        })
        .join("\n")}`
    : "\nFOCUS CANDIDATES: (none — treat this turn as the next step in the linear study plan)";

  const prompt = `${ctxPrompt}

${planInfo}

RECENT CONVERSATION:
${historyStr}

STUDENT'S LATEST MESSAGE: "${userMessage}"
${candidatesStr}

Session stats: ${stats.questionsAsked} questions asked, ${stats.mastered} concepts mastered, ${stats.needsWork.length} need more work, ${stats.elapsedMinutes} min elapsed

Decide the best action, which artifacts to produce, AND whether this turn is a tangent off one of the focus candidates (set anchorGroupId + isTangent accordingly).`;

  try {
    const res = await chatCompletion(
      "strategy.decide",
      {
        model: pickModel("medium"),
        messages: [
          { role: "system", content: STRATEGY_SYSTEM },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 600,
      },
      { signal },
    );

    const raw = res.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```(?:json)?\n?/g, "").replace(/```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // ── Anchor resolution ────────────────────────────────────────────────────
    //
    // Order of authority (strongest first):
    //   1. EXPLICIT USER SIGNAL — the user marked a module via "Ask about this"
    //      (isExplicitFocus) or selected an element inside one (isFromSelection).
    //      This is an unambiguous click; the LLM does NOT get to override it.
    //      gpt-4.1-mini was observed reasoning semantically (e.g. "the question
    //      mentions P(B|A) which is conditional probability") and ignoring the
    //      [from-selection] tag — that's the bug this guard fixes.
    //   2. LLM DECISION — used only when no explicit signal exists. We still
    //      validate the id against the candidate set so the model can never
    //      invent an id.
    //   3. SINGLE-CANDIDATE FAST PATH — when only one candidate was supplied
    //      and the model said tangent, trust the lone candidate.
    const candidateIds = new Set(focusCandidates.map((c) => c.groupId));
    const explicitCandidate = focusCandidates.find(
      (c) => c.isExplicitFocus || c.isFromSelection,
    );

    let anchorGroupId: string | null = null;
    let isTangent = false;

    if (explicitCandidate) {
      anchorGroupId = explicitCandidate.groupId;
      // Selecting/marking a module is itself the signal "branch off this one".
      isTangent = true;
      const llmAnchor = typeof parsed.anchorGroupId === "string" ? parsed.anchorGroupId : null;
      if (llmAnchor && llmAnchor !== anchorGroupId) {
        console.warn(
          `[strategy] explicit user signal (${explicitCandidate.isFromSelection ? "from-selection" : "explicit-focus"}) ` +
            `overriding LLM anchor ${llmAnchor} → ${anchorGroupId} ("${explicitCandidate.title}")`,
        );
      }
    } else {
      const rawAnchor = parsed.anchorGroupId;
      if (typeof rawAnchor === "string" && candidateIds.has(rawAnchor)) {
        anchorGroupId = rawAnchor;
      } else if (fastAnchor && parsed.isTangent) {
        anchorGroupId = fastAnchor;
      }
      isTangent = !!parsed.isTangent && !!anchorGroupId;
    }

    // Final guard: forward progression ("advance") MUST NOT branch. Even if
    // the LLM (or the explicit-signal override above) tried to anchor this
    // turn to a candidate, "Understood, next" / "got it, continue" should
    // always extend the main thread so the back pill goes away.
    const action = parsed.action || "explain";
    if (action === "advance") {
      if (anchorGroupId || isTangent) {
        console.warn(
          `[strategy] action="advance" forces isTangent=false / anchor=null ` +
            `(was ${isTangent ? "tangent " : ""}${anchorGroupId ?? "null"})`,
        );
      }
      anchorGroupId = null;
      isTangent = false;
    }

    return {
      action,
      reasoning: parsed.reasoning || "",
      suggestedPrompt: parsed.suggestedPrompt || "",
      suggestedArtifacts: Array.isArray(parsed.suggestedArtifacts) ? parsed.suggestedArtifacts : [],
      conceptsToTrack: Array.isArray(parsed.conceptsToTrack) ? parsed.conceptsToTrack : [],
      shouldAdvanceModule: parsed.shouldAdvanceModule || false,
      followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [],
      pauseForInput: parsed.pauseForInput || false,
      anchorGroupId,
      isTangent,
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
      anchorGroupId: null,
      isTangent: false,
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
    const res = await chatCompletion("strategy.summary", {
      model: pickModel("easy"),
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
