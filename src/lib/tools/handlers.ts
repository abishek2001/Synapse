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
import { semanticSearch } from "@/lib/grounding/retrieval";
import { SIMULATION_SYSTEM_PROMPT, buildSimulationPrompt } from "@/lib/simulation/prompt";
import { sanitizeSimulationCode } from "@/lib/simulation/sanitize";
import { openai } from "@/lib/openai-client";

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

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  documentContext?: string,
): Promise<ToolCallResult> {
  switch (name) {
    case "canvas_generate_visual":
      return handleGenerateVisual(args);
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
      return handleGenerateSimulation(args);
    case "canvas_generate_3d_render":
      return handleGenerate3DRender(args);
    default:
      return { result: `Unknown tool: ${name}` };
  }
}

async function handleGenerateVisual(
  args: Record<string, unknown>,
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

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are an SVG diagram generator that creates beautiful handwritten-style educational diagrams. They should look like they were drawn on a whiteboard or notebook — warm, organic, with a cursive/handwriting font. Output ONLY raw SVG markup. No markdown, no explanation, no code fences." },
      { role: "user", content: svgPrompt },
    ],
    temperature: 0.5,
    max_tokens: 2048,
  });

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
): Promise<{ artifact: SimulationArtifact; result: string }> {
  const { topic, context: ctx } = args as { topic: string; context?: string };

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: SIMULATION_SYSTEM_PROMPT },
      { role: "user", content: buildSimulationPrompt(topic, ctx) },
    ],
    temperature: 0.4,
    max_tokens: 4096,
  });

  const raw = res.choices[0]?.message?.content ?? "";
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
    result: `[Simulation "${topic}" generated and placed on canvas]`,
  };
}

function handleGenerate3DRender(
  args: Record<string, unknown>,
): { artifact: Render3DArtifact; result: string } {
  const { title, topic, code, camera_distance, bg_color } = args as {
    title: string;
    topic: string;
    code: string;
    camera_distance?: number;
    bg_color?: string;
  };

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
    result: `[3D render "${title}" generated and placed on canvas]`,
  };
}
