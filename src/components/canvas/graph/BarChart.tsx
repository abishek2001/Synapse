"use client";

import { useEffect, useRef } from "react";
import type { GraphArtifact } from "@/lib/tools/types";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#eab308"];
const W = 340, H = 200, PAD_LEFT = 44, PAD_RIGHT = 16, PAD_TOP = 20, PAD_BOTTOM = 32;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function useBarChart(artifact: GraphArtifact, vars: Record<string, number>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const plotW = W - PAD_LEFT - PAD_RIGHT;
    const plotH = H - PAD_TOP - PAD_BOTTOM;

    // Gather all categories (x values) and values
    const series = artifact.series;
    if (series.length === 0) return;

    // Determine categories — use data if available, else fn evaluated at integers
    let categories: number[] = [];
    for (const s of series) {
      if (s.data) {
        for (const d of s.data) {
          if (!categories.includes(d.x)) categories.push(d.x);
        }
      }
    }
    if (categories.length === 0) {
      const [xMin, xMax] = artifact.x_range;
      for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) categories.push(x);
    }
    categories.sort((a, b) => a - b);

    const actualVars: Record<string, number> = {};
    for (const v of artifact.variables ?? []) {
      actualVars[v.name] = v.step_unit === "π" ? vars[v.name] * Math.PI : vars[v.name];
    }

    // Collect data per series per category
    const seriesData: number[][] = series.map(s => {
      if (s.data) {
        return categories.map(cat => s.data!.find(d => d.x === cat)?.y ?? 0);
      } else if (s.fn) {
        return categories.map(cat => {
          try {
            // eslint-disable-next-line no-new-func
            const y = new Function("x", "Math", ...Object.keys(actualVars), `return ${s.fn}`)(cat, Math, ...Object.values(actualVars));
            return isFinite(y) ? y : 0;
          } catch { return 0; }
        });
      }
      return categories.map(() => 0);
    });

    const allVals = seriesData.flat();
    const yMax = artifact.y_range?.[1] ?? (Math.max(...allVals) * 1.12 || 1);
    const yMin = artifact.y_range?.[0] ?? Math.min(0, Math.min(...allVals));

    const toY = (y: number) => PAD_TOP + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
    const baseY = toY(0);

    // Grid
    ctx.strokeStyle = "rgba(0,0,0,0.05)"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const gy = PAD_TOP + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(PAD_LEFT, gy); ctx.lineTo(PAD_LEFT + plotW, gy); ctx.stroke();
    }
    // Zero line
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_LEFT, baseY); ctx.lineTo(PAD_LEFT + plotW, baseY); ctx.stroke();

    const nCats = categories.length;
    const groupGap = plotW / nCats;
    const barGap = 3;
    const barW = (groupGap - barGap * 2) / series.length;

    // Bars
    seriesData.forEach((vals, si) => {
      const color = series[si].color || COLORS[si % COLORS.length];
      vals.forEach((v, ci) => {
        const x = PAD_LEFT + ci * groupGap + barGap + si * barW;
        const barH = Math.abs(toY(v) - baseY);
        const barTop = v >= 0 ? toY(v) : baseY;
        ctx.fillStyle = hexToRgba(color, 0.85);
        ctx.beginPath();
        ctx.roundRect(x, barTop, barW - 1, barH, [3, 3, 0, 0]);
        ctx.fill();
      });
    });

    // x-axis labels (category indices or values)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    categories.forEach((cat, ci) => {
      const cx = PAD_LEFT + ci * groupGap + groupGap / 2;
      ctx.fillText(String(cat), cx, H - 8);
    });

    // y-axis labels
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = yMin + (i / 4) * (yMax - yMin);
      ctx.fillText(val.toFixed(val % 1 ? 1 : 0), PAD_LEFT - 4, PAD_TOP + plotH - (i / 4) * plotH + 3);
    }

    // Legend
    let lx = PAD_LEFT + 4;
    series.forEach((s, idx) => {
      const color = s.color || COLORS[idx % COLORS.length];
      ctx.fillStyle = hexToRgba(color, 0.85);
      ctx.fillRect(lx, PAD_TOP + 4, 10, 7);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(s.label, lx + 13, PAD_TOP + 11);
      lx += ctx.measureText(s.label).width + 26;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, vars]);

  return canvasRef;
}
