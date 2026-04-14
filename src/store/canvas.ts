import { create } from "zustand";
import type {
  CanvasArtifact,
  FlashcardArtifact,
  NotationArtifact,
  GraphArtifact,
  VisualArtifact,
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
  const groups: CanvasGroup[] = [
    { id: "grp-0", name: `Introduction to ${t}`,   color: GROUP_COLORS[0], orderIndex: 0, createdAt: Date.now() + 0 },
    { id: "grp-1", name: "Core Concepts",            color: GROUP_COLORS[1], orderIndex: 1, createdAt: Date.now() + 1 },
    { id: "grp-2", name: "Behavior & Equations",     color: GROUP_COLORS[2], orderIndex: 2, createdAt: Date.now() + 2 },
    { id: "grp-3", name: "Practical Examples",       color: GROUP_COLORS[3], orderIndex: 3, createdAt: Date.now() + 3 },
    { id: "grp-4", name: "Advanced Topics",          color: GROUP_COLORS[4], orderIndex: 4, createdAt: Date.now() + 4 },
  ];

  // ─ Artifacts ─────────────────────────────────────────────────────────────
  const art00: FlashcardArtifact = {
    id: "a-00", type: "flashcard", title: `${t} Basics`, status: "rendered",
    cards: [
      { front: "What is this?", back: `${t} is a foundational concept that unlocks a chain of deeper ideas.` },
      { front: "Why it matters", back: "A strong foundation here makes advanced topics much more intuitive." },
      { front: "Quick check", back: "Can you explain this in one sentence without looking?" },
    ],
  };

  const art01: VisualArtifact = {
    id: "a-01", type: "visual", title: "Concept Overview", status: "rendered",
    description: `High-level map of ${t}`,
    style: "concept_map",
    svgContent: `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
      <rect x="70" y="10" width="60" height="28" rx="6" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.5"/>
      <text x="100" y="28" text-anchor="middle" font-size="9" fill="#7c3aed" font-weight="600">${t.slice(0,10)}</text>
      <line x1="100" y1="38" x2="40" y2="76" stroke="#7c3aed" stroke-width="1" opacity="0.4"/>
      <line x1="100" y1="38" x2="100" y2="76" stroke="#7c3aed" stroke-width="1" opacity="0.4"/>
      <line x1="100" y1="38" x2="160" y2="76" stroke="#7c3aed" stroke-width="1" opacity="0.4"/>
      <rect x="10" y="76" width="60" height="24" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="40" y="91" text-anchor="middle" font-size="8" fill="#0ea5e9">Concepts</text>
      <rect x="70" y="76" width="60" height="24" rx="4" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1"/>
      <text x="100" y="91" text-anchor="middle" font-size="8" fill="#10b981">Methods</text>
      <rect x="130" y="76" width="60" height="24" rx="4" fill="#f97316" opacity="0.12" stroke="#f97316" stroke-width="1"/>
      <text x="160" y="91" text-anchor="middle" font-size="8" fill="#f97316">Examples</text>
    </svg>`,
  };

  const art10: NotationArtifact = {
    id: "a-10", type: "notation", title: "Core Formula", status: "rendered",
    latex: "f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n",
    annotation: "This series expansion is central to understanding the topic.",
  };

  const art11: FlashcardArtifact = {
    id: "a-11", type: "flashcard", title: "Core Concepts Quiz", status: "rendered",
    cards: [
      { front: "What is the main principle?", back: "Complex systems can be understood by decomposing them into simpler, well-understood components." },
      { front: "Name 3 key properties", back: "1. Composition — parts combine\n2. Abstraction — hide complexity\n3. Modularity — swappable units" },
    ],
  };

  const art20: GraphArtifact = {
    id: "a-20", type: "graph", title: "Behavior Over Time", status: "rendered",
    graph_type: "line",
    expressions: [
      { fn: "Math.sin(x)", label: "Primary wave", color: "#7c3aed" },
      { fn: "Math.sin(x) * Math.exp(-x * 0.2)", label: "Damped", color: "#0ea5e9" },
    ],
    x_range: [-1, 12], x_label: "Time", y_label: "Amplitude",
  };

  const art21: NotationArtifact = {
    id: "a-21", type: "notation", title: "Wave Equation", status: "rendered",
    latex: "\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\nabla^2 u",
    annotation: "The wave equation governs propagation through a medium.",
  };

  const art30: FlashcardArtifact = {
    id: "a-30", type: "flashcard", title: "Applied Examples", status: "rendered",
    cards: [
      { front: "Real-world application 1", back: "In engineering: used to model stress distribution in materials under load." },
      { front: "Real-world application 2", back: "In biology: models population growth and decay in ecological systems." },
      { front: "How to approach problems", back: "1. Identify the system\n2. Write governing equations\n3. Apply boundary conditions\n4. Solve and interpret" },
    ],
  };

  const art31: VisualArtifact = {
    id: "a-31", type: "visual", title: "Problem-Solving Flow", status: "rendered",
    description: "Step-by-step process",
    style: "flowchart",
    svgContent: `<svg viewBox="0 0 160 180" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="8"   width="80" height="24" rx="4" fill="#7c3aed" opacity="0.15" stroke="#7c3aed" stroke-width="1.5"/>
      <text x="80" y="23" text-anchor="middle" font-size="8" fill="#7c3aed" font-weight="600">Identify</text>
      <line x1="80" y1="32" x2="80" y2="48" stroke="#7c3aed" stroke-width="1" opacity="0.4"/>
      <rect x="40" y="48"  width="80" height="24" rx="4" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" stroke-width="1"/>
      <text x="80" y="63" text-anchor="middle" font-size="8" fill="#0ea5e9">Model</text>
      <line x1="80" y1="72" x2="80" y2="88" stroke="#0ea5e9" stroke-width="1" opacity="0.4"/>
      <rect x="40" y="88"  width="80" height="24" rx="4" fill="#10b981" opacity="0.12" stroke="#10b981" stroke-width="1"/>
      <text x="80" y="103" text-anchor="middle" font-size="8" fill="#10b981">Solve</text>
      <line x1="80" y1="112" x2="80" y2="128" stroke="#10b981" stroke-width="1" opacity="0.4"/>
      <rect x="40" y="128" width="80" height="24" rx="4" fill="#f97316" opacity="0.12" stroke="#f97316" stroke-width="1"/>
      <text x="80" y="143" text-anchor="middle" font-size="8" fill="#f97316">Interpret</text>
    </svg>`,
  };

  const art40: GraphArtifact = {
    id: "a-40", type: "graph", title: "Advanced Relationship", status: "rendered",
    graph_type: "line",
    expressions: [
      { fn: "x * x * 0.5",              label: "Quadratic", color: "#7c3aed" },
      { fn: "Math.log(x + 1) * 30",      label: "Logarithmic", color: "#10b981" },
      { fn: "x * 6",                     label: "Linear",    color: "#0ea5e9" },
    ],
    x_range: [0, 10], x_label: "Input", y_label: "Output",
  };

  const art41: FlashcardArtifact = {
    id: "a-41", type: "flashcard", title: "Advanced Topics", status: "rendered",
    cards: [
      { front: "What separates beginners from experts?", back: "Experts recognize patterns across domains and apply known solutions to novel problems by analogy." },
      { front: "Next steps to mastery", back: "1. Teach it to someone else\n2. Solve problems from scratch\n3. Find the edge cases" },
    ],
  };

  // ─ Layout: horizontal row of groups ─────────────────────────────────────
  // Each group is placed to the right of the previous one.
  // Within a group, 2 artifacts sit side-by-side (2-col layout).
  const Y = CANVAS_START_Y;
  const GAP_ELEM = ELEM_GAP;      // gap between elements within a group
  const GAP_GROUP = 80;           // gap between groups

  // Helper: place 2 elements side-by-side starting at x
  function place2(
    id0: string, t0: ElementType, art0: CanvasArtifact,
    id1: string, t1: ElementType, art1: CanvasArtifact,
    gId: string, startX: number, z: number,
  ): [CanvasElement[], number] {
    const w0 = ELEM_WIDTHS[t0] ?? 360;
    const w1 = ELEM_WIDTHS[t1] ?? 360;
    const els: CanvasElement[] = [
      { id: id0, type: t0, x: startX,               y: Y, w: w0, groupId: gId, zIndex: z,   createdAt: Date.now() + z,   artifact: art0 },
      { id: id1, type: t1, x: startX + w0 + GAP_ELEM, y: Y, w: w1, groupId: gId, zIndex: z+1, createdAt: Date.now() + z+1, artifact: art1 },
    ];
    return [els, startX + w0 + GAP_ELEM + w1]; // returns right edge
  }

  let cursor = 80; // current x position
  const [els0, r0] = place2("el-00", "flashcard", art00, "el-01", "visual",    art01, "grp-0", cursor, 1);
  cursor = r0 + GAP_GROUP;
  const [els1, r1] = place2("el-10", "notation",  art10, "el-11", "flashcard", art11, "grp-1", cursor, 3);
  cursor = r1 + GAP_GROUP;
  const [els2, r2] = place2("el-20", "graph",     art20, "el-21", "notation",  art21, "grp-2", cursor, 5);
  cursor = r2 + GAP_GROUP;
  const [els3, r3] = place2("el-30", "flashcard", art30, "el-31", "visual",    art31, "grp-3", cursor, 7);
  cursor = r3 + GAP_GROUP;
  const [els4]     = place2("el-40", "graph",     art40, "el-41", "flashcard", art41, "grp-4", cursor, 9);

  const elements: CanvasElement[] = [...els0, ...els1, ...els2, ...els3, ...els4];

  const connections: ModuleConnection[] = [
    { id: "c-01", fromModuleId: "grp-0", toModuleId: "grp-1" },
    { id: "c-02", fromModuleId: "grp-0", toModuleId: "grp-2" },
    { id: "c-13", fromModuleId: "grp-1", toModuleId: "grp-3" },
    { id: "c-24", fromModuleId: "grp-2", toModuleId: "grp-4" },
  ];

  return { elements, groups, connections };
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
