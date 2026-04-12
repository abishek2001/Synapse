import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const CANVAS_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "canvas_generate_visual",
      description:
        "Generate a conceptual diagram or visual on the canvas. Use for flow charts, system diagrams, concept maps, process flows, comparisons, timelines, etc. The output is an SVG rendered on the tldraw canvas.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short title for the visual artifact",
          },
          description: {
            type: "string",
            description:
              "Detailed description of what the visual should show — entities, relationships, layout, colors, labels. Be specific enough to generate an SVG.",
          },
          style: {
            type: "string",
            enum: ["flowchart", "concept_map", "comparison", "timeline", "diagram", "hierarchy"],
            description: "The visual style/layout to use",
          },
        },
        required: ["title", "description", "style"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "canvas_generate_graph",
      description:
        "Generate a mathematical graph or plot on the canvas. Use for functions, data plots, distributions, curves. Outputs an interactive SVG graph.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the graph",
          },
          graph_type: {
            type: "string",
            enum: ["line", "scatter", "bar", "parametric", "polar"],
            description: "Type of graph to render",
          },
          expressions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fn: { type: "string", description: "Math expression (JS syntax), e.g. 'Math.sin(x)', 'x*x'" },
                label: { type: "string", description: "Legend label" },
                color: { type: "string", description: "CSS color, e.g. '#7c5cfc'" },
              },
              required: ["fn", "label"],
            },
            description: "Functions/data series to plot",
          },
          x_range: {
            type: "array",
            items: { type: "number" },
            description: "[min, max] for x-axis",
          },
          y_range: {
            type: "array",
            items: { type: "number" },
            description: "[min, max] for y-axis (auto if omitted)",
          },
          x_label: { type: "string", description: "X-axis label" },
          y_label: { type: "string", description: "Y-axis label" },
        },
        required: ["title", "graph_type", "expressions", "x_range"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "canvas_generate_notation",
      description:
        "Render LaTeX mathematical equations or derivations on the canvas. Use for formulas, proofs, step-by-step derivations.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the notation block",
          },
          latex: {
            type: "string",
            description:
              "LaTeX code. Use \\\\  for line breaks in aligned environments. Example: '\\\\begin{aligned} F &= ma \\\\\\\\ E &= mc^2 \\\\end{aligned}'",
          },
          annotation: {
            type: "string",
            description: "Optional plain-text annotation below the equations",
          },
        },
        required: ["title", "latex"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flashcard_create",
      description:
        "Create one or more flashcards for interactive knowledge testing. Place them on the canvas for the learner to flip.",
      parameters: {
        type: "object",
        properties: {
          cards: {
            type: "array",
            items: {
              type: "object",
              properties: {
                front: { type: "string", description: "Question or prompt" },
                back: { type: "string", description: "Answer" },
              },
              required: ["front", "back"],
            },
            description: "Array of flashcard pairs",
          },
        },
        required: ["cards"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "knowledge_lookup",
      description:
        "Search the user's uploaded documents for specific information using semantic search. Use when precision matters — exact definitions, quotes, specific data from their materials. Returns relevant excerpts ranked by relevance.",
      parameters: {
        type: "object",
        properties: {
          search_query: {
            type: "string",
            description: "What to search for in the user's documents",
          },
          max_results: {
            type: "number",
            description: "Maximum number of excerpts to return (default 3)",
          },
        },
        required: ["search_query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "canvas_delegate_task",
      description:
        "Delegate a complex canvas editing task. Use this to add handwritten annotations, arrows between concepts, labels, highlights, or to organize the board layout. This tool directly manipulates the shared canvas.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description:
              "What to do on the canvas — e.g. 'Add an arrow from concept A to concept B', 'Write a handwritten note saying...', 'Add a sticky note highlighting...'",
          },
          annotations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["text", "sticky", "arrow_label"],
                  description: "Type of canvas element to create",
                },
                content: {
                  type: "string",
                  description: "Text content for the annotation",
                },
                color: {
                  type: "string",
                  description: "CSS color for the annotation (optional)",
                },
                position: {
                  type: "object",
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                  description: "Position on canvas (optional, auto-placed if omitted)",
                },
              },
              required: ["type", "content"],
            },
            description: "Array of annotations to place on the canvas",
          },
        },
        required: ["task", "annotations"],
      },
    },
  },
];
