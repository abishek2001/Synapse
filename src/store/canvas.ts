import { create } from "zustand";
import type {
  CanvasArtifact,
  FlashcardArtifact,
  NotationArtifact,
  GraphArtifact,
  VisualArtifact,
  LookupArtifact,
  SimulationArtifact,
} from "@/lib/tools/types";

// ─── Element sizing ────────────────────────────────────────────────────────────

export const ELEM_WIDTHS: Record<string, number> = {
  flashcard:  360,
  graph:      380,
  notation:   360,
  visual:     380,
  lookup:     360,
  simulation: 400,
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
  text:        52,
  sticky:     170,
};

export function estimateElemH(type: string): number {
  return ELEM_H_EST[type] ?? 240;
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
  | "lookup" | "simulation" | "text" | "sticky" | "stroke";

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

interface CanvasState {
  elements: CanvasElement[];
  groups: CanvasGroup[];
  connections: ModuleConnection[];
  strokes: CanvasStroke[];
  toasts: ArtifactToast[];
  updates: CanvasUpdateEvent[];
  selectedElementIds: string[];
  isMockMode: boolean;

  // Element actions
  addElement: (el: CanvasElement) => void;
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
  addModule: (title: string, artifacts: CanvasArtifact[], crumbs?: Crumb[]) => void;

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

  for (let i = 0; i < artifacts.length; i++) {
    const art = artifacts[i];
    const w = ELEM_WIDTHS[art.type] ?? 360;
    const h = estimateElemH(art.type);

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
    { id: "grp-0", name: `Introduction to ${t}`, color: GROUP_COLORS[0], orderIndex: 0, createdAt: Date.now() },
    { id: "grp-1", name: "Math & Equations",      color: GROUP_COLORS[1], orderIndex: 1, createdAt: Date.now() + 1 },
    { id: "grp-2", name: "Timeline",              color: GROUP_COLORS[2], orderIndex: 2, createdAt: Date.now() + 2 },
    { id: "grp-3", name: "Comparison",            color: GROUP_COLORS[3], orderIndex: 3, createdAt: Date.now() + 3 },
    { id: "grp-4", name: "System Diagram",        color: GROUP_COLORS[4], orderIndex: 4, createdAt: Date.now() + 4 },
    { id: "grp-5", name: "Hierarchy",             color: GROUP_COLORS[0], orderIndex: 5, createdAt: Date.now() + 5 },
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
    id: "a-gr", type: "graph", title: "Behavior Over Time", status: "rendered",
    graph_type: "line",
    expressions: [
      { fn: "Math.sin(x)", label: "Primary", color: "#7c3aed" },
      { fn: "Math.sin(x) * Math.exp(-x * 0.2)", label: "Damped", color: "#0ea5e9" },
    ],
    x_range: [-1, 12], x_label: "Time", y_label: "Amplitude",
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
    graph_type: "line",
    expressions: [
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

  return {
    elements: [...els0, ...els1, ...els2, ...els3, ...els4, ...els5, elText, elSticky],
    groups,
    connections: [
      { id: "c-01", fromModuleId: "grp-0", toModuleId: "grp-1" },
      { id: "c-12", fromModuleId: "grp-1", toModuleId: "grp-2" },
      { id: "c-23", fromModuleId: "grp-2", toModuleId: "grp-3" },
      { id: "c-34", fromModuleId: "grp-3", toModuleId: "grp-4" },
      { id: "c-45", fromModuleId: "grp-4", toModuleId: "grp-5" },
    ],
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCanvasStore = create<CanvasState>((set, get) => ({
  elements: [],
  groups: [],
  connections: [],
  strokes: [],
  toasts: [],
  updates: [],
  selectedElementIds: [],
  isMockMode: false,

  // ── Element actions ─────────────────────────────────────────────────────────

  addElement: (el) => set((s) => ({ elements: [...s.elements, el] })),

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

  addModule: (title, artifacts, _crumbs) =>
    set((s) => {
      const groupIdx = s.groups.length;
      const groupId = `grp-${uid()}`;
      const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

      const group: CanvasGroup = {
        id: groupId, name: title, color,
        orderIndex: groupIdx, createdAt: Date.now(),
      };

      const startX = nextGroupStartX(s.elements);
      const newEls = layoutArtifacts(artifacts, groupId, startX, CANVAS_START_Y, groupIdx * 100);

      // Connect to previous group
      const prevGroup = s.groups[groupIdx - 1];
      const newConn: ModuleConnection | null = prevGroup
        ? { id: `conn-${uid()}`, fromModuleId: prevGroup.id, toModuleId: groupId }
        : null;

      const updateEvent: CanvasUpdateEvent = {
        id: `upd-${uid()}`,
        type: "module_added",
        title: `Added: ${title}`,
        detail: `${artifacts.length} artifact${artifacts.length !== 1 ? "s" : ""} on canvas`,
        timestamp: Date.now(),
        moduleId: groupId,
      };

      return {
        groups: [...s.groups, group],
        elements: [...s.elements, ...newEls],
        connections: newConn ? [...s.connections, newConn] : s.connections,
        updates: [...s.updates, updateEvent],
      };
    }),

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
    set({ elements: [], groups: [], connections: [], updates: [], selectedElementIds: [], strokes: [] }),
}));
