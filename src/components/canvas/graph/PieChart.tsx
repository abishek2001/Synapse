"use client";

import { useEffect, useRef } from "react";
import type { GraphArtifact } from "@/lib/tools/types";

const COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f97316", "#ec4899", "#eab308"];
const W = 340, H = 200;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function usePieChart(artifact: GraphArtifact) {
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

    // Each series = one slice. Value = data[0].y or 1
    const slices = artifact.series.map((s, idx) => ({
      label: s.label,
      value: s.data?.[0]?.y ?? 1,
      color: s.color || COLORS[idx % COLORS.length],
    }));

    const total = slices.reduce((sum, s) => sum + Math.abs(s.value), 0);
    if (total === 0) return;

    const cx = W * 0.38, cy = H / 2;
    const outerR = Math.min(H / 2 - 16, 76);
    const innerR = outerR * 0.4; // donut hole

    let angle = -Math.PI / 2;
    slices.forEach(s => {
      const sweep = (Math.abs(s.value) / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(s.color, 0.88);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5;
      ctx.stroke();
      angle += sweep;
    });

    // Donut hole
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();

    // Legend
    const legendX = W * 0.68;
    let legendY = cy - (slices.length * 18) / 2 + 9;
    slices.forEach(s => {
      ctx.fillStyle = hexToRgba(s.color, 0.88);
      ctx.beginPath(); ctx.arc(legendX, legendY - 3, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      const pct = ((Math.abs(s.value) / total) * 100).toFixed(1);
      ctx.fillText(`${s.label} (${pct}%)`, legendX + 10, legendY);
      legendY += 18;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact]);

  return canvasRef;
}
