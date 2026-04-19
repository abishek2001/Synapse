import type { DiagramArtifact, DiagramNode, DiagramEdge } from "./tools/types";

// ─── Layout constants ──────────────────────────────────────────────────────────

export const NODE_W   = 148;
export const NODE_H   = 52;   // height without description
export const NODE_H_D = 72;   // height with description
export const COL_GAP  = 88;   // horizontal gap between node edges (LR direction)
export const ROW_GAP  = 18;   // vertical gap between node edges
export const PAD      = 28;   // canvas padding

// Card chrome around the SVG (header + optional footer hint)
export const CARD_HEADER_H = 32;
export const CARD_FOOTER_H = 24;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface NodePos {
  x: number; // center x
  y: number; // center y
  h: number; // actual height (may vary per node)
}

export interface DiagramLayout {
  positions: Map<string, NodePos>;
  svgW: number;
  svgH: number;
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

  const nodeH = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n?.description ? NODE_H_D : NODE_H;
  };

  const maxRank   = Math.max(...rank.values(), 0);
  const positions = new Map<string, NodePos>();

  if (direction === "LR") {
    const maxLayerH = Math.max(
      ...[...layers.values()].map((ids) =>
        ids.reduce((sum, id) => sum + nodeH(id) + ROW_GAP, -ROW_GAP),
      ),
      NODE_H,
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
    const maxLayerW = Math.max(
      ...[...layers.values()].map((ids) => ids.length * (NODE_W + ROW_GAP) - ROW_GAP),
      NODE_W,
    );
    const svgH = PAD * 2 + (maxRank + 1) * NODE_H_D + maxRank * COL_GAP;
    const svgW = PAD * 2 + maxLayerW;

    for (const [r, ids] of layers) {
      const cy = PAD + NODE_H_D / 2 + r * (NODE_H_D + COL_GAP);
      const layerW = ids.length * NODE_W + (ids.length - 1) * ROW_GAP;
      let cx = (svgW - layerW) / 2 + NODE_W / 2;

      for (const id of ids) {
        const h = nodeH(id);
        positions.set(id, { x: cx, y: cy, h });
        cx += NODE_W + ROW_GAP;
      }
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
