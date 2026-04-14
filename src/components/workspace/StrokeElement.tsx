"use client";

import { useRef } from "react";
import { useCanvasStore, type CanvasElement } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import { GripHorizontal } from "lucide-react";
import type { CanvasTool } from "./InfiniteCanvas";

function strokeToPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  canvasScale: number;
  currentTool: CanvasTool;
  onGroupHover?: (groupId: string | null) => void;
}

export default function StrokeElement({ element, isSelected, onSelect, canvasScale, currentTool, onGroupHover }: Props) {
  const { moveElement } = useCanvasStore();
  const { darkMode } = useUIStore();

  const drag = useRef<{
    active: boolean; moved: boolean;
    startX: number; startY: number;
    origX: number; origY: number;
    groupMembers: { id: string; x: number; y: number }[] | null;
  }>({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0, groupMembers: null });

  const snapshotGroup = () => {
    if (!element.groupId) return null;
    const all = useCanvasStore.getState().elements;
    return all.filter(e => e.groupId === element.groupId).map(e => ({ id: e.id, x: e.x, y: e.y }));
  };

  const onGripDown = (e: React.PointerEvent) => {
    if (currentTool === "interaction" || currentTool === "pen") return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const d = drag.current;
    d.active = true; d.moved = false;
    d.startX = e.clientX; d.startY = e.clientY;
    d.origX = element.x; d.origY = element.y;
    d.groupMembers = snapshotGroup();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onRootDown = (e: React.PointerEvent) => {
    if (currentTool !== "select") return;
    if (e.button !== 0) return;
    if (drag.current.active) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    const d = drag.current;
    d.active = true; d.moved = false;
    d.startX = e.clientX; d.startY = e.clientY;
    d.origX = element.x; d.origY = element.y;
    d.groupMembers = snapshotGroup();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    e.stopPropagation();
    const dx = (e.clientX - d.startX) / canvasScale;
    const dy = (e.clientY - d.startY) / canvasScale;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    if (d.moved) {
      if (d.groupMembers) {
        for (const m of d.groupMembers) moveElement(m.id, m.x + dx, m.y + dy);
      } else {
        moveElement(element.id, d.origX + dx, d.origY + dy);
      }
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    e.stopPropagation();
    d.active = false;
    if (!d.moved) onSelect(element.id, e.shiftKey);
  };

  const stroke = element.stroke;
  if (!stroke) return null;

  const isLocked = !!element.groupId;
  const selColor  = darkMode ? "rgba(124,58,237,0.7)" : "rgba(124,58,237,0.6)";

  return (
    <div
      data-element-id={element.id}
      className="absolute group"
      style={{ left: element.x, top: element.y, width: element.w, height: stroke.height,
        cursor: isLocked ? "default" : "crosshair",
        userSelect: "none", touchAction: "none",
        zIndex: 9000 + (element.zIndex ?? 0) }}
      onPointerDown={onRootDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={() => onGroupHover?.(element.groupId ?? null)}
      onPointerLeave={() => onGroupHover?.(null)}
    >
      {/* Grip handle */}
      <div
        className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-1.5 py-0.5 rounded-md cursor-grab active:cursor-grabbing z-10"
        style={{ backgroundColor: darkMode ? "rgba(20,20,40,0.88)" : "rgba(255,255,255,0.94)",
          backdropFilter: "blur(8px)",
          border: darkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)" }}
        onPointerDown={onGripDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <GripHorizontal className="w-3 h-3" style={{ color: darkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)" }} />
        <span className="text-[9px] font-medium" style={{ color: darkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)" }}>drag</span>
      </div>

      <svg width={element.w} height={stroke.height}
        style={{ display: "block", overflow: "visible", pointerEvents: "none" }}>
        <path d={strokeToPath(stroke.points)} fill="none"
          stroke={stroke.color} strokeWidth={stroke.width}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      </svg>

      {isSelected && (
        <div style={{ position: "absolute", inset: -5, border: `2px dashed ${selColor}`,
          borderRadius: 8, backgroundColor: "rgba(124,58,237,0.04)", pointerEvents: "none" }} />
      )}

      {isLocked && isSelected && (
        <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)",
          fontSize: 9, color: selColor, whiteSpace: "nowrap", pointerEvents: "none",
          fontWeight: 600, letterSpacing: "0.05em" }}>
          GROUPED · LOCKED
        </div>
      )}
    </div>
  );
}
