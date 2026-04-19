"use client";

import { useState, useMemo, useId } from "react";
import type { DiagramArtifact, DiagramNode, DiagramEdge } from "@/lib/tools/types";

// ─── Layout constants ──────────────────────────────────────────────────────────

const NODE_W    = 148;
const NODE_H    = 52;   // height without description
const NODE_H_D  = 72;   // height with description
const COL_GAP   = 88;   // horizontal gap between node edges (LR direction)
const ROW_GAP   = 18;   // vertical gap between node edges (LR direction)
const PAD       = 28;   // canvas padding

// ─── Colors ────────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  blue:   "#0ea5e9",
  purple: "#7c3aed",
  green:  "#10b981",
  orange: "#f97316",
  red:    "#ef4444",
  gray:   "#64748b",
  yellow: "#eab308",
  pink:   "#ec4899",
  teal:   "#14b8a6",
  indigo: "#6366f1",
};

function resolveColor(color?: string): string {
  if (!color) return "#7c3aed";
  return COLOR_MAP[color.toLowerCase()] ?? color;
}

// ─── Layout algorithm ──────────────────────────────────────────────────────────

interface NodePos {
  x: number; // center x
  y: number; // center y
  h: number; // actual height (may vary per node)
}

function computeLayout(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: "LR" | "TB",
): { positions: Map<string, NodePos>; svgW: number; svgH: number } {
  if (nodes.length === 0) {
    return { positions: new Map(), svgW: 200, svgH: 80 };
  }

  // Build adjacency + in-degree
  const adj       = new Map<string, string[]>();
  const inDegree  = new Map<string, number>();
  const nodeIds   = new Set(nodes.map((n) => n.id));

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
  const rank   = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  if (queue.length === 0 && nodes.length > 0) queue.push(nodes[0].id);

  // Process in BFS order; re-enqueue to ensure longest path wins
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // rank = max(predecessor ranks) + 1
    const preds = edges.filter((e) => e.to === id && nodeIds.has(e.from)).map((e) => e.from);
    const maxPred = preds.reduce((m, p) => Math.max(m, rank.get(p) ?? -1), -1);
    rank.set(id, maxPred + 1);

    for (const next of adj.get(id) ?? []) {
      queue.push(next); // allow re-visits so children get updated rank
    }
  }

  // Handle any unranked nodes (isolated or in unresolved cycles)
  const fallback = Math.max(-1, ...[...rank.values()]) + 1;
  for (const n of nodes) {
    if (!rank.has(n.id)) rank.set(n.id, fallback);
  }

  // Group by rank (layer)
  const layers = new Map<number, string[]>();
  for (const [id, r] of rank) {
    if (!layers.has(r)) layers.set(r, []);
    layers.get(r)!.push(id);
  }

  // Node height helper
  const nodeH = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    return n?.description ? NODE_H_D : NODE_H;
  };

  const maxRank     = Math.max(...rank.values(), 0);
  const positions   = new Map<string, NodePos>();

  if (direction === "LR") {
    // x driven by rank, y by position within layer
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
    // TB — y driven by rank, x by position within layer
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

function edgePath(
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

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  artifact: DiagramArtifact;
}

export default function DiagramCard({ artifact }: Props) {
  const { nodes, edges, direction = "LR", title } = artifact;
  const uid    = useId().replace(/:/g, "");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { positions, svgW, svgH } = useMemo(
    () => computeLayout(nodes, edges, direction),
    [nodes, edges, direction],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-white/30 text-sm">
        No nodes defined
      </div>
    );
  }

  const markerId = `arrow-${uid}`;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "rgba(12,12,24,0.96)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(124,58,237,0.7)" }}>diagram</span>
        <span className="text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{title}</span>
      </div>

      {/* SVG canvas */}
      <div className="overflow-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width={svgW}
          height={svgH}
          style={{ display: "block", maxWidth: "100%" }}
        >
          <defs>
            <marker
              id={markerId}
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 Z" fill="rgba(124,58,237,0.55)" />
            </marker>
          </defs>

          {/* ── Edges ── */}
          {edges.map((e, i) => {
            const src = positions.get(e.from);
            const tgt = positions.get(e.to);
            if (!src || !tgt) return null;

            const pathD  = edgePath(src, tgt, direction);
            const midX   = (src.x + tgt.x) / 2;
            const midY   = (src.y + tgt.y) / 2;
            const isHovered =
              hoveredId === e.from || hoveredId === e.to;

            return (
              <g key={`edge-${i}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={isHovered ? "rgba(124,58,237,0.75)" : "rgba(124,58,237,0.28)"}
                  strokeWidth={isHovered ? 1.8 : 1.2}
                  strokeDasharray={isHovered ? undefined : "5 3"}
                  markerEnd={`url(#${markerId})`}
                  style={{ transition: "stroke 0.15s, stroke-width 0.15s" }}
                />
                {e.label && (
                  <text
                    x={midX}
                    y={midY - 5}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgba(255,255,255,0.3)"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Nodes ── */}
          {nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;

            const color    = resolveColor(node.color);
            const isHov    = hoveredId === node.id;
            const h        = pos.h;
            const hasDesc  = !!node.description;
            const shape    = node.shape ?? "rect";

            const x = pos.x - NODE_W / 2;
            const y = pos.y - h / 2;

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: "default" }}
              >
                {/* Glow on hover */}
                {isHov && shape !== "diamond" && (
                  <rect
                    x={x - 4} y={y - 4}
                    width={NODE_W + 8} height={h + 8}
                    rx={14}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.25}
                    style={{ filter: `blur(4px)` }}
                  />
                )}

                {/* Node body */}
                {shape === "diamond" ? (
                  <polygon
                    points={`
                      ${pos.x},${y}
                      ${pos.x + NODE_W / 2},${pos.y}
                      ${pos.x},${y + h}
                      ${pos.x - NODE_W / 2},${pos.y}
                    `}
                    fill={isHov ? "rgba(30,20,50,0.95)" : "rgba(18,14,32,0.92)"}
                    stroke={isHov ? color : `${color}60`}
                    strokeWidth={isHov ? 1.5 : 1}
                    style={{ transition: "stroke 0.15s, fill 0.15s" }}
                  />
                ) : shape === "circle" ? (
                  <circle
                    cx={pos.x ?? 0} cy={pos.y ?? 0}
                    r={h / 2 + 8}
                    fill={isHov ? "rgba(30,20,50,0.95)" : "rgba(18,14,32,0.92)"}
                    stroke={isHov ? color : `${color}60`}
                    strokeWidth={isHov ? 1.5 : 1}
                    style={{ transition: "stroke 0.15s, fill 0.15s" }}
                  />
                ) : (
                  <rect
                    x={x} y={y}
                    width={NODE_W} height={h}
                    rx={10}
                    fill={isHov ? "rgba(30,20,50,0.95)" : "rgba(18,14,32,0.92)"}
                    stroke={isHov ? color : `${color}60`}
                    strokeWidth={isHov ? 1.5 : 1}
                    style={{ transition: "stroke 0.15s, fill 0.15s" }}
                  />
                )}

                {/* Color accent dot */}
                <circle
                  cx={(x ?? 0) + 10} cy={(pos.y ?? 0) - (hasDesc ? 10 : 0)}
                  r={3}
                  fill={color}
                  opacity={0.8}
                />

                {/* Label */}
                <text
                  x={pos.x + 4}
                  y={pos.y + (hasDesc ? -8 : 1)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={600}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={isHov ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.72)"}
                  style={{ transition: "fill 0.15s", pointerEvents: "none", userSelect: "none" }}
                >
                  {node.label}
                </text>

                {/* Description */}
                {hasDesc && (
                  <text
                    x={pos.x + 4}
                    y={pos.y + 10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={9.5}
                    fontFamily="Inter, system-ui, sans-serif"
                    fill={isHov ? color : "rgba(255,255,255,0.32)"}
                    style={{ transition: "fill 0.15s", pointerEvents: "none", userSelect: "none" }}
                  >
                    {node.description}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover hint — only shown when nothing is hovered */}
      {hoveredId === null && nodes.length > 1 && (
        <div
          className="px-3 py-1.5 text-[9px]"
          style={{ color: "rgba(255,255,255,0.2)", borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          hover nodes to highlight connections
        </div>
      )}
    </div>
  );
}
