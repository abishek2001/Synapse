export type ArtifactType = "visual" | "graph" | "notation" | "flashcard" | "lookup" | "simulation";

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

export interface GraphExpression {
  fn: string;
  label: string;
  color?: string;
}

export interface GraphArtifact extends BaseArtifact {
  type: "graph";
  graph_type: "line" | "scatter" | "bar" | "parametric" | "polar";
  expressions: GraphExpression[];
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

export type CanvasArtifact =
  | VisualArtifact
  | GraphArtifact
  | NotationArtifact
  | FlashcardArtifact
  | LookupArtifact
  | SimulationArtifact;
