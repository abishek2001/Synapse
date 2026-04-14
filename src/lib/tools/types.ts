export type ArtifactType = "visual" | "graph" | "notation" | "flashcard" | "lookup" | "simulation" | "render3d";

export interface BaseArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  status: "pending" | "rendered" | "error";
  position?: { x: number; y: number };
}

export interface VisualArtifact extends BaseArtifact {
  type: "visual";
  description: string;
  style: "flowchart" | "concept_map" | "comparison" | "timeline" | "diagram" | "hierarchy";
  svgContent?: string;
}

export interface GraphVariable {
  name: string;       // variable name used in fn expressions, e.g. "A", "freq"
  label: string;      // display label, e.g. "Amplitude"
  min: number;
  max: number;
  step: number;       // slider step. When step_unit is "π", this is multiples of π (e.g. 0.25 = π/4)
  step_unit?: "π";    // if set, actual value passed to fn = slider_value * Math.PI
  default: number;    // initial slider value (same units as step)
}

export interface GraphSeries {
  fn?: string;        // math expression (JS syntax). Variables in scope: x (or t for parametric), Math, + any GraphVariable names
  fn_x?: string;      // parametric x(t) expression — only for graph_type "parametric"
  data?: { x: number; y: number }[];  // discrete data — used by bar, pie, box, violin, scatter
  label: string;
  color?: string;
  style?: "solid" | "dashed" | "dotted";
}

export type GraphType =
  | "line"        // connected curve
  | "area"        // filled under curve
  | "scatter"     // dots only
  | "bar"         // vertical bars
  | "pie"         // pie / donut slices
  | "polar"       // r = f(θ), x_range is θ range
  | "parametric"  // x(t), y(t)
  | "box"         // box-and-whisker (data[] per series)
  | "violin"      // violin distribution (data[] per series)
  | "density"     // KDE density curves (x=value, y=probability density; data[] per series)
  | "trend"       // scatter + linear regression line
  | "forecast";   // line with solid past + dashed future

export interface GraphArtifact extends BaseArtifact {
  type: "graph";
  graph_type: GraphType;
  series: GraphSeries[];
  variables?: GraphVariable[];
  x_range: [number, number];
  y_range?: [number, number];
  x_label?: string;
  y_label?: string;
}

export interface NotationArtifact extends BaseArtifact {
  type: "notation";
  latex: string;
  annotation?: string;
}

export interface FlashcardData {
  front: string;
  back: string;
}

export interface FlashcardArtifact extends BaseArtifact {
  type: "flashcard";
  cards: FlashcardData[];
}

export interface LookupArtifact extends BaseArtifact {
  type: "lookup";
  query: string;
  results: { text: string; source: string }[];
}

export interface SimulationArtifact extends BaseArtifact {
  type: "simulation";
  code: string;
  topic: string;
}

export interface Render3DArtifact extends BaseArtifact {
  type: "render3d";
  topic: string;
  code: string;
  embed_url?: string;        // if set, renders a Sketchfab/external embed instead of the Three.js scene
  camera_distance?: number;  // distance of camera from origin, default 5
  bg_color?: string;         // CSS hex background, default "#0a0b14"
}

export type CanvasArtifact =
  | VisualArtifact
  | GraphArtifact
  | NotationArtifact
  | FlashcardArtifact
  | LookupArtifact
  | SimulationArtifact
  | Render3DArtifact;
