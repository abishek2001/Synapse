import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useUIStore } from "./ui";
import type {
  CanvasArtifact,
  FlashcardArtifact,
  NotationArtifact,
  GraphArtifact,
  VisualArtifact,
  LookupArtifact,
  SimulationArtifact,
  Render3DArtifact,
  DiagramArtifact,
} from "@/lib/tools/types";
import { getDiagramElementSize } from "@/lib/diagram-layout";

// ─── Element sizing ────────────────────────────────────────────────────────────

export const ELEM_WIDTHS: Record<string, number> = {
  flashcard:  360,
  graph:      380,
  notation:   360,
  visual:     380,
  lookup:     360,
  simulation: 400,
  render3d:   380,
  diagram:    520,
  text:       480,
  sticky:     220,
};

// Used for layout & bounding-box estimates (not pixel-perfect)
const ELEM_H_EST: Record<string, number> = {
  flashcard:  320,
  graph:      290,
  notation:   180,
  visual:     270,
  lookup:     210,
  simulation: 400,
  render3d:   440,
  diagram:    320,
  text:       140,  // Tutor explanations are multi-line; 480px wide → ~3-4 lines @ 14px
  sticky:     170,
};

export function estimateElemH(type: string): number {
  return ELEM_H_EST[type] ?? 240;
}

/**
 * Resolve the element width for an artifact. Most types use the fixed
 * ELEM_WIDTHS value, but diagrams expand to their natural intrinsic width
 * so flowchart fonts stay readable instead of being scaled down to fit.
 */
export function resolveArtifactWidth(art: CanvasArtifact): number {
  const base = ELEM_WIDTHS[art.type] ?? 360;
  if (art.type === "diagram") {
    const { w } = getDiagramElementSize(art as DiagramArtifact);
    return Math.max(base, w);
  }
  return base;
}

/** Same as resolveArtifactWidth but for height estimates (layout only). */
export function resolveArtifactHeight(art: CanvasArtifact): number {
  const base = estimateElemH(art.type);
  if (art.type === "diagram") {
    const { h } = getDiagramElementSize(art as DiagramArtifact);
    return Math.max(base, h);
  }
  return base;
}

const ELEM_GAP = 24; // px gap between elements in the same group
const MAX_COLS  = 2; // max columns per group row

const GROUP_COLORS = [
  "rgba(124,58,237,0.055)",
  "rgba(14,165,233,0.055)",
  "rgba(16,185,129,0.055)",
  "rgba(249,115,22,0.055)",
  "rgba(236,72,153,0.055)",
];

// ─── Core types ───────────────────────────────────────────────────────────────

export type ElementType =
  | "flashcard" | "graph" | "notation" | "visual"
  | "lookup" | "simulation" | "render3d" | "diagram" | "text" | "sticky" | "stroke";

export interface TextData {
  content: string;
  style: "heading" | "subheading" | "body";
  color?: string;
}

export interface StickyData {
  content: string;
  color: string;
}

// Freehand stroke drawn by the user (stored relative to element's x,y origin)
export interface StrokeData {
  points: [number, number][]; // coords relative to element (x, y)
  color: string;
  width: number;
  height: number; // bounding-box height (width lives in CanvasElement.w)
}

// A single freestanding element on the whiteboard
export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h?: number;       // measured pixel height — set by ElementCard via ResizeObserver
  groupId?: string;
  zIndex: number;
  createdAt: number;
  pending?: boolean; // true while AI is still generating — shows SkeletonCard
  /** Canvas zoom level at element creation — used for birth-scale counter-transform */
  birthScale?: number;
  // Payload — exactly one is populated based on type
  artifact?: CanvasArtifact; // for flashcard / graph / notation / visual / lookup / simulation
  text?: TextData;            // for "text"
  sticky?: StickyData;        // for "sticky"
  stroke?: StrokeData;        // for "stroke"
}

// A visual group — just a label + background behind related elements
export interface CanvasGroup {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
  createdAt: number;
}

export interface ModuleConnection {
  id: string;
  fromModuleId: string; // group id
  toModuleId: string;   // group id
  label?: string;
}

export interface CanvasUpdateEvent {
  id: string;
  type: "module_added" | "doubt_answered" | "selection_asked" | "ai_note";
  title: string;
  detail: string;
  timestamp: number;
  moduleId?: string;
}

export interface ArtifactToast {
  id: string;
  artifactType: string;
  title: string;
  status: "preparing" | "adding" | "done";
}

export interface CanvasStroke {
  id: string;
  points: [number, number][];
  color: string;
  width: number;
}

// Legacy crumb type — kept for API compatibility
export interface Crumb {
  id: string;
  type: "note" | "hint" | "tip";
  content: string;
  collapsed: boolean;
}

// ─── State interface ──────────────────────────────────────────────────────────

/** Transient state set while a streaming turn is building a new module.
 *  Drives the dashed "Generating…" boundary that wraps in-flight pending elements. */
export interface PendingModule {
  /** Element IDs (pending or just-resolved) that belong to this in-flight module. */
  elementIds: string[];
  /** Tutor-supplied title once the response arrives; null until then. */
  title: string | null;
  startedAt: number;
}

interface CanvasState {
  elements: CanvasElement[];
  groups: CanvasGroup[];
  connections: ModuleConnection[];
  strokes: CanvasStroke[];
  toasts: ArtifactToast[];
  updates: CanvasUpdateEvent[];
  selectedElementIds: string[];
  isMockMode: boolean;
  pendingModule: PendingModule | null;

  // Element actions
  addElement: (el: CanvasElement) => void;
  addPendingElement: (el: CanvasElement) => void;
  resolvePendingElement: (id: string, artifact: CanvasArtifact) => void;
  moveElement: (id: string, x: number, y: number) => void;
  removeElement: (id: string) => void;
  setElementHeight: (id: string, h: number) => void;
  updateElementText: (id: string, content: string) => void;
  updateStickyContent: (id: string, content: string) => void;

  // Group actions
  groupSelected: (name: string) => void;
  ungroupElements: (groupId: string) => void;

  // Selection
  selectElements: (ids: string[]) => void;
  toggleElementSelected: (id: string) => void;
  clearSelection: () => void;

  // High-level "add module" (called by AI chat — creates elements + group)
  // writtenText: if provided, placed as a text element at the top of the group
  addModule: (title: string, artifacts: CanvasArtifact[], crumbs?: Crumb[], writtenText?: string) => void;

  // Pending-module lifecycle (drives the dashed boundary while AI streams artifacts)
  startPendingModule: () => void;
  addToPendingModule: (elementId: string) => void;
  setPendingModuleTitle: (title: string) => void;
  clearPendingModule: () => void;

  // Connections
  addConnection: (conn: ModuleConnection) => void;
  removeConnection: (id: string) => void;

  // Strokes
  addStroke: (stroke: CanvasStroke) => void;
  clearStrokes: () => void;

  // Toasts
  addToast: (toast: ArtifactToast) => void;
  updateToast: (id: string, status: ArtifactToast["status"]) => void;
  removeToast: (id: string) => void;

  // Updates feed
  addUpdate: (event: CanvasUpdateEvent) => void;

  // Mock
  setMockMode: (v: boolean) => void;
  loadMockData: (topic?: string) => void;

  // Canvas reset
  clearCanvas: () => void;
}

// ─── Layout helpers ────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Birth scale is always 1 — counter-scale only activates when zoomed IN past 1×.
 *  This keeps every element's world-space footprint equal to its logical width/height,
 *  which makes group bounds and layout spacing always correct. */
function getBirthScale(): number {
  return 1;
}

/**
 * Find the X coordinate to the right of all existing elements.
 * New groups are placed horizontally so the canvas grows rightward.
 */
function nextGroupStartX(elements: CanvasElement[]): number {
  if (elements.length === 0) return 80;
  return elements.reduce((max, el) => Math.max(max, el.x + el.w), 0) + 80;
}

const CANVAS_START_Y = 200; // all groups sit on the same horizontal baseline

/** Layout artifacts for a new group starting at (startX, startY). */
function layoutArtifacts(
  artifacts: CanvasArtifact[],
  groupId: string,
  startX: number,
  startY: number,
  zBase: number,
): CanvasElement[] {
  const result: CanvasElement[] = [];
  let rowX = startX;
  let rowY = startY;
  let rowMaxH = 0;
  let col = 0;
  const birthScale = getBirthScale();

  for (let i = 0; i < artifacts.length; i++) {
    const art = artifacts[i];
    const w = resolveArtifactWidth(art);
    const h = resolveArtifactHeight(art);

    result.push({
      id: `el-${uid()}`,
      type: art.type as ElementType,
      x: rowX,
      y: rowY,
      w,
      groupId,
      zIndex: zBase + i,
      createdAt: Date.now() + i,
      artifact: art,
      birthScale,
    });

    rowMaxH = Math.max(rowMaxH, h);
    col++;
    if (col >= MAX_COLS) {
      // wrap to next row
      rowX = startX;
      rowY += rowMaxH + ELEM_GAP;
      rowMaxH = 0;
      col = 0;
    } else {
      rowX += w + ELEM_GAP;
    }
  }

  return result;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function buildMockCanvas(topic: string): {
  elements: CanvasElement[];
  groups: CanvasGroup[];
  connections: ModuleConnection[];
} {
  const t = topic;

  // 6 groups — one per visual style, each paired with a complementary artifact type
  const groups: CanvasGroup[] = [
    { id: "grp-0",  name: `Introduction to ${t}`, color: GROUP_COLORS[0], orderIndex: 0,  createdAt: Date.now() },
    { id: "grp-1",  name: "Math & Equations",      color: GROUP_COLORS[1], orderIndex: 1,  createdAt: Date.now() + 1 },
    { id: "grp-2",  name: "Timeline",              color: GROUP_COLORS[2], orderIndex: 2,  createdAt: Date.now() + 2 },
    { id: "grp-3",  name: "Comparison",            color: GROUP_COLORS[3], orderIndex: 3,  createdAt: Date.now() + 3 },
    { id: "grp-4",  name: "System Diagram",        color: GROUP_COLORS[4], orderIndex: 4,  createdAt: Date.now() + 4 },
    { id: "grp-5",  name: "Hierarchy",             color: GROUP_COLORS[0], orderIndex: 5,  createdAt: Date.now() + 5 },
    // Row 2: one group per chart type
    { id: "grp-g0",  name: "Line",        color: GROUP_COLORS[1], orderIndex: 6,  createdAt: Date.now() + 6 },
    { id: "grp-g1",  name: "Area",        color: GROUP_COLORS[2], orderIndex: 7,  createdAt: Date.now() + 7 },
    { id: "grp-g2",  name: "Scatter",     color: GROUP_COLORS[3], orderIndex: 8,  createdAt: Date.now() + 8 },
    { id: "grp-g3",  name: "Trend",       color: GROUP_COLORS[4], orderIndex: 9,  createdAt: Date.now() + 9 },
    { id: "grp-g4",  name: "Forecast",    color: GROUP_COLORS[0], orderIndex: 10, createdAt: Date.now() + 10 },
    { id: "grp-g5",  name: "Parametric",  color: GROUP_COLORS[1], orderIndex: 11, createdAt: Date.now() + 11 },
    { id: "grp-g6",  name: "Bar",         color: GROUP_COLORS[2], orderIndex: 12, createdAt: Date.now() + 12 },
    { id: "grp-g7",  name: "Pie",         color: GROUP_COLORS[3], orderIndex: 13, createdAt: Date.now() + 13 },
    { id: "grp-g8",  name: "Polar",       color: GROUP_COLORS[4], orderIndex: 14, createdAt: Date.now() + 14 },
    { id: "grp-g9",  name: "Box",         color: GROUP_COLORS[0], orderIndex: 15, createdAt: Date.now() + 15 },
    { id: "grp-g10", name: "Violin",      color: GROUP_COLORS[1], orderIndex: 16, createdAt: Date.now() + 16 },
    { id: "grp-g11", name: "Density",     color: GROUP_COLORS[2], orderIndex: 17, createdAt: Date.now() + 17 },
    // Row 3: 3D render gallery
    { id: "grp-r0", name: "Human Heart",        color: GROUP_COLORS[3], orderIndex: 18, createdAt: Date.now() + 18 },
    { id: "grp-r1", name: "DNA Double Helix",   color: GROUP_COLORS[4], orderIndex: 19, createdAt: Date.now() + 19 },
    { id: "grp-r2", name: "Water Molecule",     color: GROUP_COLORS[0], orderIndex: 20, createdAt: Date.now() + 20 },
    { id: "grp-r3", name: "Projectile Motion",  color: GROUP_COLORS[1], orderIndex: 21, createdAt: Date.now() + 21 },
    { id: "grp-r4", name: "NaCl Crystal",       color: GROUP_COLORS[2], orderIndex: 22, createdAt: Date.now() + 22 },
    { id: "grp-r5", name: "Animal Cell",         color: GROUP_COLORS[3], orderIndex: 23, createdAt: Date.now() + 23 },
  ];

  // ─── Artifacts: one of each type, all 6 visual styles ───────────────────

  // grp-0: concept_map visual + flashcard
  const artConceptMap: VisualArtifact = {
    id: "a-vis-cm", type: "visual", title: "Concept Map", status: "rendered",
    description: `High-level map of ${t}`, style: "concept_map",
    svgContent: `<svg viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg">
      <rect x="75" y="10" width="70" height="30" rx="7" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.5"/>
      <text x="110" y="29" text-anchor="middle" font-size="10" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">${t.slice(0, 12)}</text>
      <line x1="110" y1="40" x2="45"  y2="82" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
      <line x1="110" y1="40" x2="110" y2="82" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
      <line x1="110" y1="40" x2="175" y2="82" stroke="#7c3aed" stroke-width="1" opacity="0.35"/>
      <rect x="10"  y="82" width="70" height="26" rx="5" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="45"  y="99" text-anchor="middle" font-size="9" fill="#0ea5e9" font-family="system-ui,sans-serif">Concepts</text>
      <rect x="75"  y="82" width="70" height="26" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1"/>
      <text x="110" y="99" text-anchor="middle" font-size="9" fill="#10b981" font-family="system-ui,sans-serif">Methods</text>
      <rect x="140" y="82" width="70" height="26" rx="5" fill="#f97316" opacity="0.12" stroke="#f97316" stroke-width="1"/>
      <text x="175" y="99" text-anchor="middle" font-size="9" fill="#f97316" font-family="system-ui,sans-serif">Examples</text>
    </svg>`,
  };

  const artFlashcard: FlashcardArtifact = {
    id: "a-fc", type: "flashcard", title: `${t} Basics`, status: "rendered",
    cards: [
      { front: "What is this?", back: `${t} is a foundational concept that unlocks a chain of deeper ideas.` },
      { front: "Why it matters", back: "A strong foundation here makes advanced topics much more intuitive." },
      { front: "Quick check", back: "Can you explain this in one sentence without looking?" },
    ],
  };

  // grp-1: notation + graph (line)
  const artNotation: NotationArtifact = {
    id: "a-nt", type: "notation", title: "Core Formula", status: "rendered",
    latex: "f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n",
    annotation: "Taylor series — any smooth function expressed as an infinite polynomial.",
  };

  const artGraph: GraphArtifact = {
    id: "a-gr", type: "graph", title: "Trig Explorer", status: "rendered",
    graph_type: "line",
    series: [
      { fn: "A * Math.sin(freq * x)", label: "sin", color: "#7c3aed" },
      { fn: "A * Math.cos(freq * x)", label: "cos", color: "#0ea5e9", style: "dashed" },
    ],
    variables: [
      { name: "A", label: "Amplitude", min: 0.5, max: 3, step: 0.5, default: 1 },
      { name: "freq", label: "Frequency", min: 0.25, max: 4, step: 0.25, step_unit: "π", default: 1 },
    ],
    x_range: [-6.28, 6.28], x_label: "x", y_label: "y",
  };

  // grp-2: timeline visual + graph (comparative)
  const artTimeline: VisualArtifact = {
    id: "a-vis-tl", type: "visual", title: "Historical Timeline", status: "rendered",
    description: `Timeline of key developments in ${t}`, style: "timeline",
    svgContent: `<svg viewBox="0 0 280 130" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="65" x2="260" y2="65" stroke="#7c3aed" stroke-width="1.5" opacity="0.25"/>
      <circle cx="50"  cy="65" r="5" fill="#7c3aed" opacity="0.7"/>
      <rect x="22"  y="22" width="56" height="22" rx="4" fill="#7c3aed" opacity="0.12" stroke="#7c3aed" stroke-width="1"/>
      <text x="50"  y="36" text-anchor="middle" font-size="8" fill="#7c3aed" font-family="system-ui,sans-serif">Discovery</text>
      <line x1="50"  y1="44" x2="50"  y2="60" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
      <circle cx="110" cy="65" r="5" fill="#0ea5e9" opacity="0.7"/>
      <rect x="82"  y="78" width="56" height="22" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="110" y="92" text-anchor="middle" font-size="8" fill="#0ea5e9" font-family="system-ui,sans-serif">Theory</text>
      <line x1="110" y1="70" x2="110" y2="78" stroke="#0ea5e9" stroke-width="1" opacity="0.3"/>
      <circle cx="170" cy="65" r="5" fill="#10b981" opacity="0.7"/>
      <rect x="142" y="22" width="56" height="22" rx="4" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1"/>
      <text x="170" y="36" text-anchor="middle" font-size="8" fill="#10b981" font-family="system-ui,sans-serif">Application</text>
      <line x1="170" y1="44" x2="170" y2="60" stroke="#10b981" stroke-width="1" opacity="0.3"/>
      <circle cx="230" cy="65" r="5" fill="#f97316" opacity="0.7"/>
      <rect x="202" y="78" width="56" height="22" rx="4" fill="#f97316" opacity="0.12" stroke="#f97316" stroke-width="1"/>
      <text x="230" y="92" text-anchor="middle" font-size="8" fill="#f97316" font-family="system-ui,sans-serif">Modern Era</text>
      <line x1="230" y1="70" x2="230" y2="78" stroke="#f97316" stroke-width="1" opacity="0.3"/>
    </svg>`,
  };

  const artGraph2: GraphArtifact = {
    id: "a-gr2", type: "graph", title: "Comparative Growth", status: "rendered",
    graph_type: "area",
    series: [
      { fn: "x * x * 0.5",          label: "Quadratic",   color: "#7c3aed" },
      { fn: "Math.log(x + 1) * 30", label: "Logarithmic", color: "#10b981" },
      { fn: "x * 6",                label: "Linear",      color: "#0ea5e9" },
    ],
    x_range: [0, 10], x_label: "Input", y_label: "Output",
  };

  // grp-3: comparison visual + lookup
  const artComparison: VisualArtifact = {
    id: "a-vis-cmp", type: "visual", title: "Side-by-Side Comparison", status: "rendered",
    description: `Comparing two approaches to ${t}`, style: "comparison",
    svgContent: `<svg viewBox="0 0 230 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="8"   y="8"  width="102" height="24" rx="5" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.2"/>
      <text x="59"  y="23" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Approach A</text>
      <rect x="120" y="8"  width="102" height="24" rx="5" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1.2"/>
      <text x="171" y="23" text-anchor="middle" font-size="9" fill="#0ea5e9" font-weight="600" font-family="system-ui,sans-serif">Approach B</text>
      <line x1="0" y1="36" x2="230" y2="36" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
      <rect x="8"   y="40" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.05"/>
      <rect x="120" y="40" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.05"/>
      <text x="14"  y="53" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Speed: Fast</text>
      <text x="126" y="53" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Speed: Moderate</text>
      <rect x="8"   y="64" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.03"/>
      <rect x="120" y="64" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.03"/>
      <text x="14"  y="77" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Cost: High</text>
      <text x="126" y="77" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Cost: Low</text>
      <rect x="8"   y="88" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.05"/>
      <rect x="120" y="88" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.05"/>
      <text x="14"  y="101" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Scale: Large</text>
      <text x="126" y="101" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Scale: Small</text>
      <rect x="8"   y="112" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.03"/>
      <rect x="120" y="112" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.03"/>
      <text x="14"  y="125" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Complexity: High</text>
      <text x="126" y="125" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Complexity: Low</text>
      <rect x="8"   y="136" width="102" height="20" rx="3" fill="#7c3aed" opacity="0.05"/>
      <rect x="120" y="136" width="102" height="20" rx="3" fill="#0ea5e9" opacity="0.05"/>
      <text x="14"  y="149" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Accuracy: High</text>
      <text x="126" y="149" font-size="8" fill="rgba(0,0,0,0.45)" font-family="system-ui,sans-serif">Accuracy: Medium</text>
    </svg>`,
  };

  const artLookup: LookupArtifact = {
    id: "a-lu", type: "lookup", title: "Key Definitions", status: "rendered",
    query: t,
    results: [
      { text: `${t} is defined by its unique properties and behaviors under varying conditions — a concept that recurs across many domains.`, source: "Course Notes, p. 12" },
      { text: `The study of ${t} reveals self-similar patterns that appear at multiple scales, from micro to macro.`, source: "Reference Guide, §2.3" },
      { text: `Historically, ${t} was first formally described through careful experimental observation and mathematical abstraction.`, source: "History of Science, ch. 4" },
    ],
  };

  // grp-4: diagram visual + simulation
  const artDiagram: VisualArtifact = {
    id: "a-vis-dia", type: "visual", title: "System Diagram", status: "rendered",
    description: `Component diagram for ${t}`, style: "diagram",
    svgContent: `<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="90" y="65" width="60" height="30" rx="6" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.5"/>
      <text x="120" y="83" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Core</text>
      <rect x="10" y="28" width="56" height="24" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="38" y="43" text-anchor="middle" font-size="8" fill="#0ea5e9" font-family="system-ui,sans-serif">Input</text>
      <line x1="66" y1="40" x2="90" y2="74" stroke="#0ea5e9" stroke-width="1" opacity="0.35" stroke-dasharray="3 2"/>
      <rect x="174" y="28" width="56" height="24" rx="4" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1"/>
      <text x="202" y="43" text-anchor="middle" font-size="8" fill="#10b981" font-family="system-ui,sans-serif">Output</text>
      <line x1="174" y1="40" x2="150" y2="74" stroke="#10b981" stroke-width="1" opacity="0.35" stroke-dasharray="3 2"/>
      <rect x="10" y="108" width="56" height="24" rx="4" fill="#f97316" opacity="0.12" stroke="#f97316" stroke-width="1"/>
      <text x="38" y="123" text-anchor="middle" font-size="8" fill="#f97316" font-family="system-ui,sans-serif">Storage</text>
      <line x1="66" y1="120" x2="90" y2="92" stroke="#f97316" stroke-width="1" opacity="0.35" stroke-dasharray="3 2"/>
      <rect x="174" y="108" width="56" height="24" rx="4" fill="#ec4899" opacity="0.12" stroke="#ec4899" stroke-width="1"/>
      <text x="202" y="123" text-anchor="middle" font-size="8" fill="#ec4899" font-family="system-ui,sans-serif">Monitor</text>
      <line x1="174" y1="120" x2="150" y2="92" stroke="#ec4899" stroke-width="1" opacity="0.35" stroke-dasharray="3 2"/>
    </svg>`,
  };

  const artSimulation: SimulationArtifact = {
    id: "a-sim", type: "simulation", title: "Pendulum", status: "rendered",
    topic: t,
    code: `<!DOCTYPE html>
<html>
<head>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0b14;overflow:hidden;display:flex;align-items:center;justify-content:center;height:100vh}</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const c=document.getElementById('c');
const ctx=c.getContext('2d');
c.width=400;c.height=340;
let angle=Math.PI/3,vel=0;
const L=130,cx=200,cy=55;
const trail=[];
function draw(){
  ctx.fillStyle='rgba(10,11,20,0.3)';
  ctx.fillRect(0,0,c.width,c.height);
  const px=cx+L*Math.sin(angle),py=cy+L*Math.cos(angle);
  trail.push([px,py]);
  if(trail.length>90)trail.shift();
  for(let i=1;i<trail.length;i++){
    ctx.beginPath();ctx.moveTo(trail[i-1][0],trail[i-1][1]);ctx.lineTo(trail[i][0],trail[i][1]);
    ctx.strokeStyle='rgba(124,58,237,'+(i/trail.length*0.55)+')';ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(px,py);
  ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=1.5;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,4,0,6.28);ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fill();
  const g=ctx.createRadialGradient(px-4,py-4,2,px,py,13);
  g.addColorStop(0,'#a78bfa');g.addColorStop(1,'#7c3aed');
  ctx.beginPath();ctx.arc(px,py,13,0,6.28);ctx.fillStyle=g;ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.28)';ctx.font='11px Inter,system-ui,sans-serif';ctx.textAlign='center';
  ctx.fillText('\u03b8 = '+(angle*180/Math.PI).toFixed(1)+'\u00b0',cx,cy+L+34);
  ctx.fillText('\u03c9 = '+(vel*10).toFixed(2)+' rad/s',cx,cy+L+50);
  vel+=(-9.8/L*Math.sin(angle))*0.016;vel*=0.9995;angle+=vel*0.016;
  requestAnimationFrame(draw);
}
draw();
<\/script>
</body>
</html>`,
  };

  // grp-5: flowchart visual + hierarchy visual
  const artFlowchart: VisualArtifact = {
    id: "a-vis-fc", type: "visual", title: "Problem-Solving Flow", status: "rendered",
    description: `Step-by-step process for ${t}`, style: "flowchart",
    svgContent: `<svg viewBox="0 0 180 220" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="8"   width="100" height="28" rx="6" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.5"/>
      <text x="90" y="26"  text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="700" font-family="system-ui,sans-serif">Identify</text>
      <line x1="90" y1="36" x2="90" y2="51" stroke="#7c3aed" stroke-width="1" opacity="0.3" stroke-dasharray="3 2"/>
      <polygon points="90,55 85,49 95,49" fill="#7c3aed" opacity="0.3"/>
      <rect x="40" y="55"  width="100" height="28" rx="6" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1.2"/>
      <text x="90" y="73"  text-anchor="middle" font-size="9" fill="#0ea5e9" font-family="system-ui,sans-serif">Model</text>
      <line x1="90" y1="83" x2="90" y2="98" stroke="#0ea5e9" stroke-width="1" opacity="0.3" stroke-dasharray="3 2"/>
      <polygon points="90,102 85,96 95,96" fill="#0ea5e9" opacity="0.3"/>
      <rect x="40" y="102" width="100" height="28" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1.2"/>
      <text x="90" y="120" text-anchor="middle" font-size="9" fill="#10b981" font-family="system-ui,sans-serif">Solve</text>
      <line x1="90" y1="130" x2="90" y2="145" stroke="#10b981" stroke-width="1" opacity="0.3" stroke-dasharray="3 2"/>
      <polygon points="90,149 85,143 95,143" fill="#10b981" opacity="0.3"/>
      <rect x="40" y="149" width="100" height="28" rx="6" fill="#f97316" opacity="0.12" stroke="#f97316" stroke-width="1.2"/>
      <text x="90" y="167" text-anchor="middle" font-size="9" fill="#f97316" font-family="system-ui,sans-serif">Interpret</text>
      <line x1="90" y1="177" x2="90" y2="192" stroke="#f97316" stroke-width="1" opacity="0.3" stroke-dasharray="3 2"/>
      <polygon points="90,196 85,190 95,190" fill="#f97316" opacity="0.3"/>
      <rect x="40" y="196" width="100" height="20" rx="4" fill="#ec4899" opacity="0.12" stroke="#ec4899" stroke-width="1"/>
      <text x="90" y="209" text-anchor="middle" font-size="8" fill="#ec4899" font-family="system-ui,sans-serif">Communicate</text>
    </svg>`,
  };

  const artHierarchy: VisualArtifact = {
    id: "a-vis-hr", type: "visual", title: "Knowledge Hierarchy", status: "rendered",
    description: `Hierarchical breakdown of ${t}`, style: "hierarchy",
    svgContent: `<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="90" y="8" width="60" height="24" rx="5" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.5"/>
      <text x="120" y="23" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="600" font-family="system-ui,sans-serif">Domain</text>
      <line x1="120" y1="32" x2="55"  y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
      <line x1="120" y1="32" x2="120" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
      <line x1="120" y1="32" x2="185" y2="58" stroke="#7c3aed" stroke-width="1" opacity="0.3"/>
      <rect x="22"  y="58" width="66" height="22" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="55"  y="72" text-anchor="middle" font-size="8" fill="#0ea5e9" font-family="system-ui,sans-serif">Theory</text>
      <rect x="87"  y="58" width="66" height="22" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="120" y="72" text-anchor="middle" font-size="8" fill="#0ea5e9" font-family="system-ui,sans-serif">Practice</text>
      <rect x="152" y="58" width="66" height="22" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="185" y="72" text-anchor="middle" font-size="8" fill="#0ea5e9" font-family="system-ui,sans-serif">Application</text>
      <line x1="55"  y1="80" x2="35"  y2="106" stroke="#0ea5e9" stroke-width="1" opacity="0.25"/>
      <line x1="55"  y1="80" x2="75"  y2="106" stroke="#0ea5e9" stroke-width="1" opacity="0.25"/>
      <line x1="185" y1="80" x2="168" y2="106" stroke="#0ea5e9" stroke-width="1" opacity="0.25"/>
      <line x1="185" y1="80" x2="202" y2="106" stroke="#0ea5e9" stroke-width="1" opacity="0.25"/>
      <rect x="18"  y="106" width="34" height="16" rx="3" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="0.8"/>
      <text x="35"  y="117" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Axioms</text>
      <rect x="58"  y="106" width="34" height="16" rx="3" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="0.8"/>
      <text x="75"  y="117" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Proofs</text>
      <rect x="151" y="106" width="34" height="16" rx="3" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="0.8"/>
      <text x="168" y="117" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Models</text>
      <rect x="185" y="106" width="34" height="16" rx="3" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="0.8"/>
      <text x="202" y="117" text-anchor="middle" font-size="7" fill="#10b981" font-family="system-ui,sans-serif">Tools</text>
    </svg>`,
  };

  // ─── Row 2: one of each graph type ───────────────────────────────────────

  const scatterPts = [1,2,3,4,5,6,7,8,9,10].map(x => ({
    x, y: x * 0.7 + 1 + (Math.sin(x * 17) * 0.9),
  }));

  const grLine: GraphArtifact = {
    id: "a-g-line", type: "graph", title: "Line", status: "rendered",
    graph_type: "line",
    series: [
      { fn: "Math.sin(x)", label: "sin(x)", color: "#7c3aed" },
      { fn: "Math.cos(x)", label: "cos(x)", color: "#0ea5e9", style: "dashed" },
    ],
    x_range: [-6.28, 6.28],
  };

  const grArea: GraphArtifact = {
    id: "a-g-area", type: "graph", title: "Area", status: "rendered",
    graph_type: "area",
    series: [
      { fn: "Math.exp(-x*0.3)*Math.sin(x)", label: "damped", color: "#7c3aed" },
    ],
    x_range: [0, 10],
  };

  const grScatter: GraphArtifact = {
    id: "a-g-scatter", type: "graph", title: "Scatter", status: "rendered",
    graph_type: "scatter",
    series: [{ data: scatterPts, label: "observations", color: "#10b981" }],
    x_range: [0, 11],
  };

  const grTrend: GraphArtifact = {
    id: "a-g-trend", type: "graph", title: "Trend", status: "rendered",
    graph_type: "trend",
    series: [{ data: scatterPts, label: "data + fit", color: "#f97316" }],
    x_range: [0, 11],
  };

  const grForecast: GraphArtifact = {
    id: "a-g-forecast", type: "graph", title: "Forecast", status: "rendered",
    graph_type: "forecast",
    series: [
      { fn: "Math.pow(1.18, x) * 100", label: "revenue", color: "#7c3aed" },
    ],
    x_range: [0, 12], x_label: "Quarter",
  };

  const grParametric: GraphArtifact = {
    id: "a-g-param", type: "graph", title: "Parametric", status: "rendered",
    graph_type: "parametric",
    series: [
      { fn: "Math.sin(2*x + 0.5)", fn_x: "Math.sin(3*x)", label: "Lissajous", color: "#ec4899" },
    ],
    x_range: [0, 6.28],
  };

  const grBar: GraphArtifact = {
    id: "a-g-bar", type: "graph", title: "Bar", status: "rendered",
    graph_type: "bar",
    series: [
      { data: [{x:1,y:28},{x:2,y:45},{x:3,y:62},{x:4,y:38},{x:5,y:51}], label: "Group A", color: "#7c3aed" },
      { data: [{x:1,y:32},{x:2,y:38},{x:3,y:48},{x:4,y:55},{x:5,y:40}], label: "Group B", color: "#0ea5e9" },
    ],
    x_range: [1, 5],
  };

  const grPie: GraphArtifact = {
    id: "a-g-pie", type: "graph", title: "Pie", status: "rendered",
    graph_type: "pie",
    series: [
      { data: [{x:0,y:35}], label: "Alpha",   color: "#7c3aed" },
      { data: [{x:0,y:25}], label: "Beta",    color: "#0ea5e9" },
      { data: [{x:0,y:20}], label: "Gamma",   color: "#10b981" },
      { data: [{x:0,y:12}], label: "Delta",   color: "#f97316" },
      { data: [{x:0,y: 8}], label: "Epsilon", color: "#ec4899" },
    ],
    x_range: [0, 1],
  };

  const grPolar: GraphArtifact = {
    id: "a-g-polar", type: "graph", title: "Polar", status: "rendered",
    graph_type: "polar",
    series: [{ fn: "Math.cos(k*x)", label: "rose r=cos(kθ)", color: "#7c3aed" }],
    x_range: [0, 6.28],
    variables: [
      { name: "k", label: "Petals", min: 1, max: 7, step: 1, default: 3 },
    ],
  };

  const boxData = (center: number, spread: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      x: 0,
      y: center + (Math.sin(i * 137.5) * spread),
    }));

  const grBox: GraphArtifact = {
    id: "a-g-box", type: "graph", title: "Box", status: "rendered",
    graph_type: "box",
    series: [
      { data: boxData(70, 10, 16), label: "Group A", color: "#7c3aed" },
      { data: boxData(55, 18, 16), label: "Group B", color: "#0ea5e9" },
      { data: boxData(80,  6, 16), label: "Group C", color: "#10b981" },
    ],
    x_range: [0, 3],
  };

  const grViolin: GraphArtifact = {
    id: "a-g-violin", type: "graph", title: "Violin", status: "rendered",
    graph_type: "violin",
    series: [
      { data: boxData(65, 12, 30), label: "Before", color: "#7c3aed" },
      { data: boxData(78,  8, 30), label: "After",  color: "#10b981" },
    ],
    x_range: [0, 2],
  };

  const grDensity: GraphArtifact = {
    id: "a-g-density", type: "graph", title: "Density", status: "rendered",
    graph_type: "density",
    series: [
      { data: boxData(60, 10, 40), label: "Control",   color: "#7c3aed" },
      { data: boxData(72,  8, 40), label: "Treatment", color: "#10b981" },
      { data: boxData(55, 16, 40), label: "Placebo",   color: "#f97316" },
    ],
    x_range: [20, 110],
  };

  // ─── Row 3: 3D render demos ──────────────────────────────────────────────

  const render3dHeart: Render3DArtifact = {
    id: "a-r3d-heart", type: "render3d", title: "Human Heart — Anatomical", status: "rendered",
    topic: "Human Heart — 4-Chamber Anatomy",
    embed_url: "https://sketchfab.com/models/54fa880728d14c11afff78be8721620a/embed?autostart=1&ui_theme=dark&ui_infos=0&ui_controls=1",
    code: "",
  };

  const render3dDNA: Render3DArtifact = {
    id: "a-r3d-dna", type: "render3d", title: "DNA Double Helix", status: "rendered",
    topic: "DNA Double Helix Structure",
    camera_distance: 7,
    bg_color: "#060810",
    code: `
const dnaGroup = new THREE.Group();
const N=28, RADIUS=1.8, PITCH=0.38, TURNS=2.4;
const matA = new THREE.MeshPhongMaterial({color:0x7c3aed,shininess:70});
const matB = new THREE.MeshPhongMaterial({color:0x0ea5e9,shininess:70});
const baseMats = [
  new THREE.MeshPhongMaterial({color:0xef4444,transparent:true,opacity:0.88}),
  new THREE.MeshPhongMaterial({color:0x10b981,transparent:true,opacity:0.88}),
  new THREE.MeshPhongMaterial({color:0xf97316,transparent:true,opacity:0.88}),
  new THREE.MeshPhongMaterial({color:0xec4899,transparent:true,opacity:0.88}),
];
const bGeoA = new THREE.SphereGeometry(0.16,10,10);
const bGeoB = new THREE.SphereGeometry(0.16,10,10);

for (let i=0;i<N;i++) {
  const t=i/N;
  const aA=t*Math.PI*2*TURNS, aB=aA+Math.PI;
  const y=(i-N/2)*PITCH;
  const pA=new THREE.Vector3(RADIUS*Math.cos(aA),y,RADIUS*Math.sin(aA));
  const pB=new THREE.Vector3(RADIUS*Math.cos(aB),y,RADIUS*Math.sin(aB));

  const bA=new THREE.Mesh(bGeoA,matA); bA.position.copy(pA); dnaGroup.add(bA);
  const bB=new THREE.Mesh(bGeoB,matB); bB.position.copy(pB); dnaGroup.add(bB);

  // Base pair rung
  const dir=pB.clone().sub(pA);
  const rung=new THREE.Mesh(
    new THREE.CylinderGeometry(0.055,0.055,dir.length(),8),baseMats[i%4]);
  rung.position.copy(pA.clone().add(pB).multiplyScalar(0.5));
  rung.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
  dnaGroup.add(rung);

  // Backbone segments
  if (i<N-1) {
    const na=t+1/N, nextY=((i+1)-N/2)*PITCH;
    const nA=new THREE.Vector3(RADIUS*Math.cos(na*Math.PI*2*TURNS),nextY,RADIUS*Math.sin(na*Math.PI*2*TURNS));
    const nB=new THREE.Vector3(RADIUS*Math.cos(na*Math.PI*2*TURNS+Math.PI),nextY,RADIUS*Math.sin(na*Math.PI*2*TURNS+Math.PI));
    for (const [from,to,mat] of [[pA,nA,matA],[pB,nB,matB]]) {
      const d=to.clone().sub(from);
      const seg=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,d.length(),6),mat);
      seg.position.copy(from.clone().add(to).multiplyScalar(0.5));
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
      dnaGroup.add(seg);
    }
  }
}
scene.add(dnaGroup);
camera.position.set(0,0,7);
controls.target.set(0,0,0);
function update(t) { dnaGroup.rotation.y=t*0.4; }`,
  };

  const render3dWater: Render3DArtifact = {
    id: "a-r3d-water", type: "render3d", title: "H₂O Molecule", status: "rendered",
    topic: "Water Molecule (H₂O) — Bond Angle 104.5°",
    camera_distance: 4.5,
    bg_color: "#080c14",
    code: `
const molGroup = new THREE.Group();
const oMat   = new THREE.MeshPhongMaterial({color:0xff2222,shininess:90,specular:0xff8888,emissive:0x330000});
const hMat   = new THREE.MeshPhongMaterial({color:0xdde0ff,shininess:80,specular:0xffffff});
const bondMat = new THREE.MeshPhongMaterial({color:0x889099,shininess:40});

molGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.73,32,32),oMat));

const bondAngle = 104.5*Math.PI/180;
const bondLen   = 1.2;
const h1pos = new THREE.Vector3( Math.sin(bondAngle/2)*bondLen,-Math.cos(bondAngle/2)*bondLen,0);
const h2pos = new THREE.Vector3(-Math.sin(bondAngle/2)*bondLen,-Math.cos(bondAngle/2)*bondLen,0);

const h1=new THREE.Mesh(new THREE.SphereGeometry(0.53,24,24),hMat); h1.position.copy(h1pos); molGroup.add(h1);
const h2=new THREE.Mesh(new THREE.SphereGeometry(0.53,24,24),hMat); h2.position.copy(h2pos); molGroup.add(h2);

function addBond(a,b) {
  const d=b.clone().sub(a);
  const bond=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,d.length(),12),bondMat);
  bond.position.copy(a.clone().add(b).multiplyScalar(0.5));
  bond.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  molGroup.add(bond);
}
addBond(new THREE.Vector3(0,0,0),h1pos);
addBond(new THREE.Vector3(0,0,0),h2pos);

// Electron cloud (faint outer shell)
const cloud=new THREE.Mesh(
  new THREE.SphereGeometry(1.55,20,20),
  new THREE.MeshPhongMaterial({color:0x4488ff,transparent:true,opacity:0.07,side:THREE.BackSide})
);
cloud.scale.set(1,0.85,0.78); molGroup.add(cloud);

// Bond angle arc indicator
const arcPts=[];
for(let i=0;i<=24;i++){
  const f=i/24;
  const a=-bondAngle/2+f*bondAngle;
  arcPts.push(new THREE.Vector3(Math.sin(a)*0.55,-Math.cos(a)*0.55,0));
}
molGroup.add(new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(arcPts),
  new THREE.LineBasicMaterial({color:0xfbbf24,opacity:0.55,transparent:true})
));

scene.add(molGroup);
camera.position.set(0,0,4.5);
controls.target.set(0,-0.3,0);
function update(t) {
  molGroup.rotation.y = t*0.6;
  molGroup.rotation.x = Math.sin(t*0.4)*0.22;
}`,
  };

  const render3dProjectile: Render3DArtifact = {
    id: "a-r3d-proj", type: "render3d", title: "Projectile Motion", status: "rendered",
    topic: "Projectile Motion — Physics Simulation",
    camera_distance: 12,
    bg_color: "#060d1a",
    code: `
const v0=9.5, launchAngle=Math.PI*0.32, g=9.8;
const vx0=v0*Math.cos(launchAngle), vy0=v0*Math.sin(launchAngle);
const tFlight=2*vy0/g, xMax=vx0*tFlight, yMax=vy0*vy0/(2*g);
const cx=xMax/2;

camera.position.set(cx, yMax*0.8+2, 14);
controls.target.set(cx, yMax*0.25, 0);

// Ground plane
scene.add(new THREE.Mesh(
  new THREE.PlaneGeometry(xMax+10,16),
  new THREE.MeshPhongMaterial({color:0x1a2d50,opacity:0.65,transparent:true})
) );
scene.getObjectByName = ()=>null; // noop
const ground=scene.children[scene.children.length-1];
ground.rotation.x=-Math.PI/2; ground.position.set(cx,0,0);

// Grid
const grid=new THREE.GridHelper(Math.ceil(xMax+10),Math.ceil((xMax+10)/1),0x2a3a60,0x1e2a50);
grid.position.set(cx,0.01,0); scene.add(grid);

// Trajectory tube
const tPts=[];
for(let i=0;i<=100;i++){
  const tt=(i/100)*tFlight;
  tPts.push(new THREE.Vector3(vx0*tt, vy0*tt-0.5*g*tt*tt, 0));
}
scene.add(new THREE.Mesh(
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tPts),100,0.045,8,false),
  new THREE.MeshBasicMaterial({color:0x7c3aed,transparent:true,opacity:0.5})
));

// Launch angle indicator
const angPts=[];
for(let i=0;i<=16;i++){
  const a=i/16*launchAngle;
  angPts.push(new THREE.Vector3(Math.cos(a)*1.4,Math.sin(a)*1.4,0));
}
scene.add(new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(angPts),
  new THREE.LineBasicMaterial({color:0xfbbf24,opacity:0.5,transparent:true})
));

// Ball
const ball=new THREE.Mesh(
  new THREE.SphereGeometry(0.28,20,20),
  new THREE.MeshPhongMaterial({color:0xf97316,emissive:0x7a2800,shininess:90})
);
scene.add(ball);

// Velocity arrow
const velArrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0.28,0),1.5,0xfbbf24,0.3,0.18);
scene.add(velArrow);

// Drop lines
const vLinePts=[new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,0)];
const hLinePts=[new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,0)];
const dropLineMat=new THREE.LineBasicMaterial({color:0x4466aa,opacity:0.45,transparent:true});
const dropVGeo=new THREE.BufferGeometry().setFromPoints(vLinePts);
const dropHGeo=new THREE.BufferGeometry().setFromPoints(hLinePts);
const dropV=new THREE.Line(dropVGeo,dropLineMat);
const dropH=new THREE.Line(dropHGeo,dropLineMat);
scene.add(dropV); scene.add(dropH);

function update(t) {
  const elapsed=t%(tFlight+1.8);
  const inFlight=Math.min(elapsed,tFlight);
  const bx=vx0*inFlight;
  const by=Math.max(0,vy0*inFlight-0.5*g*inFlight*inFlight);
  ball.position.set(bx,by+0.28,0);

  const curVy=vy0-g*inFlight;
  const speed=Math.sqrt(vx0*vx0+curVy*curVy);
  velArrow.position.copy(ball.position);
  velArrow.setDirection(new THREE.Vector3(vx0,Math.max(curVy,-5),0).normalize());
  velArrow.setLength(Math.min(speed*0.18,3),0.28,0.16);

  const vp=dropVGeo.attributes.position;
  vp.setXYZ(0,bx,by+0.28,0); vp.setXYZ(1,bx,0.02,0); vp.needsUpdate=true;
  const hp=dropHGeo.attributes.position;
  hp.setXYZ(0,0.02,by+0.28,0); hp.setXYZ(1,bx,by+0.28,0); hp.needsUpdate=true;
}`,
  };

  const render3dNaCl: Render3DArtifact = {
    id: "a-r3d-nacl", type: "render3d", title: "NaCl Crystal Lattice", status: "rendered",
    topic: "Ionic Crystal Lattice — Sodium Chloride",
    camera_distance: 9,
    bg_color: "#07080f",
    code: `
const GRID=2, SPACING=1.15;
let naCnt=0, clCnt=0;
for(let ix=-GRID;ix<=GRID;ix++)
  for(let iy=-GRID;iy<=GRID;iy++)
    for(let iz=-GRID;iz<=GRID;iz++)
      if((ix+iy+iz)%2===0) naCnt++; else clCnt++;

const naMesh=new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.22,12,12),
  new THREE.MeshPhongMaterial({color:0x7c3aed,shininess:80}), naCnt);
const clMesh=new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.29,12,12),
  new THREE.MeshPhongMaterial({color:0x10b981,shininess:60}), clCnt);
naMesh.castShadow=true; clMesh.castShadow=true;

const dummy=new THREE.Object3D();
let naIdx=0, clIdx=0;
const bondPts=[];

for(let ix=-GRID;ix<=GRID;ix++) {
  for(let iy=-GRID;iy<=GRID;iy++) {
    for(let iz=-GRID;iz<=GRID;iz++) {
      const isNa=(ix+iy+iz)%2===0;
      dummy.position.set(ix*SPACING,iy*SPACING,iz*SPACING);
      dummy.updateMatrix();
      if(isNa) naMesh.setMatrixAt(naIdx++,dummy.matrix);
      else     clMesh.setMatrixAt(clIdx++,dummy.matrix);
      for(const [dx,dy,dz] of [[1,0,0],[0,1,0],[0,0,1]]) {
        if(ix+dx>GRID||iy+dy>GRID||iz+dz>GRID) continue;
        bondPts.push(
          new THREE.Vector3(ix*SPACING,     iy*SPACING,     iz*SPACING),
          new THREE.Vector3((ix+dx)*SPACING,(iy+dy)*SPACING,(iz+dz)*SPACING)
        );
      }
    }
  }
}
naMesh.instanceMatrix.needsUpdate=true;
clMesh.instanceMatrix.needsUpdate=true;

const bonds=new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(bondPts),
  new THREE.LineBasicMaterial({color:0x2a3a66,opacity:0.35,transparent:true})
);

const latticeGroup=new THREE.Group();
latticeGroup.add(naMesh,clMesh,bonds);
scene.add(latticeGroup);
camera.position.set(9,6,9);
controls.target.set(0,0,0);

function update(t) {
  latticeGroup.rotation.y=t*0.2;
  latticeGroup.rotation.x=Math.sin(t*0.13)*0.18;
}`,
  };

  const render3dCell: Render3DArtifact = {
    id: "a-r3d-cell", type: "render3d", title: "Animal Cell", status: "rendered",
    topic: "Animal Cell — Organelle Anatomy",
    camera_distance: 8,
    bg_color: "#060810",
    code: `
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

const BASE = 'https://raw.githubusercontent.com/erick1439/3d-Cell-Model/master/public/cellModel/';

const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(200,230,255,0.5);font:13px system-ui;letter-spacing:0.05em;pointer-events:none';
hint.textContent = 'Loading cell model…';
document.body.appendChild(hint);

const cellGroup = new THREE.Group();
scene.add(cellGroup);

// Extra fill light to bring out the organelle colours
const fillA = new THREE.PointLight(0x80c0ff, 0.7, 30);
fillA.position.set(4, 5, 4); scene.add(fillA);
const fillB = new THREE.PointLight(0xff80a0, 0.4, 20);
fillB.position.set(-4, -3, -4); scene.add(fillB);

const mtlLoader = new MTLLoader();
mtlLoader.setResourcePath(BASE);

function loadObj(materials) {
  const objLoader = new OBJLoader();
  if (materials) objLoader.setMaterials(materials);
  objLoader.load(BASE + 'CellAnatomy.obj', function(object) {
    // Auto-center then scale to fit comfortably
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const scale  = 5.5 / Math.max(size.x, size.y, size.z);
    const wrapper = new THREE.Group();
    object.position.set(-center.x, -center.y, -center.z);
    wrapper.scale.setScalar(scale);
    wrapper.add(object);
    cellGroup.add(wrapper);
    hint.remove();
  }, undefined, function(err) {
    hint.textContent = 'Model unavailable';
    window.parent.postMessage({ type:'render3d_error', message:'OBJ load failed' }, '*');
  });
}

mtlLoader.load(BASE + 'CellAnatomy.mtl', function(materials) {
  materials.preload(); loadObj(materials);
}, undefined, function() { loadObj(null); }); // fallback: load without materials

camera.position.set(0, 2, 9);
controls.target.set(0, 0, 0);

function update(t) {
  cellGroup.rotation.y = t * 0.12;
  cellGroup.rotation.x = Math.sin(t * 0.09) * 0.1;
}`,
  };

  // ─── Layout ───────────────────────────────────────────────────────────────
  // 6 groups × 2 artifact elements + 1 standalone text + 1 standalone sticky

  const Y = CANVAS_START_Y;
  const GAP_ELEM = ELEM_GAP;
  const GAP_GROUP = 80;

  function place2(
    id0: string, t0: ElementType, art0: CanvasArtifact,
    id1: string, t1: ElementType, art1: CanvasArtifact,
    gId: string, startX: number, z: number,
  ): [CanvasElement[], number] {
    const w0 = ELEM_WIDTHS[t0] ?? 360;
    const w1 = ELEM_WIDTHS[t1] ?? 360;
    const els: CanvasElement[] = [
      { id: id0, type: t0, x: startX,                 y: Y, w: w0, groupId: gId, zIndex: z,   createdAt: Date.now() + z,   artifact: art0 },
      { id: id1, type: t1, x: startX + w0 + GAP_ELEM, y: Y, w: w1, groupId: gId, zIndex: z+1, createdAt: Date.now() + z+1, artifact: art1 },
    ];
    return [els, startX + w0 + GAP_ELEM + w1];
  }

  let cursor = 80;
  const [els0, r0] = place2("el-00", "visual",     artConceptMap, "el-01", "flashcard",  artFlashcard,  "grp-0", cursor,  1);
  cursor = r0 + GAP_GROUP;
  const [els1, r1] = place2("el-10", "notation",   artNotation,   "el-11", "graph",      artGraph,      "grp-1", cursor,  3);
  cursor = r1 + GAP_GROUP;
  const [els2, r2] = place2("el-20", "visual",     artTimeline,   "el-21", "graph",      artGraph2,     "grp-2", cursor,  5);
  cursor = r2 + GAP_GROUP;
  const [els3, r3] = place2("el-30", "visual",     artComparison, "el-31", "lookup",     artLookup,     "grp-3", cursor,  7);
  cursor = r3 + GAP_GROUP;
  const [els4, r4] = place2("el-40", "visual",     artDiagram,    "el-41", "simulation", artSimulation, "grp-4", cursor,  9);
  cursor = r4 + GAP_GROUP;
  const [els5, r5] = place2("el-50", "visual",     artFlowchart,  "el-51", "visual",     artHierarchy,  "grp-5", cursor, 11);

  // Standalone text heading (above grp-0)
  const elText: CanvasElement = {
    id: "el-text", type: "text",
    x: 80, y: CANVAS_START_Y - 80, w: ELEM_WIDTHS.text,
    zIndex: 0, createdAt: Date.now(),
    text: { content: t, style: "heading" },
  };

  // Standalone sticky (above grp-5, far right)
  const elSticky: CanvasElement = {
    id: "el-sticky", type: "sticky",
    x: r5 - ELEM_WIDTHS.sticky, y: CANVAS_START_Y - 110, w: ELEM_WIDTHS.sticky,
    zIndex: 1, createdAt: Date.now() + 1,
    sticky: { content: "Double-click anywhere on the canvas to ask a doubt!", color: "#fef08a" },
  };

  // ─── Row 2: chart gallery ─────────────────────────────────────────────────
  const ROW2_Y = CANVAS_START_Y + 620;
  const GW = ELEM_WIDTHS.graph; // 380
  const GGAP = 64; // gap between chart groups
  const chartArtifacts: [string, string, GraphArtifact][] = [
    ["el-g0",  "grp-g0",  grLine],
    ["el-g1",  "grp-g1",  grArea],
    ["el-g2",  "grp-g2",  grScatter],
    ["el-g3",  "grp-g3",  grTrend],
    ["el-g4",  "grp-g4",  grForecast],
    ["el-g5",  "grp-g5",  grParametric],
    ["el-g6",  "grp-g6",  grBar],
    ["el-g7",  "grp-g7",  grPie],
    ["el-g8",  "grp-g8",  grPolar],
    ["el-g9",  "grp-g9",  grBox],
    ["el-g10", "grp-g10", grViolin],
    ["el-g11", "grp-g11", grDensity],
  ];
  let cursor2 = 80;
  const row2Els: CanvasElement[] = chartArtifacts.map(([elId, grpId, art], i) => {
    const el: CanvasElement = {
      id: elId, type: "graph",
      x: cursor2, y: ROW2_Y, w: GW,
      groupId: grpId, zIndex: 100 + i,
      createdAt: Date.now() + 100 + i,
      artifact: art,
    };
    cursor2 += GW + GGAP;
    return el;
  });

  // Row 2 label
  const elRow2Label: CanvasElement = {
    id: "el-row2-label", type: "text",
    x: 80, y: ROW2_Y - 60, w: 480,
    zIndex: 0, createdAt: Date.now() + 99,
    text: { content: "Chart Gallery", style: "heading" },
  };

  // ─── Row 3: 3D render gallery ─────────────────────────────────────────────
  const ROW3_Y = ROW2_Y + 740;
  const RW = ELEM_WIDTHS.render3d; // 380
  const RGAP = 64;
  const renderDemos: [string, string, Render3DArtifact][] = [
    ["el-r0", "grp-r0", render3dHeart],
    ["el-r1", "grp-r1", render3dDNA],
    ["el-r2", "grp-r2", render3dWater],
    ["el-r3", "grp-r3", render3dProjectile],
    ["el-r4", "grp-r4", render3dNaCl],
    ["el-r5", "grp-r5", render3dCell],
  ];
  let cursor3 = 80;
  const row3Els: CanvasElement[] = renderDemos.map(([elId, grpId, art], i) => {
    const el: CanvasElement = {
      id: elId, type: "render3d",
      x: cursor3, y: ROW3_Y, w: RW,
      groupId: grpId, zIndex: 200 + i,
      createdAt: Date.now() + 200 + i,
      artifact: art,
    };
    cursor3 += RW + RGAP;
    return el;
  });

  const elRow3Label: CanvasElement = {
    id: "el-row3-label", type: "text",
    x: 80, y: ROW3_Y - 60, w: 560,
    zIndex: 0, createdAt: Date.now() + 199,
    text: { content: "3D Render Gallery", style: "heading" },
  };

  return {
    elements: [...els0, ...els1, ...els2, ...els3, ...els4, ...els5, elText, elSticky, elRow2Label, ...row2Els, elRow3Label, ...row3Els],
    groups,
    connections: [
      { id: "c-01",  fromModuleId: "grp-0",  toModuleId: "grp-1" },
      { id: "c-12",  fromModuleId: "grp-1",  toModuleId: "grp-2" },
      { id: "c-23",  fromModuleId: "grp-2",  toModuleId: "grp-3" },
      { id: "c-34",  fromModuleId: "grp-3",  toModuleId: "grp-4" },
      { id: "c-45",  fromModuleId: "grp-4",  toModuleId: "grp-5" },
      // Row 2 chain
      { id: "c-g01", fromModuleId: "grp-g0",  toModuleId: "grp-g1" },
      { id: "c-g12", fromModuleId: "grp-g1",  toModuleId: "grp-g2" },
      { id: "c-g23", fromModuleId: "grp-g2",  toModuleId: "grp-g3" },
      { id: "c-g34", fromModuleId: "grp-g3",  toModuleId: "grp-g4" },
      { id: "c-g45", fromModuleId: "grp-g4",  toModuleId: "grp-g5" },
      { id: "c-g56", fromModuleId: "grp-g5",  toModuleId: "grp-g6" },
      { id: "c-g67", fromModuleId: "grp-g6",  toModuleId: "grp-g7" },
      { id: "c-g78", fromModuleId: "grp-g7",  toModuleId: "grp-g8" },
      { id: "c-g89", fromModuleId: "grp-g8",  toModuleId: "grp-g9" },
      { id: "c-g9a", fromModuleId: "grp-g9",  toModuleId: "grp-g10" },
      { id: "c-gab", fromModuleId: "grp-g10", toModuleId: "grp-g11" },
      // Row 3 chain
      { id: "c-r01", fromModuleId: "grp-r0", toModuleId: "grp-r1" },
      { id: "c-r12", fromModuleId: "grp-r1", toModuleId: "grp-r2" },
      { id: "c-r23", fromModuleId: "grp-r2", toModuleId: "grp-r3" },
      { id: "c-r34", fromModuleId: "grp-r3", toModuleId: "grp-r4" },
      { id: "c-r45", fromModuleId: "grp-r4", toModuleId: "grp-r5" },
    ],
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
  elements: [],
  groups: [],
  connections: [],
  strokes: [],
  toasts: [],
  updates: [],
  selectedElementIds: [],
  isMockMode: false,
  pendingModule: null,

  // ── Element actions ─────────────────────────────────────────────────────────

  addElement: (el) =>
    set((s) => ({
      elements: [...s.elements, { birthScale: getBirthScale(), ...el }],
    })),

  addPendingElement: (el) =>
    set((s) => ({
      elements: [...s.elements, { birthScale: getBirthScale(), ...el, pending: true }],
    })),

  resolvePendingElement: (id, artifact) =>
    set((s) => ({
      elements: s.elements.map((e) => {
        if (e.id !== id) return e;
        const next: CanvasElement = {
          ...e,
          pending: false,
          artifact,
          type: artifact.type as ElementType,
        };
        // Diagrams expand to their natural intrinsic width so fonts stay readable.
        if (artifact.type === "diagram") {
          next.w = Math.max(e.w, resolveArtifactWidth(artifact));
        }
        return next;
      }),
    })),

  moveElement: (id, x, y) =>
    set((s) => ({ elements: s.elements.map((e) => e.id === id ? { ...e, x, y } : e) })),

  setElementHeight: (id, h) =>
    set((s) => ({
      elements: s.elements.map((e) => e.id === id && e.h !== h ? { ...e, h } : e),
    })),

  removeElement: (id) =>
    set((s) => ({
      elements: s.elements.filter((e) => e.id !== id),
      selectedElementIds: s.selectedElementIds.filter((i) => i !== id),
    })),

  updateElementText: (id, content) =>
    set((s) => ({
      elements: s.elements.map((e) =>
        e.id === id && e.text ? { ...e, text: { ...e.text, content } } : e,
      ),
    })),

  updateStickyContent: (id, content) =>
    set((s) => ({
      elements: s.elements.map((e) =>
        e.id === id && e.sticky ? { ...e, sticky: { ...e.sticky, content } } : e,
      ),
    })),

  // ── Group actions ────────────────────────────────────────────────────────────

  groupSelected: (name) =>
    set((s) => {
      if (s.selectedElementIds.length < 2) return s;
      const groupId = `grp-${uid()}`;
      const color = GROUP_COLORS[s.groups.length % GROUP_COLORS.length];
      const group: CanvasGroup = {
        id: groupId, name, color,
        orderIndex: s.groups.length,
        createdAt: Date.now(),
      };
      return {
        groups: [...s.groups, group],
        elements: s.elements.map((e) =>
          s.selectedElementIds.includes(e.id) ? { ...e, groupId } : e,
        ),
        selectedElementIds: [],
      };
    }),

  ungroupElements: (groupId) =>
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== groupId),
      elements: s.elements.map((e) =>
        e.groupId === groupId ? { ...e, groupId: undefined } : e,
      ),
      connections: s.connections.filter(
        (c) => c.fromModuleId !== groupId && c.toModuleId !== groupId,
      ),
    })),

  // ── Selection ────────────────────────────────────────────────────────────────

  selectElements: (ids) => set({ selectedElementIds: ids }),

  toggleElementSelected: (id) =>
    set((s) => {
      const has = s.selectedElementIds.includes(id);
      return {
        selectedElementIds: has
          ? s.selectedElementIds.filter((x) => x !== id)
          : [...s.selectedElementIds, id],
      };
    }),

  clearSelection: () => set({ selectedElementIds: [] }),

  // ── addModule: high-level (called by AI chat) ─────────────────────────────

  addModule: (title, artifacts, _crumbs, writtenText) =>
    set((s) => {
      const groupIdx = s.groups.length;
      const groupId = `grp-${uid()}`;
      const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

      const group: CanvasGroup = {
        id: groupId, name: title, color,
        orderIndex: groupIdx, createdAt: Date.now(),
      };

      const startX = nextGroupStartX(s.elements);
      const zBase = groupIdx * 100;

      // Text element at top of group (tutor's written explanation)
      const textEl: CanvasElement | null = writtenText
        ? {
            id: `el-txt-${uid()}`,
            type: "text",
            x: startX,
            y: CANVAS_START_Y,
            w: Math.max(ELEM_WIDTHS.text ?? 480, (ELEM_WIDTHS[artifacts[0]?.type] ?? 360) * Math.min(artifacts.length, 2) + ELEM_GAP * (Math.min(artifacts.length, 2) - 1)),
            groupId,
            zIndex: zBase,
            createdAt: Date.now(),
            text: { content: writtenText, style: "body" },
            birthScale: getBirthScale(),
          }
        : null;

      // Lay out artifacts below the text element
      const artifactStartY = textEl
        ? CANVAS_START_Y + (ELEM_H_EST.text ?? 52) + ELEM_GAP
        : CANVAS_START_Y;

      const newEls = layoutArtifacts(artifacts, groupId, startX, artifactStartY, zBase + 1);

      // Connect to previous group
      const prevGroup = s.groups[groupIdx - 1];
      const newConn: ModuleConnection | null = prevGroup
        ? { id: `conn-${uid()}`, fromModuleId: prevGroup.id, toModuleId: groupId }
        : null;

      const updateEvent: CanvasUpdateEvent = {
        id: `upd-${uid()}`,
        type: "module_added",
        title: `Added: ${title}`,
        detail: `${artifacts.length} artifact${artifacts.length !== 1 ? "s" : ""}${writtenText ? " + explanation" : ""} on canvas`,
        timestamp: Date.now(),
        moduleId: groupId,
      };

      const allNewEls = textEl ? [textEl, ...newEls] : newEls;

      return {
        groups: [...s.groups, group],
        elements: [...s.elements, ...allNewEls],
        connections: newConn ? [...s.connections, newConn] : s.connections,
        updates: [...s.updates, updateEvent],
      };
    }),

  // ── Pending module (transient state during a streaming AI turn) ─────────────

  startPendingModule: () =>
    set({ pendingModule: { elementIds: [], title: null, startedAt: Date.now() } }),

  addToPendingModule: (elementId) =>
    set((s) => {
      if (!s.pendingModule) {
        return { pendingModule: { elementIds: [elementId], title: null, startedAt: Date.now() } };
      }
      if (s.pendingModule.elementIds.includes(elementId)) return s;
      return { pendingModule: { ...s.pendingModule, elementIds: [...s.pendingModule.elementIds, elementId] } };
    }),

  setPendingModuleTitle: (title) =>
    set((s) => (s.pendingModule ? { pendingModule: { ...s.pendingModule, title } } : s)),

  clearPendingModule: () => set({ pendingModule: null }),

  // ── Connections ──────────────────────────────────────────────────────────────

  addConnection: (conn) => set((s) => ({ connections: [...s.connections, conn] })),

  removeConnection: (id) =>
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })),

  // ── Strokes ──────────────────────────────────────────────────────────────────

  addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),
  clearStrokes: () => set({ strokes: [] }),

  // ── Toasts ───────────────────────────────────────────────────────────────────

  addToast: (toast) => set((s) => ({ toasts: [...s.toasts, toast] })),
  updateToast: (id, status) =>
    set((s) => ({ toasts: s.toasts.map((t) => t.id === id ? { ...t, status } : t) })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ── Updates feed ─────────────────────────────────────────────────────────────

  addUpdate: (event) =>
    set((s) => ({ updates: [...s.updates.slice(-49), event] })),

  // ── Mock ─────────────────────────────────────────────────────────────────────

  setMockMode: (isMockMode) => set({ isMockMode }),

  loadMockData: (topic) => {
    const t = topic || "Learning";
    const { elements, groups, connections } = buildMockCanvas(t);
    set({
      elements,
      groups,
      connections,
      strokes: [],
      isMockMode: true,
      selectedElementIds: [],
      updates: [{
        id: `upd-mock-${uid()}`,
        type: "module_added",
        title: "Mock canvas loaded",
        detail: `${groups.length} groups · ${elements.length} elements`,
        timestamp: Date.now(),
      }],
    });
  },

  // ── Reset ────────────────────────────────────────────────────────────────────

  clearCanvas: () =>
    set({ elements: [], groups: [], connections: [], updates: [], selectedElementIds: [], strokes: [], pendingModule: null }),
    }),
    {
      name: "synapse-canvas",
      storage: createJSONStorage(() => localStorage),
      // Persist the whiteboard content; exclude transient/ephemeral state
      partialize: (s) => ({
        elements: s.elements,
        groups: s.groups,
        connections: s.connections,
        updates: s.updates,
      }),
    },
  ),
);
