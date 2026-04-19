"use client";

import { useState, useMemo, useId } from "react";
import type { DiagramArtifact } from "@/lib/tools/types";
import {
  computeDiagramLayout,
  diagramEdgePath,
  NODE_W,
  MAX_LABEL_LINES,
  MAX_DESC_LINES,
} from "@/lib/diagram-layout";

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

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  artifact: DiagramArtifact;
}

export default function DiagramCard({ artifact }: Props) {
  const { nodes, edges, direction = "LR", title } = artifact;
  const uid    = useId().replace(/:/g, "");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { positions, svgW, svgH } = useMemo(
    () => computeDiagramLayout(nodes, edges, direction),
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

      {/* SVG canvas — render at natural intrinsic size so text stays readable.
          The element wrapper width is sized to match svgW (see canvas store). */}
      <div className="overflow-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width={svgW}
          height={svgH}
          style={{ display: "block" }}
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

            const pathD  = diagramEdgePath(src, tgt, direction);
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

                {/* Color accent dot — anchored to top-left of the node box */}
                <circle
                  cx={x + 10}
                  cy={y + 10}
                  r={3}
                  fill={color}
                  opacity={0.85}
                />

                {/* Label + description rendered as wrapped HTML so long text
                    clips cleanly inside the node box instead of overflowing. */}
                <foreignObject x={x} y={y} width={NODE_W} height={h}>
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      padding: "10px 12px",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: hasDesc ? 4 : 0,
                      pointerEvents: "none",
                      userSelect: "none",
                      fontFamily: "Inter, system-ui, sans-serif",
                      textAlign: "center",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: "15px",
                        color: isHov ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.78)",
                        transition: "color 0.15s",
                        display: "-webkit-box",
                        WebkitLineClamp: MAX_LABEL_LINES,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        wordBreak: "break-word",
                      }}
                    >
                      {node.label}
                    </div>
                    {hasDesc && (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 400,
                          lineHeight: "13px",
                          color: isHov ? color : "rgba(255,255,255,0.42)",
                          transition: "color 0.15s",
                          display: "-webkit-box",
                          WebkitLineClamp: MAX_DESC_LINES,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          wordBreak: "break-word",
                        }}
                      >
                        {node.description}
                      </div>
                    )}
                  </div>
                </foreignObject>
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
