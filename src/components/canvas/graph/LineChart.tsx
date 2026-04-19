"use client";

import { useEffect, useRef } from "react";
import type { GraphArtifact } from "@/lib/tools/types";
import { chartTheme } from "./theme";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#eab308"];
export const W = 340, H = 200, PAD = 40;

type Props = {
  artifact: GraphArtifact;
  vars: Record<string, number>;
  onTooltip: (t: { x: number; y: number; values: { label: string; y: number; color: string }[] } | null) => void;
  tooltipX: number | undefined;
  dark?: boolean;
};

function evalFn(fn: string, x: number, varValues: Record<string, number>): number {
  const names = Object.keys(varValues);
  const vals = Object.values(varValues);
  // eslint-disable-next-line no-new-func
  return new Function("x", "Math", ...names, `return ${fn}`)(x, Math, ...vals);
}

function linReg(pts: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0 };
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const num = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: my - slope * mx };
}

export function useLineChart({ artifact, vars, onTooltip, tooltipX, dark = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rangesRef = useRef({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  const graphType = artifact.graph_type;
  const theme = chartTheme(dark);

  const resolveVars = (v: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const variable of artifact.variables ?? []) {
      out[variable.name] = variable.step_unit === "π"
        ? v[variable.name] * Math.PI
        : v[variable.name];
    }
    // also pass through any vars not declared (shouldn't happen)
    for (const k of Object.keys(v)) {
      if (!(k in out)) out[k] = v[k];
    }
    return out;
  };

  useEffect(() => {
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
    const actualVars = resolveVars(vars);

    if (!artifact.y_range) {
      for (const s of artifact.series) {
        for (let px = 0; px <= 100; px++) {
          const x = xMin + (px / 100) * (xMax - xMin);
          try {
            let y: number;
            if (s.fn) y = evalFn(s.fn, x, actualVars);
            else if (s.data) y = s.data.find(d => Math.abs(d.x - x) < (xMax - xMin) / 50)?.y ?? NaN;
            else continue;
            if (isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
          } catch { /* skip */ }
        }
      }
      const pad = (yMax - yMin) * 0.12 || 1;
      yMin -= pad; yMax += pad;
    }
    if (!isFinite(yMin)) yMin = -1;
    if (!isFinite(yMax)) yMax = 1;

    rangesRef.current = { xMin, xMax, yMin, yMax };

    const plotW = W - 2 * PAD;
    const plotH = H - 2 * PAD;
    const toX = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * plotW;
    const toY = (y: number) => PAD + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath(); ctx.moveTo(PAD + (i / 5) * plotW, PAD); ctx.lineTo(PAD + (i / 5) * plotW, PAD + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(PAD, PAD + (i / 5) * plotH); ctx.lineTo(PAD + plotW, PAD + (i / 5) * plotH); ctx.stroke();
    }

    // Zero axes
    ctx.strokeStyle = theme.axis; ctx.lineWidth = 1;
    if (yMin <= 0 && yMax >= 0) {
      const y0 = toY(0);
      ctx.beginPath(); ctx.moveTo(PAD, y0); ctx.lineTo(PAD + plotW, y0); ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      const x0 = toX(0);
      ctx.beginPath(); ctx.moveTo(x0, PAD); ctx.lineTo(x0, PAD + plotH); ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = theme.axisLabel;
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) {
      const val = xMin + (i / 4) * (xMax - xMin);
      ctx.fillText(val.toFixed(Math.abs(val) < 10 && val % 1 !== 0 ? 1 : 0), PAD + (i / 4) * plotW, H - 5);
    }
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = yMin + (i / 4) * (yMax - yMin);
      ctx.fillText(val.toFixed(Math.abs(val) < 10 && val % 1 !== 0 ? 1 : 0), PAD - 4, PAD + plotH - (i / 4) * plotH + 3);
    }

    const steps = 400;
    const forecastSplit = 0.75; // forecast: solid until this fraction of x range

    artifact.series.forEach((s, idx) => {
      const color = s.color || COLORS[idx % COLORS.length];
      const sStyle = s.style ?? "solid";

      if (graphType === "scatter" || graphType === "trend") {
        // Scatter dots
        const pts: { x: number; y: number }[] = [];
        if (s.data) {
          for (const d of s.data) pts.push({ x: toX(d.x), y: toY(d.y) });
        } else if (s.fn) {
          const dotSteps = 30;
          for (let i = 0; i <= dotSteps; i++) {
            const x = xMin + (i / dotSteps) * (xMax - xMin);
            try {
              const y = evalFn(s.fn, x, actualVars);
              if (isFinite(y)) pts.push({ x: toX(x), y: toY(y) });
            } catch { /* skip */ }
          }
        }
        ctx.fillStyle = color;
        for (const p of pts) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        }

        if (graphType === "trend" && pts.length >= 2) {
          // Linear regression line
          const worldPts = pts.map(p => ({
            x: xMin + ((p.x - PAD) / plotW) * (xMax - xMin),
            y: yMin + (1 - (p.y - PAD) / plotH) * (yMax - yMin),
          }));
          const { slope, intercept } = linReg(worldPts);
          ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.moveTo(PAD, toY(slope * xMin + intercept));
          ctx.lineTo(PAD + plotW, toY(slope * xMax + intercept));
          ctx.stroke(); ctx.setLineDash([]);
        }
        return;
      }

      if (graphType === "parametric") {
        const fnY = s.fn ?? "t";
        const fnX = s.fn_x ?? "t";
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        if (sStyle === "dashed") ctx.setLineDash([6, 3]);
        else if (sStyle === "dotted") ctx.setLineDash([2, 3]);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= steps; i++) {
          const t = xMin + (i / steps) * (xMax - xMin);
          try {
            const wx = evalFn(fnX, t, { ...actualVars, t });
            const wy = evalFn(fnY, t, { ...actualVars, t });
            if (!isFinite(wx) || !isFinite(wy)) { started = false; continue; }
            const cx = toX(wx), cy = toY(wy);
            if (!started) { ctx.moveTo(cx, cy); started = true; }
            else ctx.lineTo(cx, cy);
          } catch { started = false; }
        }
        ctx.stroke(); ctx.setLineDash([]);
        return;
      }

      if (!s.fn) return;

      // Sample points
      const pts: { wx: number; wy: number; cx: number; cy: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const wx = xMin + (i / steps) * (xMax - xMin);
        try {
          const wy = evalFn(s.fn, wx, actualVars);
          if (!isFinite(wy)) continue;
          const cx = toX(wx), cy = toY(wy);
          if (cy < -10 || cy > H + 10) continue;
          pts.push({ wx, wy, cx, cy });
        } catch { /* skip */ }
      }

      if ((graphType === "area") && pts.length > 0) {
        // Fill area under curve
        const baseY = toY(Math.max(0, yMin));
        ctx.beginPath();
        ctx.moveTo(pts[0].cx, baseY);
        for (const p of pts) ctx.lineTo(p.cx, p.cy);
        ctx.lineTo(pts[pts.length - 1].cx, baseY);
        ctx.closePath();
        ctx.fillStyle = color.replace(/,\s*[\d.]+\)$/, ", 0.12)").replace(/^#/, "").length === 6
          ? hexToRgba(color, 0.13)
          : color;
        ctx.fill();
      }

      // Line
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.lineCap = "round"; ctx.lineJoin = "round";

      if (graphType === "forecast") {
        const splitX = xMin + (xMax - xMin) * forecastSplit;
        // Solid past
        ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (p.wx > splitX) break;
          if (!started) { ctx.moveTo(p.cx, p.cy); started = true; }
          else ctx.lineTo(p.cx, p.cy);
        }
        ctx.stroke();
        // Dashed forecast
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); started = false;
        for (const p of pts) {
          if (p.wx < splitX - (xMax - xMin) * 0.02) continue;
          if (!started) { ctx.moveTo(p.cx, p.cy); started = true; }
          else ctx.lineTo(p.cx, p.cy);
        }
        ctx.stroke(); ctx.setLineDash([]);
      } else {
        if (sStyle === "dashed") ctx.setLineDash([6, 3]);
        else if (sStyle === "dotted") ctx.setLineDash([2, 3]);
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (!started) { ctx.moveTo(p.cx, p.cy); started = true; }
          else ctx.lineTo(p.cx, p.cy);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
    });

    // Legend
    let legendY = PAD + 12;
    ctx.textAlign = "left";
    artifact.series.forEach((s, idx) => {
      const color = s.color || COLORS[idx % COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(PAD + 6, legendY - 4, 12, 2.5);
      ctx.fillStyle = theme.legendLabel;
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillText(s.label, PAD + 22, legendY);
      legendY += 14;
    });

    // Hover crosshair
    if (tooltipX !== undefined) {
      const screenX = toX(tooltipX);
      ctx.strokeStyle = "rgba(124,58,237,0.35)";
      ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(screenX, PAD); ctx.lineTo(screenX, PAD + plotH); ctx.stroke();
      ctx.setLineDash([]);
      const tooltipVals: { label: string; y: number; color: string }[] = [];
      artifact.series.forEach((s, idx) => {
        if (!s.fn) return;
        const color = s.color || COLORS[idx % COLORS.length];
        try {
          const y = evalFn(s.fn, tooltipX, actualVars);
          if (!isFinite(y)) return;
          const cy = toY(y);
          if (cy < PAD - 8 || cy > PAD + plotH + 8) return;
          ctx.beginPath(); ctx.arc(screenX, cy, 4, 0, Math.PI * 2);
          ctx.fillStyle = theme.tooltipDotFill; ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
          tooltipVals.push({ label: s.label, y, color });
        } catch { /* skip */ }
      });
      if (tooltipVals.length > 0) {
        const screenY = toY(tooltipVals[0].y);
        onTooltip({ x: Math.min(screenX, W - 120), y: Math.max(screenY - 60, 4), values: tooltipVals });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, vars, tooltipX, dark]);

  return { canvasRef, rangesRef };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
