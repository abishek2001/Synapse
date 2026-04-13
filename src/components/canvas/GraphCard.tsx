"use client";

import type { GraphArtifact } from "@/lib/tools/types";
import { useEffect, useRef, useState, useCallback } from "react";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#eab308"];
const W = 360, H = 220, PAD = 42;

function evalExpr(fn: string, x: number): number {
  // eslint-disable-next-line no-new-func
  return new Function("x", "Math", `return ${fn}`)(x, Math);
}

export default function GraphCard({ artifact }: { artifact: GraphArtifact }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; values: { label: string; y: number; color: string }[] } | null>(null);
  const rangesRef = useRef<{ xMin: number; xMax: number; yMin: number; yMax: number }>({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });

  const draw = useCallback((highlightX?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const [xMin, xMax] = artifact.x_range;
    let yMin = artifact.y_range?.[0] ?? Infinity;
    let yMax = artifact.y_range?.[1] ?? -Infinity;

    if (!artifact.y_range) {
      for (const expr of artifact.expressions) {
        for (let px = 0; px <= 100; px++) {
          const x = xMin + (px / 100) * (xMax - xMin);
          try {
            const y = evalExpr(expr.fn, x);
            if (isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
          } catch { /* skip */ }
        }
      }
      const pad = (yMax - yMin) * 0.12 || 1;
      yMin -= pad; yMax += pad;
    }

    rangesRef.current = { xMin, xMax, yMin, yMax };

    const plotW = W - 2 * PAD;
    const plotH = H - 2 * PAD;
    const toX = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * plotW;
    const toY = (y: number) => PAD + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    // Background — transparent so it sits directly on the whiteboard
    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const gx = PAD + (i / 5) * plotW;
      ctx.beginPath(); ctx.moveTo(gx, PAD); ctx.lineTo(gx, PAD + plotH); ctx.stroke();
      const gy = PAD + (i / 5) * plotH;
      ctx.beginPath(); ctx.moveTo(PAD, gy); ctx.lineTo(PAD + plotW, gy); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    if (yMin <= 0 && yMax >= 0) {
      const y0 = toY(0);
      ctx.beginPath(); ctx.moveTo(PAD, y0); ctx.lineTo(PAD + plotW, y0); ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      const x0 = toX(0);
      ctx.beginPath(); ctx.moveTo(x0, PAD); ctx.lineTo(x0, PAD + plotH); ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const val = xMin + (i / 4) * (xMax - xMin);
      ctx.fillText(val.toFixed(val % 1 ? 1 : 0), PAD + (i / 4) * plotW, H - 6);
    }
    for (let i = 0; i <= 4; i++) {
      const val = yMin + (i / 4) * (yMax - yMin);
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(val % 1 ? 1 : 0), PAD - 5, PAD + plotH - (i / 4) * plotH + 3);
    }
    if (artifact.x_label) {
      ctx.textAlign = "center";
      ctx.fillText(artifact.x_label, W / 2, H - 1);
    }

    // Curves
    artifact.expressions.forEach((expr, idx) => {
      const color = expr.color || COLORS[idx % COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      const steps = 400;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + (i / steps) * (xMax - xMin);
        try {
          const y = evalExpr(expr.fn, x);
          if (!isFinite(y)) { started = false; continue; }
          const cx = toX(x), cy = toY(y);
          if (cy < -10 || cy > H + 10) { started = false; continue; }
          if (!started) { ctx.moveTo(cx, cy); started = true; }
          else ctx.lineTo(cx, cy);
        } catch { started = false; }
      }
      ctx.stroke();
    });

    // Legend
    let legendY = PAD + 12;
    ctx.textAlign = "left";
    artifact.expressions.forEach((expr, idx) => {
      const color = expr.color || COLORS[idx % COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(PAD + 8, legendY - 4, 12, 2.5);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillText(expr.label, PAD + 24, legendY);
      legendY += 14;
    });

    // Hover crosshair
    if (highlightX !== undefined) {
      const screenX = toX(highlightX);
      ctx.strokeStyle = "rgba(124,58,237,0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(screenX, PAD); ctx.lineTo(screenX, PAD + plotH); ctx.stroke();
      ctx.setLineDash([]);

      // Dots on each curve
      artifact.expressions.forEach((expr, idx) => {
        const color = expr.color || COLORS[idx % COLORS.length];
        try {
          const y = evalExpr(expr.fn, highlightX);
          if (!isFinite(y)) return;
          const cy = toY(y);
          if (cy < PAD - 8 || cy > PAD + plotH + 8) return;
          ctx.beginPath();
          ctx.arc(screenX, cy, 4, 0, Math.PI * 2);
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        } catch { /* skip */ }
      });
    }
  }, [artifact]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const { xMin, xMax, yMin, yMax } = rangesRef.current;

    const plotW = W - 2 * PAD;
    if (px < PAD || px > PAD + plotW) { setTooltip(null); draw(); return; }

    const worldX = xMin + ((px - PAD) / plotW) * (xMax - xMin);
    draw(worldX);

    const plotH = H - 2 * PAD;
    const values = artifact.expressions.map((expr, idx) => {
      try {
        const y = evalExpr(expr.fn, worldX);
        if (!isFinite(y)) return null;
        // Clamp to visible range
        if (y < yMin * 2 || y > yMax * 2) return null;
        return { label: expr.label, y, color: expr.color || COLORS[idx % COLORS.length] };
      } catch { return null; }
    }).filter(Boolean) as { label: string; y: number; color: string }[];

    if (values.length > 0) {
      // Position tooltip above cursor
      const tooltipX = Math.min(px, W - 120);
      const firstY = values[0].y;
      const screenY = PAD + plotH - ((firstY - yMin) / (yMax - yMin)) * plotH;
      setTooltip({ x: tooltipX, y: Math.max(screenY - 60, 4), values });
    } else {
      setTooltip(null);
    }
  }, [artifact, draw]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    draw();
  }, [draw]);

  return (
    <div className="w-full space-y-2">
      <h3 className="text-[13px] font-semibold text-black/65">{artifact.title}</h3>
      <div className="relative" style={{ width: W, maxWidth: "100%" }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        {tooltip && (
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
            {tooltip.values.map((v) => (
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
