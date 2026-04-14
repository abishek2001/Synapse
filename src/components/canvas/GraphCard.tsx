"use client";

import { useState, useCallback } from "react";
import type { GraphArtifact, GraphVariable } from "@/lib/tools/types";
import { useLineChart, W, PAD } from "./graph/LineChart";
import { useBarChart } from "./graph/BarChart";
import { usePieChart } from "./graph/PieChart";
import { usePolarChart } from "./graph/PolarChart";
import { useDistributionChart } from "./graph/DistributionChart";

// ─── π fraction display ───────────────────────────────────────────────────────

const PI_FRACS: [number, number][] = [
  [0,1],[1,8],[1,6],[1,4],[1,3],[1,2],[2,3],[3,4],[5,6],[7,8],
  [1,1],[5,4],[4,3],[3,2],[5,3],[7,4],[11,6],[15,8],[2,1],
  [5,2],[3,1],[7,2],[4,1],
];

function formatPiValue(mult: number): string {
  if (mult === 0) return "0";
  for (const [n, d] of PI_FRACS) {
    if (n > 0 && Math.abs(mult - n / d) < 0.001) {
      if (d === 1) return n === 1 ? "π" : `${n}π`;
      if (n === 1) return `π/${d}`;
      return `${n}π/${d}`;
    }
  }
  return `${mult.toFixed(2)}π`;
}

// ─── Slider component ─────────────────────────────────────────────────────────

function VarSlider({
  variable,
  value,
  onChange,
}: {
  variable: GraphVariable;
  value: number;
  onChange: (v: number) => void;
}) {
  const isPi = variable.step_unit === "π";
  const displayVal = isPi ? formatPiValue(value) : value.toFixed(value % 1 === 0 ? 0 : 2);

  const steps = Math.round((variable.max - variable.min) / variable.step);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-black/40 shrink-0 w-[60px] truncate">{variable.label}</span>
      <input
        type="range"
        min={variable.min}
        max={variable.max}
        step={variable.step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-violet-600 cursor-pointer"
        style={{ minWidth: 60 }}
        aria-label={variable.label}
        aria-valuemin={variable.min}
        aria-valuemax={variable.max}
        aria-valuenow={value}
      />
      <span
        className="text-[10px] font-mono text-violet-600 shrink-0 text-right"
        style={{ minWidth: isPi ? 36 : 28 }}
      >
        {displayVal}
      </span>
      <span className="text-[10px] text-black/25 shrink-0">
        / {steps} steps
      </span>
    </div>
  );
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export default function GraphCard({ artifact }: { artifact: GraphArtifact }) {
  const [vars, setVars] = useState<Record<string, number>>(() =>
    Object.fromEntries((artifact.variables ?? []).map(v => [v.name, v.default]))
  );
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; values: { label: string; y: number; color: string }[];
  } | null>(null);
  const [tooltipX, setTooltipX] = useState<number | undefined>(undefined);

  const setVar = useCallback((name: string, val: number) => {
    setVars(prev => ({ ...prev, [name]: val }));
    setTooltip(null);
  }, []);

  const onTooltip = useCallback((t: typeof tooltip) => setTooltip(t), []);

  const graphType = artifact.graph_type;
  const isLineFam = graphType === "line" || graphType === "area" || graphType === "scatter" || graphType === "trend" || graphType === "forecast" || graphType === "parametric";

  // All chart renderers are hooked unconditionally (hooks rules) — only the active one renders
  const { canvasRef: lineRef, rangesRef } = useLineChart({ artifact, vars, onTooltip, tooltipX });
  const barRef = useBarChart(artifact, vars);
  const pieRef = usePieChart(artifact);
  const polarRef = usePolarChart(artifact, vars);
  const distRef = useDistributionChart(artifact);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = lineRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const { xMin, xMax } = rangesRef.current;
    const plotW = W - 2 * PAD;
    if (px < PAD || px > PAD + plotW) { setTooltipX(undefined); setTooltip(null); return; }
    const worldX = xMin + ((px - PAD) / plotW) * (xMax - xMin);
    setTooltipX(worldX);
  }, [lineRef, rangesRef]);

  const handleMouseLeave = useCallback(() => {
    setTooltipX(undefined);
    setTooltip(null);
  }, []);

  const hasVars = (artifact.variables?.length ?? 0) > 0;

  return (
    <div className="w-full space-y-1">
      <h3 className="text-[13px] font-semibold text-black/65">{artifact.title}</h3>

      {/* Slider bank */}
      {hasVars && (
        <div
          className="space-y-1.5 rounded-lg px-3 py-2"
          style={{ background: "rgba(124,58,237,0.04)", border: "1px solid rgba(124,58,237,0.1)" }}
        >
          {(artifact.variables ?? []).map(v => (
            <VarSlider
              key={v.name}
              variable={v}
              value={vars[v.name] ?? v.default}
              onChange={val => setVar(v.name, val)}
            />
          ))}
        </div>
      )}

      {/* Chart canvas */}
      <div className="relative" style={{ width: W, maxWidth: "100%" }}>
        {isLineFam && (
          <canvas
            ref={lineRef}
            style={{ display: "block", width: "100%", cursor: "crosshair" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        )}
        {graphType === "bar" && (
          <canvas ref={barRef} style={{ display: "block", width: "100%" }} />
        )}
        {graphType === "pie" && (
          <canvas ref={pieRef} style={{ display: "block", width: "100%" }} />
        )}
        {graphType === "polar" && (
          <canvas ref={polarRef} style={{ display: "block", width: "100%" }} />
        )}
        {(graphType === "box" || graphType === "violin" || graphType === "density") && (
          <canvas ref={distRef} style={{ display: "block", width: "100%" }} />
        )}

        {/* Hover tooltip (line family only) */}
        {tooltip && isLineFam && (
          <div
            className="absolute pointer-events-none rounded-lg px-2.5 py-1.5 shadow-lg"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              backgroundColor: "rgba(20,20,40,0.88)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.08)",
              zIndex: 10,
            }}
          >
            {tooltip.values.map(v => (
              <div key={v.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
                <span className="text-[10px] text-white/60">{v.label}:</span>
                <span className="text-[10px] font-mono text-white/90">{v.y.toFixed(3)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
