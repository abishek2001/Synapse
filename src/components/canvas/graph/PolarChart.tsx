"use client";

import { useEffect, useRef } from "react";
import type { GraphArtifact } from "@/lib/tools/types";
import { chartTheme } from "./theme";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#eab308"];
const W = 340, H = 200;

export function usePolarChart(artifact: GraphArtifact, vars: Record<string, number>, dark = false) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = chartTheme(dark);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const maxR = Math.min(W, H) / 2 - 24;

    const actualVars: Record<string, number> = {};
    for (const v of artifact.variables ?? []) {
      actualVars[v.name] = v.step_unit === "π" ? vars[v.name] * Math.PI : vars[v.name];
    }

    // Find max radius across all series for scaling
    const [thetaMin, thetaMax] = artifact.x_range;
    let globalMaxR = 0;
    const steps = 300;
    for (const s of artifact.series) {
      if (!s.fn) continue;
      for (let i = 0; i <= steps; i++) {
        const theta = thetaMin + (i / steps) * (thetaMax - thetaMin);
        try {
          // eslint-disable-next-line no-new-func
          const r = new Function("x", "Math", ...Object.keys(actualVars), `return ${s.fn}`)(theta, Math, ...Object.values(actualVars));
          if (isFinite(r)) globalMaxR = Math.max(globalMaxR, Math.abs(r));
        } catch { /* skip */ }
      }
    }
    if (globalMaxR === 0) globalMaxR = 1;
    const scale = maxR / globalMaxR;

    // Polar grid (concentric circles + radial lines)
    ctx.strokeStyle = theme.grid; ctx.lineWidth = 0.5;
    for (let ri = 1; ri <= 4; ri++) {
      ctx.beginPath(); ctx.arc(cx, cy, (ri / 4) * maxR, 0, Math.PI * 2); ctx.stroke();
    }
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR); ctx.stroke();
    }

    // Cardinal labels
    ctx.fillStyle = theme.axisLabel; ctx.font = "9px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
    const labels = ["0", "π/4", "π/2", "3π/4", "π", "5π/4", "3π/2", "7π/4"];
    labels.forEach((lbl, i) => {
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(lbl, cx + Math.cos(ang) * (maxR + 12), cy + Math.sin(ang) * (maxR + 12) + 3);
    });

    // Curves
    artifact.series.forEach((s, idx) => {
      if (!s.fn) return;
      const color = s.color || COLORS[idx % COLORS.length];
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const theta = thetaMin + (i / steps) * (thetaMax - thetaMin);
        try {
          // eslint-disable-next-line no-new-func
          const r = new Function("x", "Math", ...Object.keys(actualVars), `return ${s.fn}`)(theta, Math, ...Object.values(actualVars));
          if (!isFinite(r)) { started = false; continue; }
          const px = cx + Math.cos(theta) * r * scale;
          const py = cy + Math.sin(theta) * r * scale;
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        } catch { started = false; }
      }
      ctx.stroke();
    });

    // Legend
    let legendY = 16;
    ctx.textAlign = "left";
    artifact.series.forEach((s, idx) => {
      const color = s.color || COLORS[idx % COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(8, legendY - 4, 12, 2.5);
      ctx.fillStyle = theme.legendLabel;
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillText(s.label, 24, legendY);
      legendY += 14;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, vars, dark]);

  return canvasRef;
}
