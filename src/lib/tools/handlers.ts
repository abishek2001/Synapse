import type {
  CanvasArtifact,
  VisualArtifact,
  GraphArtifact,
  NotationArtifact,
  FlashcardArtifact,
  LookupArtifact,
  DiagramArtifact,
  DiagramNode,
  DiagramEdge,
  SimulationArtifact,
  Render3DArtifact,
} from "./types";
import { chatCompletion } from "@/lib/logging/openai";
import { semanticSearch } from "@/lib/grounding/retrieval";
import { SIMULATION_SYSTEM_PROMPT, buildSimulationPrompt } from "@/lib/simulation/prompt";
import { sanitizeSimulationCode } from "@/lib/simulation/sanitize";
import { RENDER3D_SYSTEM_PROMPT, buildRender3DPrompt } from "@/lib/render3d/prompt";
import { sanitizeRender3DCode } from "@/lib/render3d/sanitize";
import { rawClient as openai } from "@/lib/logging/openai";
import { resolveSketchfabModel, buildEmbedUrl } from "@/lib/sketchfab";

export interface DelegatedAnnotation {
  type: "text" | "sticky" | "arrow_label";
  content: string;
  color?: string;
  position?: { x: number; y: number };
}

export interface ToolCallResult {
  artifact?: CanvasArtifact;
  annotations?: DelegatedAnnotation[];
  result: string;
}

export interface ToolCallOpts {
  signal?: AbortSignal;
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  documentContext?: string,
  opts: ToolCallOpts = {},
): Promise<ToolCallResult> {
  switch (name) {
    case "canvas_generate_visual":
      return handleGenerateVisual(args, opts);
    case "canvas_generate_graph":
      return handleGenerateGraph(args);
    case "canvas_generate_notation":
      return handleGenerateNotation(args);
    case "flashcard_create":
      return handleFlashcardCreate(args);
    case "knowledge_lookup":
      return handleKnowledgeLookup(args, documentContext);
    case "canvas_delegate_task":
      return handleDelegateTask(args);
    case "canvas_generate_diagram":
      return handleGenerateDiagram(args);
    case "canvas_generate_simulation":
      return handleGenerateSimulation(args, opts);
    case "canvas_generate_3d_render":
      return handleGenerate3DRender(args, opts);
    default:
      return { result: `Unknown tool: ${name}` };
  }
}

async function handleGenerateVisual(
  args: Record<string, unknown>,
  opts: ToolCallOpts = {},
): Promise<{ artifact: VisualArtifact; result: string }> {
  const { title, description, style } = args as {
    title: string;
    description: string;
    style: VisualArtifact["style"];
  };

  const svgPrompt = `Generate a handwritten-style SVG diagram for: "${description}"
Style: ${style}
Requirements:
- Output ONLY valid SVG markup, nothing else
- Use viewBox="0 0 500 380"
- Light/white background style (the canvas is white/light gray)
- Use a handwritten aesthetic: font-family="Caveat, Segoe Print, Comic Sans MS, cursive"
- Colors: #1a1a2e for text, #7c3aed for primary/purple, #0ea5e9 for blue, #10b981 for green, #f97316 for orange, #ef4444 for red
- Use slightly irregular shapes — rounded rectangles with rx=12, organic-looking arrows
- Labels should feel like handwritten notes (font-size 16-18px, the handwriting font)
- Include hand-drawn style arrows (slightly curved paths, not perfectly straight)
- Add small annotations or notes in lighter gray (#94a3b8) as if scribbled
- Keep it warm, inviting, and educational — like a whiteboard sketch
- NO external references, NO images, NO scripts`;

  const res = await chatCompletion(
    "tool.visual",
    {
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      messages: [
        { role: "system", content: "You are an SVG diagram generator that creates beautiful handwritten-style educational diagrams. They should look like they were drawn on a whiteboard or notebook — warm, organic, with a cursive/handwriting font. Output ONLY raw SVG markup. No markdown, no explanation, no code fences." },
        { role: "user", content: svgPrompt },
      ],
      temperature: 0.5,
      max_tokens: 2048,
    },
    { signal: opts.signal },
  );

  let svg = res.choices[0]?.message?.content ?? "";
  svg = svg.replace(/```(?:svg|xml)?\n?/g, "").replace(/```$/g, "").trim();

  const artifact: VisualArtifact = {
    id: crypto.randomUUID(),
    type: "visual",
    title,
    status: "pending",
    description,
    style,
    svgContent: svg,
  };

  return {
    artifact,
    result: `[Visual "${title}" generated and placed on canvas]`,
  };
}

function handleGenerateGraph(
  args: Record<string, unknown>,
): { artifact: GraphArtifact; result: string } {
  const { title, graph_type, series, variables, x_range, y_range, x_label, y_label } = args as {
    title: string;
    graph_type: GraphArtifact["graph_type"];
    series: GraphArtifact["series"];
    variables?: GraphArtifact["variables"];
    x_range: [number, number];
    y_range?: [number, number];
    x_label?: string;
    y_label?: string;
  };

  const artifact: GraphArtifact = {
    id: crypto.randomUUID(),
    type: "graph",
    title,
    status: "pending",
    graph_type,
    series,
    variables,
    x_range,
    y_range,
    x_label,
    y_label,
  };

  return {
    artifact,
    result: `[Graph "${title}" generated and placed on canvas — ${series.length} series plotted]`,
  };
}

function handleGenerateNotation(
  args: Record<string, unknown>,
): { artifact: NotationArtifact; result: string } {
  const { title, latex, annotation } = args as {
    title: string;
    latex: string;
    annotation?: string;
  };

  const artifact: NotationArtifact = {
    id: crypto.randomUUID(),
    type: "notation",
    title,
    status: "pending",
    latex,
    annotation,
  };

  return {
    artifact,
    result: `[Notation "${title}" rendered on canvas]`,
  };
}

function handleFlashcardCreate(
  args: Record<string, unknown>,
): { artifact: FlashcardArtifact; result: string } {
  const { cards } = args as { cards: { front: string; back: string }[] };

  const artifact: FlashcardArtifact = {
    id: crypto.randomUUID(),
    type: "flashcard",
    title: `${cards.length} Flashcard${cards.length > 1 ? "s" : ""}`,
    status: "pending",
    cards,
  };

  return {
    artifact,
    result: `[${cards.length} flashcard(s) created on canvas]`,
  };
}

async function handleKnowledgeLookup(
  args: Record<string, unknown>,
  documentContext?: string,
): Promise<{ artifact: LookupArtifact; result: string }> {
  const { search_query, max_results = 3 } = args as {
    search_query: string;
    max_results?: number;
  };

  if (!documentContext) {
    return {
      artifact: {
        id: crypto.randomUUID(),
        type: "lookup",
        title: `Lookup: "${search_query}"`,
        status: "pending",
        query: search_query,
        results: [],
      },
      result: "[No documents uploaded — nothing to search]",
    };
  }

  const results = await semanticSearch(search_query, max_results as number);

  const artifact: LookupArtifact = {
    id: crypto.randomUUID(),
    type: "lookup",
    title: `Lookup: "${search_query}"`,
    status: "pending",
    query: search_query,
    results: results.map((r) => ({ text: r.text, source: r.source })),
  };

  const excerptSummary = results.length > 0
    ? results.map((r, i) => `[${i + 1}] (score: ${r.score.toFixed(2)}) From ${r.source}: "${r.text.slice(0, 120)}..."`).join("\n")
    : "No relevant excerpts found.";

  return {
    artifact,
    result: `[Semantic search for "${search_query}" — ${results.length} result(s)]:\n${excerptSummary}`,
  };
}

function handleDelegateTask(
  args: Record<string, unknown>,
): ToolCallResult {
  const { task, annotations = [] } = args as {
    task: string;
    annotations: DelegatedAnnotation[];
  };

  const processed = annotations.map((ann, i) => ({
    ...ann,
    position: ann.position ?? {
      x: 80 + (i % 3) * 220,
      y: 400 + Math.floor(i / 3) * 150,
    },
    color: ann.color ?? (ann.type === "sticky" ? "#fef08a" : "#1a1a2e"),
  }));

  return {
    annotations: processed,
    result: `[Canvas task delegated: "${task}" — ${processed.length} annotation(s) placed]`,
  };
}

function handleGenerateDiagram(
  args: Record<string, unknown>,
): { artifact: DiagramArtifact; result: string } {
  const { title, nodes, edges, direction } = args as {
    title: string;
    nodes: DiagramNode[];
    edges: DiagramEdge[];
    direction?: "LR" | "TB";
  };

  const artifact: DiagramArtifact = {
    id: crypto.randomUUID(),
    type: "diagram",
    title,
    status: "pending",
    nodes,
    edges,
    direction,
  };

  return {
    artifact,
    result: `[Diagram "${title}" generated — ${nodes.length} nodes, ${edges.length} edges]`,
  };
}

async function handleGenerateSimulation(
  args: Record<string, unknown>,
  opts: ToolCallOpts = {},
): Promise<{ artifact: SimulationArtifact; result: string }> {
  const { topic, context: ctx } = args as { topic: string; context?: string };

  // Default to gpt-5.4 (Responses API) — same reasoning as render3d. Small models
  // produce a tiny dot tracking position on a black square no matter the prompt.
  const model = process.env.OPENAI_SIMULATION_MODEL ?? "gpt-5.4";
  const isGpt5Family = /^gpt-5/i.test(model);
  const userPrompt = buildSimulationPrompt(topic, ctx);

  let raw = "";
  if (isGpt5Family) {
    // Code generation is heavier than a normal chat turn. The shared rawClient
    // ships with a 60s timeout — fine for chat, but reasoning + a multi-hundred
    // line Three.js scene routinely exceeds it. Override the timeout per-call
    // (the OpenAI SDK accepts `timeout` in the request options) so a slow
    // simulation gen doesn't get killed mid-stream and substituted with an
    // error toast. We keep a hard ceiling well under the user's patience.
    const res = await openai.responses.create({
      model,
      instructions: SIMULATION_SYSTEM_PROMPT,
      input: userPrompt,
      reasoning: { effort: "low" },
      text: { verbosity: "high" },
      // gpt-5-mini and similarly sized models: 6k tokens is plenty for a
      // ~200-line scene (the gold-standard examples are ~80 lines each), and
      // a smaller cap helps the model finish in time. Larger / frontier
      // models can still hit this ceiling without truncation in practice.
      max_output_tokens: 6000,
    }, { signal: opts.signal, timeout: 180_000 });
    raw = res.output_text ?? "";
  } else {
    const res = await chatCompletion(
      "tool.simulation",
      {
        model,
        messages: [
          { role: "system", content: SIMULATION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 6000,
      },
      { signal: opts.signal },
    );
    raw = res.choices[0]?.message?.content ?? "";
  }

  const { code } = sanitizeSimulationCode(raw);

  const artifact: SimulationArtifact = {
    id: crypto.randomUUID(),
    type: "simulation",
    title: topic,
    status: "pending",
    topic,
    code,
  };

  return {
    artifact,
    result: `[Simulation "${topic}" generated (model: ${model}${isGpt5Family ? ", responses API + reasoning" : ""})]`,
  };
}

async function handleGenerate3DRender(
  args: Record<string, unknown>,
  opts: ToolCallOpts = {},
): Promise<{ artifact: Render3DArtifact; result: string }> {
  const {
    title,
    topic,
    sketchfab_query,
    concept_brief,
    style_hints,
    camera_distance,
    bg_color,
  } = args as {
    title: string;
    topic: string;
    sketchfab_query?: string;
    concept_brief?: string;
    style_hints?: string;
    camera_distance?: number;
    bg_color?: string;
  };

  // ── TIER 1: Sketchfab ── resolve server-side so we never embed a hallucinated UID.
  const query = sketchfab_query?.trim();
  if (query) {
    const hit = await resolveSketchfabModel({ query });
    if (hit) {
      const artifact: Render3DArtifact = {
        id: crypto.randomUUID(),
        type: "render3d",
        title,
        status: "pending",
        topic,
        code: "",
        embed_url: buildEmbedUrl(hit.embedUrl),
      };
      return {
        artifact,
        result: `[3D render "${title}" placed — Sketchfab match: "${hit.name}" (uid ${hit.uid}, ${hit.likeCount} likes)]`,
      };
    }
  }

  // ── TIER 2: Dedicated server-side scene generator ──
  // The tutor used to dash off Three.js as an inline tool argument; results were flat
  // and ugly (a green parabola on a black square). Now we mirror handleGenerateSimulation:
  // a fat focused system prompt, high token budget, low temp, optional stronger model
  // via OPENAI_RENDER3D_MODEL.
  if (!concept_brief) {
    throw new Error(
      "canvas_generate_3d_render: `concept_brief` is required when no Sketchfab match is available. Re-issue the tool call with a 1-3 sentence brief describing what to render and any key parts/motion.",
    );
  }

  // Default to gpt-5.4 — per OpenAI's "Using GPT-5.4" guide it is the recommended
  // default for code-heavy work and brings GPT-5.3-Codex's coding capability to the
  // mainline frontier model. Override with OPENAI_RENDER3D_MODEL.
  const model = process.env.OPENAI_RENDER3D_MODEL ?? "gpt-5.4";
  const isGpt5Family = /^gpt-5/i.test(model);

  const userPrompt = buildRender3DPrompt({
    topic,
    concept_brief,
    style_hints,
    camera_distance,
    bg_color,
  });

  // GPT-5 family lives on the Responses API and uses reasoning + verbosity instead
  // of temperature. Older models still go through chat.completions with temperature.
  let raw = "";
  if (isGpt5Family) {
    // See handleGenerateSimulation for why we override timeout per-call: the
    // shared rawClient is capped at 60s, which is too tight for reasoning +
    // a multi-hundred line Three.js scene. Forwarding the abort signal keeps
    // the user's Stop button responsive.
    const res = await openai.responses.create({
      model,
      instructions: RENDER3D_SYSTEM_PROMPT,
      input: userPrompt,
      // Low effort keeps latency reasonable while still giving the model time to
      // structure a multi-element scene. Bump to "medium" if quality regresses.
      reasoning: { effort: "low" },
      // High verbosity → richer, more detailed code (matches the gold-standard
      // density). For code generation this is the recommended setting.
      text: { verbosity: "high" },
      // 6k matches simulation handler — enough for the gold-standard density
      // (gold examples are ~80 lines each), and small enough that gpt-5-mini
      // can finish well inside our 180s timeout.
      max_output_tokens: 6000,
    }, { signal: opts.signal, timeout: 180_000 });
    raw = res.output_text ?? "";
  } else {
    const res = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: RENDER3D_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    }, { signal: opts.signal });
    raw = res.choices[0]?.message?.content ?? "";
  }

  const { code } = sanitizeRender3DCode(raw);

  if (!code) {
    throw new Error(
      "canvas_generate_3d_render: scene generator returned empty output. Retry the tool call with a more specific concept_brief.",
    );
  }

  const artifact: Render3DArtifact = {
    id: crypto.randomUUID(),
    type: "render3d",
    title,
    status: "pending",
    topic,
    code,
    camera_distance,
    bg_color,
  };

  return {
    artifact,
    result: `[3D render "${title}" placed — generated scene (model: ${model}${isGpt5Family ? ", responses API + reasoning" : ""})]`,
  };
}
