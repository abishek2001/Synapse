import type { DiagramArtifact, DiagramNode, DiagramEdge } from "./tools/types";

// ─── Layout constants ──────────────────────────────────────────────────────────

export const NODE_W   = 168;  // node width in px

// Typography (kept in sync with DiagramCard's <foreignObject> styles).
const LABEL_FONT_PX  = 12;
const LABEL_LINE_PX  = 15;
const DESC_FONT_PX   = 10;
const DESC_LINE_PX   = 13;
const NODE_PAD_X     = 12;
const NODE_PAD_Y     = 10;
const LABEL_DESC_GAP = 4;

// Hard caps so a runaway model can't blow out the layout.
export const MAX_LABEL_LINES = 2;
export const MAX_DESC_LINES  = 3;

// Approx avg glyph width at the chosen font sizes / weights (Inter).
// Slightly conservative so wrapping over-estimates rather than overflows.
const LABEL_AVG_GLYPH = 6.8; // 12px / 600
const DESC_AVG_GLYPH  = 5.6; // 10px / 400

const USABLE_W = NODE_W - NODE_PAD_X * 2;

export const COL_GAP  = 88;   // horizontal gap between node edges (LR direction)
export const ROW_GAP  = 18;   // vertical gap between node edges
export const PAD      = 28;   // canvas padding

// Card chrome around the SVG (header + optional footer hint)
export const CARD_HEADER_H = 32;
export const CARD_FOOTER_H = 24;

// Smallest height that still looks like a node (label-only, single line).
const MIN_NODE_H =
  NODE_PAD_Y * 2 + LABEL_LINE_PX;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface NodePos {
  x: number; // center x
  y: number; // center y
  h: number; // actual height (may vary per node)
}

export interface NodeBox {
  w: number;
  h: number;
  labelLines: number;
  descLines: number;
}

export interface DiagramLayout {
  positions: Map<string, NodePos>;
  svgW: number;
  svgH: number;
}

// ─── Text wrapping estimator ───────────────────────────────────────────────────

/**
 * Greedy word-wrap line estimator. Capped at `maxLines`.
 * Used purely for height calculation — actual rendering uses CSS line-clamp
 * inside a <foreignObject>, so this only needs to be approximately right.
 */
function estimateLines(
  text: string,
  avgGlyphWidth: number,
  maxLines: number,
): number {
  if (!text) return 0;
  const charsPerLine = Math.max(6, Math.floor(USABLE_W / avgGlyphWidth));
  const words = text.trim().split(/\s+/);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const wLen = w.length + (cur > 0 ? 1 : 0);
    if (cur + wLen > charsPerLine && cur > 0) {
      lines++;
      if (lines >= maxLines) return maxLines;
      cur = w.length;
    } else {
      cur += wLen;
    }
  }
  return Math.min(lines, maxLines);
}

/**
 * Compute the rendered box of a single node based on its text content.
 * Heights vary per node so long labels/descriptions don't get clipped or
 * spill into neighbours.
 */
export function getNodeBox(node: DiagramNode): NodeBox {
  const labelLines = Math.max(
    1,
    estimateLines(node.label ?? "", LABEL_AVG_GLYPH, MAX_LABEL_LINES),
  );
  const descLines = node.description
    ? estimateLines(node.description, DESC_AVG_GLYPH, MAX_DESC_LINES)
    : 0;

  const h =
    NODE_PAD_Y * 2 +
    labelLines * LABEL_LINE_PX +
    (descLines > 0 ? LABEL_DESC_GAP + descLines * DESC_LINE_PX : 0);

  return { w: NODE_W, h: Math.max(MIN_NODE_H, h), labelLines, descLines };
}

// ─── Layout algorithm ──────────────────────────────────────────────────────────

export function computeDiagramLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: "LR" | "TB",
): DiagramLayout {
  if (nodes.length === 0) {
    return { positions: new Map(), svgW: 200, svgH: 80 };
  }

  // Pre-compute every node's box once.
  const boxes = new Map<string, NodeBox>();
  for (const n of nodes) boxes.set(n.id, getNodeBox(n));
  const nodeH = (id: string) => boxes.get(id)?.h ?? MIN_NODE_H;

  // Build adjacency + in-degree
  const adj      = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const nodeIds  = new Set(nodes.map((n) => n.id));

  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    adj.get(e.from)!.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  // BFS rank assignment (longest path from a root)
  const rank: Map<string, number> = new Map();
  const queue: string[] = [];

  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0].id);

  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const preds = edges.filter((e) => e.to === id && nodeIds.has(e.from)).map((e) => e.from);
    const maxPred = preds.reduce((m, p) => Math.max(m, rank.get(p) ?? -1), -1);
    rank.set(id, maxPred + 1);

    for (const next of adj.get(id) ?? []) {
      queue.push(next);
    }
  }

  const fallback = Math.max(-1, ...[...rank.values()]) + 1;
  for (const n of nodes) {
    if (!rank.has(n.id)) rank.set(n.id, fallback);
  }

  const layers = new Map<number, string[]>();
  for (const [id, r] of rank) {
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r)!.push(id);
  }

  const maxRank   = Math.max(...rank.values(), 0);
  const positions = new Map<string, NodePos>();

  if (direction === "LR") {
    // Layer height = sum of its members' heights (which are now variable).
    const maxLayerH = Math.max(
      ...[...layers.values()].map((ids) =>
        ids.reduce((sum, id) => sum + nodeH(id) + ROW_GAP, -ROW_GAP),
      ),
      MIN_NODE_H,
    );
    const svgW = PAD * 2 + (maxRank + 1) * NODE_W + maxRank * COL_GAP;
    const svgH = PAD * 2 + maxLayerH;

    for (const [r, ids] of layers) {
      const cx = PAD + NODE_W / 2 + r * (NODE_W + COL_GAP);
      const layerH = ids.reduce((sum, id) => sum + nodeH(id) + ROW_GAP, -ROW_GAP);
      let cy = (svgH - layerH) / 2;

      for (const id of ids) {
        const h = nodeH(id);
        positions.set(id, { x: cx, y: cy + h / 2, h });
        cy += h + ROW_GAP;
      }
    }

    return { positions, svgW, svgH };
  } else {
    // TB: each rank is a row; rows have variable height = max member height.
    const rowH = (ids: string[]) =>
      Math.max(...ids.map((id) => nodeH(id)), MIN_NODE_H);

    const maxLayerW = Math.max(
      ...[...layers.values()].map((ids) => ids.length * NODE_W + (ids.length - 1) * ROW_GAP),
      NODE_W,
    );

    // Total svg height = sum of row heights + gaps between rows + padding.
    let totalRowsH = 0;
    for (let r = 0; r <= maxRank; r++) {
      const ids = layers.get(r) ?? [];
      totalRowsH += rowH(ids);
      if (r < maxRank) totalRowsH += COL_GAP;
    }
    const svgH = PAD * 2 + totalRowsH;
    const svgW = PAD * 2 + maxLayerW;

    let cyTop = PAD;
    for (let r = 0; r <= maxRank; r++) {
      const ids = layers.get(r) ?? [];
      const rh  = rowH(ids);
      const layerW = ids.length * NODE_W + (ids.length - 1) * ROW_GAP;
      let cx = (svgW - layerW) / 2 + NODE_W / 2;

      for (const id of ids) {
        const h = nodeH(id);
        positions.set(id, { x: cx, y: cyTop + rh / 2, h });
        cx += NODE_W + ROW_GAP;
      }
      cyTop += rh + COL_GAP;
    }

    return { positions, svgW, svgH };
  }
}

// ─── Edge path ────────────────────────────────────────────────────────────────

export function diagramEdgePath(
  src: NodePos,
  tgt: NodePos,
  direction: "LR" | "TB",
): string {
  if (direction === "LR") {
    const x1 = src.x + NODE_W / 2;
    const y1 = src.y;
    const x2 = tgt.x - NODE_W / 2;
    const y2 = tgt.y;
    const cp = COL_GAP * 0.55;
    return `M${x1},${y1} C${x1 + cp},${y1} ${x2 - cp},${y2} ${x2},${y2}`;
  } else {
    const x1 = src.x;
    const y1 = src.y + src.h / 2;
    const x2 = tgt.x;
    const y2 = tgt.y - tgt.h / 2;
    const cp = COL_GAP * 0.55;
    return `M${x1},${y1} C${x1},${y1 + cp} ${x2},${y2 - cp} ${x2},${y2}`;
  }
}

// ─── Element sizing ────────────────────────────────────────────────────────────

/**
 * Natural pixel size of a diagram element (SVG + card chrome).
 * Used so the canvas element width matches the diagram's intrinsic width —
 * preventing the SVG from being shrunk by maxWidth and keeping fonts readable.
 */
export function getDiagramElementSize(
  artifact: DiagramArtifact,
  showFooterHint = true,
): { w: number; h: number } {
  const direction = artifact.direction ?? "LR";
  const { svgW, svgH } = computeDiagramLayout(artifact.nodes, artifact.edges, direction);
  const chromeH = CARD_HEADER_H + (showFooterHint && artifact.nodes.length > 1 ? CARD_FOOTER_H : 0);
  return { w: Math.ceil(svgW), h: Math.ceil(svgH + chromeH) };
}
