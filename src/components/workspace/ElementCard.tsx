"use client";

import { useState, useRef, useEffect, useCallback, Component, type ReactNode, type ErrorInfo } from "react";
import { motion } from "framer-motion";

// ── Error Boundary ──────────────────────────────────────────────────────────────

interface EBProps { children: ReactNode; type: string }
interface EBState { error: string | null }

class CardErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(e: Error): EBState { return { error: e.message }; }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error(`[${this.props.type} card error]`, e, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl p-4 text-[11px]" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "rgba(239,68,68,0.7)" }}>
          <span className="font-semibold uppercase tracking-wider">{this.props.type}</span> render error
          <p className="mt-1 opacity-60 font-mono break-all">{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
import { X, GripHorizontal, RefreshCw, Lightbulb, MessageCircle, Send } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useCanvasStore, type CanvasElement } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import { useSessionStore } from "@/store/session";
import VisualCard from "../canvas/VisualCard";
import GraphCard from "../canvas/GraphCard";
import NotationCard from "../canvas/NotationCard";
import FlashcardCard from "../canvas/FlashcardCard";
import LookupCard from "../canvas/LookupCard";
import DiagramCard from "../canvas/DiagramCard";
import Render3DCard from "../canvas/Render3DCard";
import SimulationCard from "./SimulationCard";
import CitationChips from "../canvas/CitationChips";
import SkeletonCard from "../canvas/SkeletonCard";
import type { CanvasTool } from "./InfiniteCanvas";

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  canvasScale: number;
  currentTool: CanvasTool;
  onGroupHover?: (groupId: string | null) => void;
}

/**
 * Counter-scale: only activates when zoomed IN beyond birthScale.
 * - canvasScale ≤ birthScale → return 1 (element shrinks naturally with canvas,
 *   world-space footprint = logical width — group bounds and layout stay correct)
 * - canvasScale > birthScale → return birthScale/canvasScale (caps visual size at
 *   the element's natural CSS dimensions so it stays usable when zoomed way in)
 */
function computeCounterScale(canvasScale: number, birthScale: number): number {
  if (canvasScale <= birthScale) return 1;
  return birthScale / canvasScale;
}

export default function ElementCard({ element, isSelected, onSelect, canvasScale, currentTool, onGroupHover }: Props) {
  const { moveElement, removeElement, updateElementText, updateStickyContent, setElementHeight } = useCanvasStore();
  const { darkMode } = useUIStore();
  const setPendingVoiceText = useSessionStore((s) => s.setPendingVoiceText);

  const requestRegenerate = useCallback(() => {
    if (!element.artifact) return;
    const title = element.artifact.title || element.artifact.type;
    setPendingVoiceText(`Please regenerate the ${element.artifact.type} "${title}" — try a fresh approach to it.`);
  }, [element.artifact, setPendingVoiceText]);

  const requestExplainDifferently = useCallback(() => {
    if (!element.artifact) return;
    const title = element.artifact.title || element.artifact.type;
    setPendingVoiceText(`Explain the ${element.artifact.type} "${title}" differently — pick a new angle, new metaphor, or break it down for a beginner.`);
  }, [element.artifact, setPendingVoiceText]);

  // Inline mini-chat targeted at this specific artifact
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const submitChat = useCallback(() => {
    const txt = chatText.trim();
    if (!txt || !element.artifact) return;
    const title = element.artifact.title || element.artifact.type;
    setPendingVoiceText(
      `About the ${element.artifact.type} "${title}" — ${txt}`,
    );
    setChatText("");
    setChatOpen(false);
  }, [chatText, element.artifact, setPendingVoiceText]);

  // Measure actual rendered height so GroupBoundary can use real dimensions.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
  }, []);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      // offsetHeight is transform-independent — unaffected by canvas zoom or counter-scale
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

  // Birth-scale counter-transform
  const birthScale = element.birthScale ?? 1;
  const counterScale = computeCounterScale(canvasScale, birthScale);

  // ── Drag state ───────────────────────────────────────────────────────────────
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

  // ── Grip handle: drag in pan OR select mode ──────────────────────────────────
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

  // ── Root: click or drag in select mode ──────────────────────────────────────
  const onRootDown = (e: React.PointerEvent) => {
    if (currentTool !== "select") return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea, input")) return;
    if (drag.current.active) return;
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

  // ── Shared wrapper style (positioning + birth-scale counter-transform) ───────
  const wrapStyle: React.CSSProperties = {
    position: "absolute",
    left: element.x,
    top: element.y,
    width: element.w,
    zIndex: element.zIndex,
    transform: `scale(${counterScale})`,
    transformOrigin: "0 0",
  };

  // ── Text element ─────────────────────────────────────────────────────────────

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
        className="group"
        style={{
          ...wrapStyle,
          outline: isSelected ? "2px solid rgba(124,58,237,0.5)" : "none",
          outlineOffset: 6, borderRadius: 8,
        }}
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

  // ── Sticky element ───────────────────────────────────────────────────────────

  if (element.type === "sticky") {
    const content = element.sticky?.content ?? "";
    const bg      = element.sticky?.color ?? "#fef08a";

    return (
      <div
        ref={setRef}
        data-element-id={element.id}
        className="group"
        style={wrapStyle}
        onPointerDown={onRootDown}
        onPointerMove={onRootMove}
        onPointerUp={onRootUp}
        onPointerCancel={onRootUp}
        onPointerEnter={() => onGroupHover?.(element.groupId ?? null)}
        onPointerLeave={() => onGroupHover?.(null)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85, rotate: -1.5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          className="shadow-md"
          style={{ backgroundColor: bg, borderRadius: 8,
            outline: isSelected ? "2px solid rgba(124,58,237,0.5)" : "none", outlineOffset: 4 }}
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
      </div>
    );
  }

  // ── Pending (skeleton) element ───────────────────────────────────────────────

  if (element.pending) {
    return (
      <div
        ref={setRef}
        data-element-id={element.id}
        style={wrapStyle}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
        >
          <SkeletonCard artifactType={element.type} />
        </motion.div>
      </div>
    );
  }

  // ── Artifact element ─────────────────────────────────────────────────────────

  const { artifact } = element;
  if (!artifact) return null;

  return (
    <div
      ref={setRef}
      data-element-id={element.id}
      className="group"
      style={{
        ...wrapStyle,
        outline: isSelected && artifact.type !== "flashcard" ? "2px solid rgba(124,58,237,0.4)" : "none",
        outlineOffset: 8, borderRadius: 12,
        cursor: element.groupId ? "default" : "grab",
      }}
      onPointerDown={onRootDown}
      onPointerMove={onRootMove}
      onPointerUp={onRootUp}
      onPointerCancel={onRootUp}
      onPointerEnter={() => onGroupHover?.(element.groupId ?? null)}
      onPointerLeave={() => onGroupHover?.(null)}
    >
      {/* Hover toolbar — outside motion.div so it's not affected by entrance animation */}
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
        <div
          className="flex items-center gap-0.5 rounded-md overflow-hidden"
          style={{
            backgroundColor: darkMode ? "rgba(20,20,40,0.88)" : "rgba(255,255,255,0.94)",
            backdropFilter: "blur(8px)",
            border: darkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); requestRegenerate(); }}
            className={`flex items-center justify-center w-6 h-6 transition-colors ${darkMode ? "text-white/45 hover:text-violet-300 hover:bg-white/[0.08]" : "text-black/45 hover:text-violet-600 hover:bg-black/[0.04]"}`}
            title="Regenerate"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); requestExplainDifferently(); }}
            className={`flex items-center justify-center w-6 h-6 transition-colors ${darkMode ? "text-white/45 hover:text-amber-300 hover:bg-white/[0.08]" : "text-black/45 hover:text-amber-600 hover:bg-black/[0.04]"}`}
            title="Explain differently"
          >
            <Lightbulb className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setChatOpen((v) => !v); }}
            className={`flex items-center justify-center w-6 h-6 transition-colors ${chatOpen ? (darkMode ? "text-violet-300 bg-white/[0.08]" : "text-violet-600 bg-black/[0.04]") : darkMode ? "text-white/45 hover:text-cyan-300 hover:bg-white/[0.08]" : "text-black/45 hover:text-cyan-600 hover:bg-black/[0.04]"}`}
            title="Ask about this"
          >
            <MessageCircle className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); removeElement(element.id); }}
            className={`flex items-center justify-center w-6 h-6 transition-colors ${darkMode ? "text-white/35 hover:text-red-400 hover:bg-white/[0.08]" : "text-black/30 hover:text-red-500 hover:bg-black/[0.04]"}`}
            title="Delete"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Inline mini-chat popover — anchored above the artifact */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute -top-16 right-0 z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-xl shadow-lg"
            style={{
              backgroundColor: darkMode ? "rgba(20,20,40,0.96)" : "rgba(255,255,255,0.98)",
              border: darkMode ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
              backdropFilter: "blur(10px)",
              minWidth: 280,
            }}
          >
            <input
              autoFocus
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitChat(); }
                if (e.key === "Escape") { e.preventDefault(); setChatOpen(false); }
              }}
              placeholder="Ask about this artifact..."
              className={`flex-1 bg-transparent text-[12px] outline-none placeholder:opacity-40 ${darkMode ? "text-white/85" : "text-black/85"}`}
            />
            <button
              onClick={submitChat}
              disabled={!chatText.trim()}
              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${chatText.trim() ? "bg-violet-500 text-white hover:bg-violet-600" : darkMode ? "bg-white/[0.06] text-white/30" : "bg-black/[0.05] text-black/30"}`}
              title="Send"
            >
              <Send className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entrance animation wrapper */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 260 }}
      >
        {artifact.type === "flashcard" ? (
          <div className="rounded-2xl overflow-hidden transition-shadow duration-150"
            style={{ background: darkMode ? "rgba(16,16,28,0.97)" : "rgba(255,255,255,0.98)",
              border: isSelected ? "1.5px solid rgba(124,58,237,0.55)" : darkMode ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(0,0,0,0.07)",
              boxShadow: isSelected
                ? "0 0 0 4px rgba(124,58,237,0.1), 0 8px 36px rgba(0,0,0,0.18)"
                : darkMode ? "0 4px 24px rgba(0,0,0,0.42)" : "0 2px 14px rgba(0,0,0,0.07)" }}>
            <div className="p-4">
              <CardErrorBoundary type="flashcard">
                <FlashcardCard artifact={artifact} />
              </CardErrorBoundary>
              <CitationChips citations={artifact.citations} dark={darkMode} />
            </div>
          </div>
        ) : (
          <div className="py-1">
            {artifact.type === "visual"     && <CardErrorBoundary type="visual"><VisualCard artifact={artifact} /></CardErrorBoundary>}
            {artifact.type === "diagram"    && <CardErrorBoundary type="diagram"><DiagramCard artifact={artifact} /></CardErrorBoundary>}
            {artifact.type === "graph"      && <CardErrorBoundary type="graph"><GraphCard artifact={artifact} /></CardErrorBoundary>}
            {artifact.type === "notation"   && <CardErrorBoundary type="notation"><NotationCard artifact={artifact} dark={darkMode} /></CardErrorBoundary>}
            {artifact.type === "lookup"     && <CardErrorBoundary type="lookup"><LookupCard artifact={artifact} /></CardErrorBoundary>}
            {artifact.type === "simulation" && <CardErrorBoundary type="simulation"><SimulationCard artifact={artifact} expanded /></CardErrorBoundary>}
            {artifact.type === "render3d"   && <CardErrorBoundary type="render3d"><Render3DCard artifact={artifact} /></CardErrorBoundary>}
            <div className="px-3">
              <CitationChips citations={artifact.citations} dark={darkMode} />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
