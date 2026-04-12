"use client";

import type { GraphArtifact } from "@/lib/tools/types";
import { useEffect, useRef } from "react";

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#eab308"];

export default function GraphCard({ artifact }: { artifact: GraphArtifact }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 340;
    const H = 220;
    const PADDING = 40;
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
      const pad = (yMax - yMin) * 0.1 || 1;
      yMin -= pad;
      yMax += pad;
    }

    const plotW = W - 2 * PADDING;
    const plotH = H - 2 * PADDING;
    const toX = (x: number) => PADDING + ((x - xMin) / (xMax - xMin)) * plotW;
    const toY = (y: number) => PADDING + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const gx = PADDING + (i / 5) * plotW;
      ctx.beginPath(); ctx.moveTo(gx, PADDING); ctx.lineTo(gx, PADDING + plotH); ctx.stroke();
      const gy = PADDING + (i / 5) * plotH;
      ctx.beginPath(); ctx.moveTo(PADDING, gy); ctx.lineTo(PADDING + plotW, gy); ctx.stroke();
    }

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 0.8;
    if (yMin <= 0 && yMax >= 0) {
      const y0 = toY(0);
      ctx.beginPath(); ctx.moveTo(PADDING, y0); ctx.lineTo(PADDING + plotW, y0); ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      const x0 = toX(0);
      ctx.beginPath(); ctx.moveTo(x0, PADDING); ctx.lineTo(x0, PADDING + plotH); ctx.stroke();
    }

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "13px Caveat, Segoe Print, Comic Sans MS, cursive";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const val = xMin + (i / 4) * (xMax - xMin);
      ctx.fillText(val.toFixed(val % 1 ? 1 : 0), PADDING + (i / 4) * plotW, H - 8);
    }
    for (let i = 0; i <= 4; i++) {
      const val = yMin + (i / 4) * (yMax - yMin);
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(val % 1 ? 1 : 0), PADDING - 6, PADDING + plotH - (i / 4) * plotH + 3);
    }

    if (artifact.x_label) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillText(artifact.x_label, W / 2, H - 1);
    }

    artifact.expressions.forEach((expr, idx) => {
      const color = expr.color || COLORS[idx % COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      let started = false;
      const steps = 300;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + (i / steps) * (xMax - xMin);
        try {
          const y = evalExpr(expr.fn, x);
          if (!isFinite(y)) { started = false; continue; }
          const cx = toX(x);
          const cy = toY(y);
          if (cy < -10 || cy > H + 10) { started = false; continue; }
          if (!started) { ctx.moveTo(cx, cy); started = true; }
          else ctx.lineTo(cx, cy);
        } catch { started = false; }
      }
      ctx.stroke();
    });

    let legendY = PADDING + 12;
    ctx.textAlign = "left";
    artifact.expressions.forEach((expr, idx) => {
      const color = expr.color || COLORS[idx % COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(PADDING + 8, legendY - 4, 10, 2.5);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.font = "13px Caveat, Segoe Print, Comic Sans MS, cursive";
      ctx.fillText(expr.label, PADDING + 22, legendY);
      legendY += 14;
    });
  }, [artifact]);

  return (
    <div className="space-y-2">
      <h3 className="font-[family-name:var(--font-caveat)] text-xl text-black/70 font-semibold tracking-wide">
        {artifact.title}
      </h3>
      <canvas
        ref={canvasRef}
        className="rounded-xl w-full border border-black/[0.06] shadow-sm"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}

function evalExpr(fn: string, x: number): number {
  const func = new Function("x", "Math", `return ${fn}`);
  return func(x, Math);
}
