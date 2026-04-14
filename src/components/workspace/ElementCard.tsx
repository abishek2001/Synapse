"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { X, GripHorizontal } from "lucide-react";
import { useCanvasStore, type CanvasElement } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import VisualCard from "../canvas/VisualCard";
import GraphCard from "../canvas/GraphCard";
import NotationCard from "../canvas/NotationCard";
import FlashcardCard from "../canvas/FlashcardCard";
import LookupCard from "../canvas/LookupCard";
import SimulationCard from "./SimulationCard";
import type { CanvasTool } from "./InfiniteCanvas";

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  canvasScale: number;
  currentTool: CanvasTool;
  onGroupHover?: (groupId: string | null) => void;
}

// InfiniteCanvas returns early (no capture, no pan/rubber-band) when the pointer
// event target is inside [data-element-id]. That means React handlers here have
// full, uncontested ownership of pointer events on elements.

export default function ElementCard({ element, isSelected, onSelect, canvasScale, currentTool, onGroupHover }: Props) {
  const { moveElement, removeElement, updateElementText, updateStickyContent, setElementHeight } = useCanvasStore();
  const { darkMode } = useUIStore();

  // Measure actual rendered height and report it to the store so GroupBoundary
  // can use real dimensions instead of static estimates.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
  }, []);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      // offsetHeight is transform-independent — unaffected by canvas zoom/pan scale
      const h = el.offsetHeight;
      if (h > 0) setElementHeight(element.id, h);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [element.id, setElementHeight]);

  const [editing, setEditing] = useState(
    (element.type === "text" && !element.text?.content) ||
    (element.type === "sticky" && !element.sticky?.content),
  );

  // Persists drag state across renders without causing re-renders
  const drag = useRef<{
    active: boolean; moved: boolean;
    startX: number; startY: number;
    origX: number; origY: number;
    // For group drag: all members' starting positions
    groupMembers: { id: string; x: number; y: number }[] | null;
  }>({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0, groupMembers: null });

  // Snapshot group member positions at drag start (if element is grouped)
  const snapshotGroup = () => {
    if (!element.groupId) return null;
    const all = useCanvasStore.getState().elements;
    return all.filter(e => e.groupId === element.groupId).map(e => ({ id: e.id, x: e.x, y: e.y }));
  };

  // ── Grip handle: drag in pan OR select mode ───────────────────────────────
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

  // ── Root: click or drag in select mode ───────────────────────────────────
  const onRootDown = (e: React.PointerEvent) => {
    if (currentTool !== "select") return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea, input")) return;
    if (drag.current.active) return; // grip already started drag
    const d = drag.current;
    d.active = true; d.moved = false;
    d.startX = e.clientX; d.startY = e.clientY;
    d.origX = element.x; d.origY = element.y;
    d.groupMembers = snapshotGroup();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onRootMove = (e: React.PointerEvent) => {
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

  const onRootUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    e.stopPropagation();
    d.active = false;
    if (!d.moved) onSelect(element.id, e.shiftKey);
  };

  // ── Text element ──────────────────────────────────────────────────────────

  if (element.type === "text") {
    const content    = element.text?.content ?? "";
    const style      = element.text?.style ?? "body";
    const fontSize   = style === "heading" ? 36 : style === "subheading" ? 22 : 15;
    const fontFamily = style === "body"
      ? "Inter, system-ui, sans-serif"
      : "var(--font-caveat), 'Segoe Print', Georgia, serif";
    const textColor  = element.text?.color || (darkMode ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.78)");

    return (
      <div
        ref={setRef}
        data-element-id={element.id}
        className="absolute group"
        style={{ left: element.x, top: element.y, width: element.w, zIndex: element.zIndex,
          outline: isSelected ? "2px solid rgba(124,58,237,0.5)" : "none",
          outlineOffset: 6, borderRadius: 8 }}
        onPointerDown={onRootDown}
        onPointerMove={onRootMove}
        onPointerUp={onRootUp}
        onPointerCancel={onRootUp}
        onPointerEnter={() => onGroupHover?.(element.groupId ?? null)}
        onPointerLeave={() => onGroupHover?.(null)}
      >
        <div className="absolute -top-6 left-0 right-0 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <div
            className="cursor-grab active:cursor-grabbing px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: darkMode ? "rgba(20,20,40,0.8)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)" }}
            onPointerDown={onGripDown}
            onPointerMove={onRootMove}
            onPointerUp={onRootUp}
            onPointerCancel={onRootUp}
          >
            <GripHorizontal className="w-3 h-3" style={{ color: darkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)" }} />
          </div>
          <button onClick={(e) => { e.stopPropagation(); removeElement(element.id); }}
            className="w-5 h-5 flex items-center justify-center rounded-md"
            style={{ backgroundColor: darkMode ? "rgba(20,20,40,0.8)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)" }}>
            <X className="w-3 h-3" style={{ color: darkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)" }} />
          </button>
        </div>
        {editing ? (
          <textarea autoFocus value={content}
            onChange={(e) => updateElementText(element.id, e.target.value)}
            onBlur={() => { if (content.trim()) setEditing(false); }}
            placeholder="Type here..."
            className="bg-transparent resize-none outline-none w-full"
            style={{ fontFamily, fontSize, color: textColor, lineHeight: 1.45 }}
            rows={style === "body" ? 2 : 1} />
        ) : (
          <p onClick={() => setEditing(true)} className="cursor-text whitespace-pre-wrap"
            style={{ fontFamily, fontSize, color: textColor, lineHeight: 1.45, minHeight: fontSize + 8 }}>
            {content || <span style={{ opacity: 0.3 }}>Click to edit...</span>}
          </p>
        )}
      </div>
    );
  }

  // ── Sticky element ────────────────────────────────────────────────────────

  if (element.type === "sticky") {
    const content = element.sticky?.content ?? "";
    const bg      = element.sticky?.color ?? "#fef08a";

    return (
      <motion.div
        ref={setRef}
        data-element-id={element.id}
        initial={{ opacity: 0, scale: 0.85, rotate: -1.5 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        className="absolute group shadow-md"
        style={{ left: element.x, top: element.y, width: element.w, backgroundColor: bg,
          borderRadius: 8, zIndex: element.zIndex,
          outline: isSelected ? "2px solid rgba(124,58,237,0.5)" : "none", outlineOffset: 4 }}
        onPointerDown={onRootDown}
        onPointerMove={onRootMove}
        onPointerUp={onRootUp}
        onPointerCancel={onRootUp}
        onPointerEnter={() => onGroupHover?.(element.groupId ?? null)}
        onPointerLeave={() => onGroupHover?.(null)}
      >
        <div className="flex items-start justify-between p-1 pb-0">
          <div className="cursor-grab active:cursor-grabbing p-1"
            onPointerDown={onGripDown}
            onPointerMove={onRootMove}
            onPointerUp={onRootUp}
            onPointerCancel={onRootUp}>
            <GripHorizontal className="w-3 h-3 text-black/20" />
          </div>
          <button onClick={(e) => { e.stopPropagation(); removeElement(element.id); }}
            className="p-1 text-black/20 hover:text-black/50 transition-colors opacity-0 group-hover:opacity-100">
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="px-3 pb-3">
          {editing ? (
            <textarea autoFocus value={content}
              onChange={(e) => updateStickyContent(element.id, e.target.value)}
              onBlur={() => { if (content.trim()) setEditing(false); }}
              placeholder="Note..."
              className="bg-transparent resize-none outline-none w-full text-black/70"
              style={{ fontFamily: "var(--font-caveat), 'Segoe Print', cursive", fontSize: 18, lineHeight: 1.4 }}
              rows={3} />
          ) : (
            <p onClick={() => setEditing(true)}
              className="cursor-text text-black/70 whitespace-pre-wrap min-h-[50px]"
              style={{ fontFamily: "var(--font-caveat), 'Segoe Print', cursive", fontSize: 18, lineHeight: 1.4 }}>
              {content || "Click to edit..."}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // ── Artifact element ──────────────────────────────────────────────────────

  const { artifact } = element;
  if (!artifact) return null;

  return (
    <motion.div
      ref={setRef}
      data-element-id={element.id}
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", damping: 22, stiffness: 260 }}
      className="absolute group"
      style={{ left: element.x, top: element.y, width: element.w, zIndex: element.zIndex,
        outline: isSelected && artifact.type !== "flashcard" ? "2px solid rgba(124,58,237,0.4)" : "none",
        outlineOffset: 8, borderRadius: 12,
        cursor: element.groupId ? "default" : "grab" }}
      onPointerDown={onRootDown}
      onPointerMove={onRootMove}
      onPointerUp={onRootUp}
      onPointerCancel={onRootUp}
      onPointerEnter={() => onGroupHover?.(element.groupId ?? null)}
      onPointerLeave={() => onGroupHover?.(null)}
    >
      {/* Hover toolbar */}
      <div className="absolute -top-7 left-0 right-0 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-10 px-0.5">
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md cursor-grab active:cursor-grabbing"
          style={{ backgroundColor: darkMode ? "rgba(20,20,40,0.88)" : "rgba(255,255,255,0.94)",
            backdropFilter: "blur(8px)",
            border: darkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)" }}
          onPointerDown={onGripDown}
          onPointerMove={onRootMove}
          onPointerUp={onRootUp}
          onPointerCancel={onRootUp}
        >
          <GripHorizontal className="w-3 h-3" style={{ color: darkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.3)" }} />
          <span className="text-[9px] font-medium" style={{ color: darkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)" }}>
            drag
          </span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); removeElement(element.id); }}
          className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
          style={{ backgroundColor: darkMode ? "rgba(20,20,40,0.88)" : "rgba(255,255,255,0.94)",
            backdropFilter: "blur(8px)",
            border: darkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)" }}>
          <X className="w-3 h-3" style={{ color: darkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)" }} />
        </button>
      </div>

      {artifact.type === "flashcard" ? (
        <div className="rounded-2xl overflow-hidden transition-shadow duration-150"
          style={{ background: darkMode ? "rgba(16,16,28,0.97)" : "rgba(255,255,255,0.98)",
            border: isSelected ? "1.5px solid rgba(124,58,237,0.55)" : darkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)",
            boxShadow: isSelected
              ? "0 0 0 4px rgba(124,58,237,0.1), 0 8px 36px rgba(0,0,0,0.18)"
              : darkMode ? "0 4px 24px rgba(0,0,0,0.42)" : "0 2px 14px rgba(0,0,0,0.07)" }}>
          <div className="p-4">
            <FlashcardCard artifact={artifact} />
          </div>
        </div>
      ) : (
        <div className="py-1">
          {artifact.type === "visual"     && <VisualCard artifact={artifact} />}
          {artifact.type === "graph"      && <GraphCard artifact={artifact} />}
          {artifact.type === "notation"   && <NotationCard artifact={artifact} dark={darkMode} />}
          {artifact.type === "lookup"     && <LookupCard artifact={artifact} />}
          {artifact.type === "simulation" && <SimulationCard artifact={artifact} expanded />}
        </div>
      )}
    </motion.div>
  );
}
