import OpenAI from "openai";
import type {
  CanvasArtifact,
  VisualArtifact,
  GraphArtifact,
  NotationArtifact,
  FlashcardArtifact,
  LookupArtifact,
} from "./types";
import { semanticSearch } from "@/lib/grounding/retrieval";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

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

  const svgPrompt = `Create an SVG for: "${description}"
Type: ${style}

STRICT RULES:
- Output ONLY the raw <svg>...</svg> tag. NO markdown, NO explanation.
- viewBox="0 0 520 400"
- font-family="Caveat, Segoe Print, cursive" for all text
- Background: none (transparent)
- Text color: #1e293b. Accent colors: #7c3aed (purple), #0ea5e9 (blue), #10b981 (green), #f97316 (orange)
- Rounded rectangles: rx="10"
- Arrows: use curved <path> elements with marker-end arrowheads
- Font sizes: titles 20px bold, labels 16px, annotations 13px in #94a3b8
- Keep shapes slightly imperfect (organic feel)
- NO <image>, NO <script>, NO external URLs
- Include at least 3-5 labeled elements with connections`;

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: "You generate educational SVG diagrams. Output ONLY raw SVG markup — no markdown fences, no explanation text. The SVG should be clean, educational, and use a handwritten font style." },
        { role: "user", content: svgPrompt },
      ],
      temperature: 0.5,
      max_tokens: 2500,
    });

    let svg = res.choices[0]?.message?.content ?? "";
    svg = svg.replace(/```(?:svg|xml|html)?\n?/g, "").replace(/```$/g, "").trim();

    if (!svg.includes("<svg")) {
      svg = `<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg"><text x="260" y="200" text-anchor="middle" font-family="Caveat, cursive" font-size="20" fill="#7c3aed">${title}</text></svg>`;
    }

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
      result: `[Visual "${title}" generated — ${style} diagram placed on canvas]`,
    };
  } catch (err) {
    const fallbackSvg = `<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="500" height="380" rx="12" fill="#f8f8fa" stroke="#e2e8f0"/><text x="260" y="200" text-anchor="middle" font-family="Caveat, cursive" font-size="22" fill="#7c3aed">${title}</text><text x="260" y="240" text-anchor="middle" font-family="Caveat, cursive" font-size="14" fill="#94a3b8">${description.slice(0, 60)}</text></svg>`;
    return {
      artifact: {
        id: crypto.randomUUID(),
        type: "visual",
        title,
        status: "pending",
        description,
        style,
        svgContent: fallbackSvg,
      },
      result: `[Visual "${title}" — generated with fallback: ${err instanceof Error ? err.message : "error"}]`,
    };
  }
}

function handleGenerateGraph(
  args: Record<string, unknown>,
): { artifact: GraphArtifact; result: string } {
  const { title, graph_type, expressions, x_range, y_range, x_label, y_label } = args as {
    title: string;
    graph_type: GraphArtifact["graph_type"];
    expressions: GraphArtifact["expressions"];
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
    expressions,
    x_range,
    y_range,
    x_label,
    y_label,
  };

  return {
    artifact,
    result: `[Graph "${title}" generated and placed on canvas — ${expressions.length} expression(s) plotted]`,
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
