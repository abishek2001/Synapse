import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { TeachingDecision } from "@/lib/agents/strategy";

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
      name: "canvas_generate_3d_render",
      description:
        "Generate an interactive 3D render on the canvas. STRONGLY PREFERRED for anything that has real spatial structure: anatomy (heart, lungs, respiratory system, brain, kidneys, bones, eye), cells/organelles, chemistry (molecules, crystal lattices, protein structures), physics (orbits, projectiles, fields), 3D geometry, mechanical assemblies, planets, and architecture. Whenever the topic is a 3D *thing* rather than a 2D process, choose this tool over canvas_generate_diagram or canvas_generate_visual.\n\nSOURCE PRIORITY — try these in order, fall through to the next only if the previous is unavailable:\n  1. `sketchfab_query` — server searches Sketchfab and embeds the best matching real model. Highest quality, no code needed. NEVER try to construct a Sketchfab URL yourself; just supply the search phrase.\n  2. `code` with GLTFLoader/OBJLoader pulling a model from a CORS-enabled open-source URL (raw.githubusercontent.com, cdn.jsdelivr.net/gh, modelviewer.dev sample assets, KhronosGroup glTF-Sample-Models, Three.js examples).\n  3. `code` with hand-written Three.js geometry — only if no real model is available.\nExactly one of `sketchfab_query` or `code` MUST be supplied.\nIf the server cannot find a Sketchfab match for your query, the tool call returns an error — when that happens, retry the same call with `code` instead.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short display title, e.g. 'Human Heart Anatomy', 'Respiratory System', 'DNA Double Helix'",
          },
          topic: {
            type: "string",
            description: "What is being rendered — used for the loading label and accessibility",
          },
          sketchfab_query: {
            type: "string",
            description: `(TIER 1 — PREFERRED) A short, specific search phrase (2-6 words) describing the 3D object you want. The server hits the Sketchfab search API, picks the best public, embeddable, popular model and renders it in an iframe — you do NOT need to know any UIDs or URLs.

GOOD QUERIES (specific + anatomically/scientifically accurate):
- "human respiratory system anatomy"
- "human heart cross section"
- "DNA double helix structure"
- "water molecule h2o"
- "solar system planets"
- "neuron cell anatomy"
- "skeletal system human"
- "kidney anatomy cross section"

BAD QUERIES (too vague — search noise):
- "biology" / "science" / "anatomy" / "molecule"
- "cool 3d model"

If no good match exists for the topic (rare scientific concepts, abstract math, custom physics setups), DO NOT use this field — fall through to TIER 2 (code with a loader) or TIER 3 (hand-written code).`,
          },
          code: {
            type: "string",
            description: `(TIER 2 / TIER 3) Three.js JavaScript that builds the 3D scene. Required if \`sketchfab_query\` is not set, OR when retrying after a failed sketchfab_query. The following globals are pre-defined — do NOT redeclare them:
- \`scene\` (THREE.Scene) — add all objects here
- \`camera\` (THREE.PerspectiveCamera) — positioned at (0, 0.3*d, d) where d = camera_distance; reposition if needed
- \`THREE\` — full Three.js r160 namespace
- \`controls\` (OrbitControls) — rotate/zoom/pan already wired
- \`renderer\` (THREE.WebGLRenderer) — shadow-maps enabled

You can import addons via the bare-specifier importmap that's already injected: \`import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'\`, OBJLoader, MTLLoader, FBXLoader, DRACOLoader.

TIER 2 — LOAD AN OPEN-SOURCE MODEL:
- Prefer real \`.glb\` / \`.gltf\` / \`.obj\` files from CORS-enabled hosts:
  - \`https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.glb\`
  - \`https://cdn.jsdelivr.net/gh/<user>/<repo>@<branch>/<path>.glb\`
  - KhronosGroup glTF-Sample-Models (\`https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/<Name>/glTF-Binary/<Name>.glb\`)
  - Google's \`<model-viewer>\` shared assets (\`https://modelviewer.dev/shared-assets/models/<Name>.glb\`)
  - Three.js examples (\`https://threejs.org/examples/models/...\`)
- Pattern: \`new GLTFLoader().load(URL, gltf => { gltf.scene.traverse(o => o.isMesh && (o.castShadow = o.receiveShadow = true)); /* center & scale: */ const box = new THREE.Box3().setFromObject(gltf.scene); const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); gltf.scene.position.sub(center); const fit = 3 / Math.max(size.x, size.y, size.z); gltf.scene.scale.setScalar(fit); scene.add(gltf.scene); });\`
- Only use URLs you are confident exist; never invent paths.

TIER 3 — HAND-WRITE A SCENE (fallback when no real model is reachable):
Pre-added lights: AmbientLight 0.55, DirectionalLight sun (6,12,8), DirectionalLight blue fill (-6,-3,-6), PointLight violet accent (-5,6,-5).
Optionally define \`function update(t) { ... }\` (t = elapsed seconds) for per-frame animation (rotation, pulsing, physics loops, etc.).
Style guidance:
- Anatomy: MeshPhongMaterial with realistic colors + slight transparency (opacity 0.85-0.95) for outer shells; add inner structures with lower opacity. Use Group hierarchies and label parts with userData.name.
- Chemistry: SphereGeometry atoms + CylinderGeometry bonds; use CPK colors (C=0x404040, H=0xffffff, O=0xff3333, N=0x4444ff, S=0xffff33).
- Physics: use update(t) for motion; add trajectory lines with THREE.Line + BufferGeometry.
- Add a subtle grid helper or plane for spatial reference when appropriate.

Example (TIER 3 minimal): \`const mesh = new THREE.Mesh(new THREE.SphereGeometry(1,32,32), new THREE.MeshPhongMaterial({color:0x7c3aed,shininess:80})); scene.add(mesh); function update(t){mesh.rotation.y=t;}\``,
          },
          camera_distance: {
            type: "number",
            description: "Distance of camera from origin (code mode only). Default 5. Use 2-3 for small molecular models, 5-8 for anatomy, 10-20 for large structures or physics trajectories.",
          },
          bg_color: {
            type: "string",
            description: "Hex background color (code mode only). Default '#0a0b14' (dark navy). Use '#0f172a' for deep blue, '#111827' for dark gray. Prefer dark backgrounds for 3D renders.",
          },
        },
        required: ["title", "topic"],
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
  {
    type: "function",
    function: {
      name: "canvas_generate_diagram",
      description:
        "Generate an interactive node-edge diagram on the canvas. Each node is a separate interactive element with hover highlighting. Use this INSTEAD of canvas_generate_visual when the content has clearly defined entities and relationships: architecture diagrams, flowcharts, neural networks, process flows, state machines, concept maps with explicit connections, system hierarchies, data pipelines. Do NOT use for free-form sketches or when spatial layout isn't node-based.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short title for the diagram",
          },
          nodes: {
            type: "array",
            description: "List of nodes in the diagram",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Unique identifier (no spaces, e.g. 'input_layer', 'cpu', 'step_1')",
                },
                label: {
                  type: "string",
                  description: "Display text shown inside the node",
                },
                description: {
                  type: "string",
                  description: "Optional subtitle shown below the label (e.g. '784 neurons', '2.4 GHz')",
                },
                color: {
                  type: "string",
                  description: "Color name or hex: 'blue', 'purple', 'green', 'orange', 'red', 'gray', 'yellow', 'pink', 'teal'",
                },
                shape: {
                  type: "string",
                  enum: ["rect", "diamond", "circle"],
                  description: "Node shape — rect (default), diamond (for decisions), circle (for states/endpoints)",
                },
              },
              required: ["id", "label"],
            },
          },
          edges: {
            type: "array",
            description: "Connections between nodes",
            items: {
              type: "object",
              properties: {
                from: { type: "string", description: "Source node id" },
                to: { type: "string", description: "Target node id" },
                label: {
                  type: "string",
                  description: "Optional label shown on the edge (e.g. 'Yes', 'No', 'activates')",
                },
              },
              required: ["from", "to"],
            },
          },
          direction: {
            type: "string",
            enum: ["LR", "TB"],
            description: "Layout direction: LR = left-to-right (default, good for processes/pipelines), TB = top-to-bottom (good for trees/hierarchies)",
          },
        },
        required: ["title", "nodes", "edges"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "canvas_generate_simulation",
      description:
        "Generate an interactive 3D physics/chemistry/biology/math simulation on the canvas using Three.js. Use when the concept is dynamic or physical in nature and benefits from seeing it move: pendulums, orbital mechanics, wave interference, electric/magnetic fields, molecular dynamics, projectile motion, springs, fluid flow, diffusion, etc. Do NOT use for static concepts — use diagram or visual instead.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "The specific concept to simulate. Be precise: 'simple harmonic pendulum with damping', 'Coulomb force between two charges', 'double-slit interference pattern', 'planetary orbit around a star'. More specific = better simulation.",
          },
          context: {
            type: "string",
            description:
              "Optional: additional context from the conversation that should inform the simulation (e.g. 'focus on the phase relationship between displacement and velocity', 'student is studying energy conservation')",
          },
        },
        required: ["topic"],
      },
    },
  },
];

const TOOL_NAMES_BY_ACTION: Record<
  TeachingDecision["action"],
  { names: string[] | null; toolChoice: "auto" | "required" }
> = {
  // visualize — all visual artifact types, required to produce at least one
  visualize: {
    names: [
      "canvas_generate_diagram",
      "canvas_generate_visual",
      "canvas_generate_graph",
      "canvas_generate_notation",
      "canvas_generate_simulation",
      "canvas_generate_3d_render",
      "canvas_delegate_task",
    ],
    toolChoice: "required",
  },
  // quiz — test understanding with flashcards or document lookup
  quiz: {
    names: ["flashcard_create", "knowledge_lookup"],
    toolChoice: "required",
  },
  // deep_dive — all tools, must produce something
  deep_dive: { names: null, toolChoice: "required" },
  // explain — all tools, LLM decides whether to add an artifact
  explain: { names: null, toolChoice: "auto" },
  // simplify — skip simulation/deep tools, keep it simple
  simplify: {
    names: [
      "canvas_generate_diagram",
      "canvas_generate_visual",
      "canvas_generate_notation",
      "flashcard_create",
      "canvas_delegate_task",
    ],
    toolChoice: "auto",
  },
  // summarize — consolidate with a concept map or key formulas
  summarize: {
    names: [
      "canvas_generate_diagram",
      "canvas_generate_notation",
      "canvas_delegate_task",
    ],
    toolChoice: "auto",
  },
  // advance — move on, optionally drop a summary artifact
  advance: { names: null, toolChoice: "auto" },
};

export function getToolsForAction(
  action: TeachingDecision["action"],
): { tools: ChatCompletionTool[]; toolChoice: "auto" | "required" } {
  const spec = TOOL_NAMES_BY_ACTION[action] ?? { names: null, toolChoice: "auto" };
  const tools = spec.names
    ? CANVAS_TOOLS.filter(
        (t) => t.type === "function" && spec.names!.includes(t.function.name),
      )
    : CANVAS_TOOLS;
  return { tools, toolChoice: spec.toolChoice };
}
