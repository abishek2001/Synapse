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
        "Generate a mathematical graph or plot on the canvas. Supports many chart types including interactive parametric graphs with slider-controlled variables. Use for functions, data plots, distributions, and exploratory math.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the graph",
          },
          graph_type: {
            type: "string",
            enum: ["line", "area", "scatter", "bar", "pie", "polar", "parametric", "box", "violin", "density", "trend", "forecast"],
            description: "Type of graph. line=connected curve, area=filled curve, scatter=dots, bar=vertical bars, pie=pie chart, polar=r=f(θ), parametric=x(t)/y(t), box=box-and-whisker, violin=mirrored KDE, density=KDE probability curves (x=value, y=density), trend=scatter+regression, forecast=solid past + dashed future",
          },
          series: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fn: { type: "string", description: "Math expression in JS syntax. Variables in scope: x (or t for parametric), Math, and any variable names from the 'variables' array. E.g. 'A * Math.sin(freq * x)'" },
                fn_x: { type: "string", description: "Parametric x(t) expression — only for graph_type 'parametric'. If omitted, x(t)=t." },
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      x: { type: "number", description: "Category index (bar/pie) or data value (box/violin/scatter)" },
                      y: { type: "number", description: "Value" },
                    },
                    required: ["x", "y"],
                  },
                  description: "Discrete data points — required for bar, pie, box, violin; optional for scatter",
                },
                label: { type: "string", description: "Legend label / series name" },
                color: { type: "string", description: "CSS color, e.g. '#7c3aed'" },
                style: { type: "string", enum: ["solid", "dashed", "dotted"], description: "Line style (line/area types only)" },
              },
              required: ["label"],
            },
            description: "Data series to plot. Each series is one curve, bar group, pie slice, etc.",
          },
          variables: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Variable name used in fn expressions, e.g. 'A', 'freq'" },
                label: { type: "string", description: "Human-readable label shown on the slider, e.g. 'Amplitude'" },
                min: { type: "number", description: "Slider minimum value" },
                max: { type: "number", description: "Slider maximum value" },
                step: { type: "number", description: "Slider step size. When step_unit is 'π', this is multiples of π (e.g. 0.25 = π/4 per step)" },
                step_unit: { type: "string", enum: ["π"], description: "Set to 'π' for trig-friendly sliders where the actual value passed to fn = slider_value × π. Great for sin/cos/polar plots." },
                default: { type: "number", description: "Initial slider value" },
              },
              required: ["name", "label", "min", "max", "step", "default"],
            },
            description: "Interactive slider variables. When provided, the graph renders with sliders that modify the math expression in real time.",
          },
          x_range: {
            type: "array",
            items: { type: "number" },
            description: "[min, max] for x-axis. For polar, this is the θ range in radians (e.g. [0, 6.283]). For parametric, this is the t range.",
          },
          y_range: {
            type: "array",
            items: { type: "number" },
            description: "[min, max] for y-axis (auto-computed if omitted)",
          },
          x_label: { type: "string", description: "X-axis label" },
          y_label: { type: "string", description: "Y-axis label" },
        },
        required: ["title", "graph_type", "series", "x_range"],
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
