"use client";

import { useEffect, useRef } from "react";
import type { GraphArtifact } from "@/lib/tools/types";
import { chartTheme } from "./theme";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#eab308"];
const W = 340, H = 200, PAD_V = 24, PAD_H = 40;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function boxStats(vals: number[]) {
  const sorted = [...vals].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const med = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const wLow = Math.max(sorted[0], q1 - 1.5 * iqr);
  const wHigh = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr);
  return { q1, med, q3, wLow, wHigh };
}

function kde(vals: number[], bandwidth: number, x: number): number {
  return vals.reduce((sum, v) => sum + Math.exp(-0.5 * ((x - v) / bandwidth) ** 2), 0) / (vals.length * bandwidth * Math.sqrt(2 * Math.PI));
}

export function useDistributionChart(artifact: GraphArtifact, dark = false) {
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

    const plotW = W - 2 * PAD_H;
    const plotH = H - 2 * PAD_V;

    const series = artifact.series.filter(s => s.data && s.data.length > 0);
    if (series.length === 0) return;

    const allVals = series.flatMap(s => s.data!.map(d => d.y));
    const globalMin = Math.min(...allVals);
    const globalMax = Math.max(...allVals);
    const pad = (globalMax - globalMin) * 0.1 || 1;
    const yMin = globalMin - pad, yMax = globalMax + pad;

    const toY = (v: number) => PAD_V + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    // Grid
    ctx.strokeStyle = theme.grid; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const gy = PAD_V + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(PAD_H, gy); ctx.lineTo(PAD_H + plotW, gy); ctx.stroke();
    }
    ctx.fillStyle = theme.axisLabel; ctx.font = "10px Inter, system-ui, sans-serif"; ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = yMin + ((4 - i) / 4) * (yMax - yMin);
      ctx.fillText(val.toFixed(1), PAD_H - 4, PAD_V + (i / 4) * plotH + 3);
    }

    if (artifact.graph_type === "density") {
      // x = data value range, y = probability density
      const allDataVals = series.flatMap(s => s.data!.map(d => d.y));
      const dMin = Math.min(...allDataVals);
      const dMax = Math.max(...allDataVals);
      const spread = dMax - dMin || 1;
      const xMin = artifact.x_range?.[0] ?? (dMin - spread * 0.3);
      const xMax = artifact.x_range?.[1] ?? (dMax + spread * 0.3);
      const bandwidth = spread * 0.18;
      const kdeSteps = 120;

      const toX = (v: number) => PAD_H + ((v - xMin) / (xMax - xMin)) * plotW;
      const pts = (si: number): number[] =>
        Array.from({ length: kdeSteps + 1 }, (_, i) => {
          const x = xMin + (i / kdeSteps) * (xMax - xMin);
          return kde(series[si].data!.map(d => d.y), bandwidth, x);
        });

      const allPts = series.map((_, si) => pts(si));
      const maxD = Math.max(...allPts.flat()) * 1.1 || 0.1;
      const toDY = (d: number) => PAD_V + plotH - (d / maxD) * plotH;

      // Grid
      ctx.strokeStyle = theme.grid; ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const gy = PAD_V + (i / 4) * plotH;
        ctx.beginPath(); ctx.moveTo(PAD_H, gy); ctx.lineTo(PAD_H + plotW, gy); ctx.stroke();
      }
      // x-axis labels (value)
      ctx.fillStyle = theme.axisLabel; ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i <= 4; i++) {
        const val = xMin + (i / 4) * (xMax - xMin);
        ctx.fillText(val.toFixed(1), toX(val), H - 5);
      }
      // y-axis label
      ctx.textAlign = "right";
      ctx.fillText("density", PAD_H - 4, PAD_V + 6);

      // Zero line
      ctx.strokeStyle = theme.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD_H, PAD_V + plotH); ctx.lineTo(PAD_H + plotW, PAD_V + plotH); ctx.stroke();

      // Draw each series
      series.forEach((s, si) => {
        const densities = allPts[si];
        const color = s.color || COLORS[si % COLORS.length];

        // Fill
        ctx.beginPath();
        ctx.moveTo(toX(xMin), PAD_V + plotH);
        for (let i = 0; i <= kdeSteps; i++) {
          ctx.lineTo(toX(xMin + (i / kdeSteps) * (xMax - xMin)), toDY(densities[i]));
        }
        ctx.lineTo(toX(xMax), PAD_V + plotH);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.15);
        ctx.fill();

        // Stroke
        ctx.beginPath();
        ctx.moveTo(toX(xMin), toDY(densities[0]));
        for (let i = 1; i <= kdeSteps; i++) {
          ctx.lineTo(toX(xMin + (i / kdeSteps) * (xMax - xMin)), toDY(densities[i]));
        }
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();

        // Mean dashed vertical
        const mean = s.data!.reduce((sum, d) => sum + d.y, 0) / s.data!.length;
        ctx.strokeStyle = hexToRgba(color, 0.45); ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(toX(mean), PAD_V); ctx.lineTo(toX(mean), PAD_V + plotH); ctx.stroke();
        ctx.setLineDash([]);
      });

      // Legend
      let lx = PAD_H + 4, ly = PAD_V + 12;
      series.forEach((s, idx) => {
        const color = s.color || COLORS[idx % COLORS.length];
        ctx.fillStyle = color; ctx.fillRect(lx, ly - 5, 12, 2.5);
        ctx.fillStyle = theme.legendLabel; ctx.font = "10px Inter, system-ui, sans-serif"; ctx.textAlign = "left";
        ctx.fillText(s.label, lx + 16, ly);
        ly += 14;
      });
      return;
    }

    const groupW = plotW / series.length;

    if (artifact.graph_type === "box") {
      series.forEach((s, si) => {
        const vals = s.data!.map(d => d.y);
        const { q1, med, q3, wLow, wHigh } = boxStats(vals);
        const color = s.color || COLORS[si % COLORS.length];
        const cx = PAD_H + si * groupW + groupW / 2;
        const bw = groupW * 0.45;

        // IQR box
        ctx.fillStyle = hexToRgba(color, 0.18);
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        const boxTop = toY(q3), boxBot = toY(q1);
        ctx.beginPath(); ctx.roundRect(cx - bw / 2, boxTop, bw, boxBot - boxTop, 3); ctx.fill(); ctx.stroke();

        // Median line
        const medY = toY(med);
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - bw / 2, medY); ctx.lineTo(cx + bw / 2, medY); ctx.stroke();

        // Whiskers
        ctx.strokeStyle = hexToRgba(color, 0.6); ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.moveTo(cx, toY(wLow)); ctx.lineTo(cx, boxBot); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, toY(wHigh)); ctx.lineTo(cx, boxTop); ctx.stroke();
        ctx.setLineDash([]);
        // Whisker caps
        const capW = bw * 0.4;
        ctx.beginPath(); ctx.moveTo(cx - capW / 2, toY(wLow)); ctx.lineTo(cx + capW / 2, toY(wLow)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - capW / 2, toY(wHigh)); ctx.lineTo(cx + capW / 2, toY(wHigh)); ctx.stroke();

        // Label
        ctx.fillStyle = theme.legendLabel; ctx.font = "10px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(s.label, cx, H - 8);
      });
    } else {
      // Violin
      const kdeSteps = 80;
      series.forEach((s, si) => {
        const vals = s.data!.map(d => d.y);
        const bandwidth = (yMax - yMin) * 0.12;
        const color = s.color || COLORS[si % COLORS.length];
        const cx = PAD_H + si * groupW + groupW / 2;
        const maxWidth = groupW * 0.42;

        // KDE curve
        const densities: { y: number; d: number }[] = [];
        for (let i = 0; i <= kdeSteps; i++) {
          const y = yMin + (i / kdeSteps) * (yMax - yMin);
          densities.push({ y, d: kde(vals, bandwidth, y) });
        }
        const maxD = Math.max(...densities.map(d => d.d)) || 1;

        // Draw violin (mirrored)
        ctx.beginPath();
        ctx.moveTo(cx, toY(densities[0].y));
        for (const { y, d } of densities) {
          ctx.lineTo(cx + (d / maxD) * maxWidth, toY(y));
        }
        for (let i = densities.length - 1; i >= 0; i--) {
          const { y, d } = densities[i];
          ctx.lineTo(cx - (d / maxD) * maxWidth, toY(y));
        }
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.2);
        ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();

        // Median dot
        const { med } = boxStats(vals);
        ctx.beginPath(); ctx.arc(cx, toY(med), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();

        // Label
        ctx.fillStyle = theme.legendLabel; ctx.font = "10px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(s.label, cx, H - 8);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact, dark]);

  return canvasRef;
}
