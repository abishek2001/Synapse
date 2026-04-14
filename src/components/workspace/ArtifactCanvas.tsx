"use client";

import { useCanvasStore, type CanvasModule, type CanvasAnnotation } from "@/store/canvas";
import { useSessionStore } from "@/store/session";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Send,
  Loader2,
  Undo2,
  MessageSquare,
  ArrowLeft,
  Trash2,
} from "lucide-react";
import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CanvasArtifact } from "@/lib/tools/types";
import VisualCard from "../canvas/VisualCard";
import GraphCard from "../canvas/GraphCard";
import NotationCard from "../canvas/NotationCard";
import FlashcardCard from "../canvas/FlashcardCard";
import LookupCard from "../canvas/LookupCard";
import SimulationCard from "./SimulationCard";
import InfiniteCanvas, { type CanvasTool, type InfiniteCanvasHandle } from "./InfiniteCanvas";
import HandTrackingOverlay, { type HandGestureEvent } from "./HandTrackingOverlay";

const TYPE_META: Record<string, { icon: string; label: string; accent: string }> = {
  visual: { icon: "🎨", label: "Visual", accent: "#7c3aed" },
  graph: { icon: "📈", label: "Graph", accent: "#0ea5e9" },
  notation: { icon: "∑", label: "Notation", accent: "#f97316" },
  flashcard: { icon: "🃏", label: "Flashcards", accent: "#10b981" },
  lookup: { icon: "🔎", label: "Lookup", accent: "#6366f1" },
  simulation: { icon: "🌌", label: "3D Simulation", accent: "#06b6d4" },
};

const STICKY_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];

const MODULE_W = 340;
const MODULE_H_ESTIMATE = 230;
const TITLE_Y = 60;
const ARTIFACTS_Y = 160;

interface ArtifactCanvasProps {
  topic?: string;
}

export default function ArtifactCanvas({ topic }: ArtifactCanvasProps) {
  const {
    modules,
    annotations,
    toasts,
    autoExpandModuleId,
    removeModule,
    addAnnotation,
    moveAnnotation,
    updateAnnotation,
    removeAnnotation,
    setAutoExpandModuleId,
  } = useCanvasStore();

  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<CanvasModule[]>([]);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(false);
  const canvasHandleRef = useRef<InfiniteCanvasHandle>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const handDragTarget = useRef<{ type: "module" | "annotation"; id: string; offsetX: number; offsetY: number } | null>(null);
  const [handHighlight, setHandHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const highlightStart = useRef<{ x: number; y: number } | null>(null);

  const expanded = modules.find((m) => m.id === expandedModuleId);

  const handleGesture = useCallback((event: HandGestureEvent) => {
    const handle = canvasHandleRef.current;
    if (!handle) return;

    switch (event.type) {
      case "pinch_start": {
        const world = handle.screenToWorld(event.screenX, event.screenY);

        // Check if pinching on a module
        const hitMod = modules.find((m) => {
          const mx = m.position.x, my = m.position.y;
          return world.x >= mx && world.x <= mx + MODULE_W && world.y >= my && world.y <= my + MODULE_H_ESTIMATE;
        });
        if (hitMod) {
          handDragTarget.current = {
            type: "module",
            id: hitMod.id,
            offsetX: world.x - hitMod.position.x,
            offsetY: world.y - hitMod.position.y,
          };
          return;
        }

        // Check if pinching on an annotation
        const hitAnn = annotations.find((a) => {
          const ax = a.position.x, ay = a.position.y;
          const aw = a.type === "sticky" ? 200 : 150;
          const ah = a.type === "sticky" ? 120 : 30;
          return world.x >= ax && world.x <= ax + aw && world.y >= ay && world.y <= ay + ah;
        });
        if (hitAnn) {
          handDragTarget.current = {
            type: "annotation",
            id: hitAnn.id,
            offsetX: world.x - hitAnn.position.x,
            offsetY: world.y - hitAnn.position.y,
          };
          return;
        }

        // Start highlight rectangle
        highlightStart.current = world;
        setHandHighlight({ x: world.x, y: world.y, w: 0, h: 0 });
        break;
      }

      case "pinch_move": {
        const world = handle.screenToWorld(event.screenX, event.screenY);

        if (handDragTarget.current) {
          const { type, id, offsetX, offsetY } = handDragTarget.current;
          const nx = world.x - offsetX;
          const ny = world.y - offsetY;
          if (type === "module") {
            useCanvasStore.getState().moveModule(id, nx, ny);
          } else {
            moveAnnotation(id, nx, ny);
          }
          return;
        }

        if (highlightStart.current) {
          const sx = highlightStart.current.x;
          const sy = highlightStart.current.y;
          setHandHighlight({
            x: Math.min(sx, world.x),
            y: Math.min(sy, world.y),
            w: Math.abs(world.x - sx),
            h: Math.abs(world.y - sy),
          });
        }
        break;
      }

      case "pinch_end": {
        handDragTarget.current = null;

        if (highlightStart.current && handHighlight && handHighlight.w > 20 && handHighlight.h > 20) {
          // Convert highlight to a sticky note annotation
          addAnnotation({
            id: `ann-hl-${Date.now()}`,
            type: "sticky",
            content: "",
            position: { x: handHighlight.x, y: handHighlight.y },
            color: "#bfdbfe",
          });
        }
        highlightStart.current = null;
        setHandHighlight(null);
        break;
      }

      case "pan": {
        if (event.deltaX !== undefined && event.deltaY !== undefined) {
          handle.panBy(event.deltaX * 0.7, event.deltaY * 0.7);
        }
        break;
      }

      case "move":
        break;
    }
  }, [modules, annotations, moveAnnotation, addAnnotation, handHighlight]);

  useEffect(() => {
    if (autoExpandModuleId) {
      setExpandedModuleId(autoExpandModuleId);
      setAutoExpandModuleId(null);
    }
  }, [autoExpandModuleId, setAutoExpandModuleId]);

  const handleDismiss = useCallback(
    (mod: CanvasModule) => {
      removeModule(mod.id);
      setUndoStack((prev) => [...prev, mod]);
      setTimeout(() => {
        setUndoStack((prev) => prev.filter((m) => m.id !== mod.id));
      }, 6000);
    },
    [removeModule],
  );

  const handleUndo = useCallback(
    (mod: CanvasModule) => {
      const store = useCanvasStore.getState();
      useCanvasStore.setState({
        modules: [...store.modules, mod],
      });
      setUndoStack((prev) => prev.filter((m) => m.id !== mod.id));
    },
    [],
  );

  const handleCanvasClick = useCallback(
    (worldX: number, worldY: number, clickTool: CanvasTool) => {
      if (clickTool === "text") {
        const annotation: CanvasAnnotation = {
          id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          type: "text",
          content: "",
          position: { x: worldX, y: worldY },
          color: "#1a1a2e",
        };
        addAnnotation(annotation);
        setTool("select");
      } else if (clickTool === "sticky") {
        const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
        const annotation: CanvasAnnotation = {
          id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          type: "sticky",
          content: "",
          position: { x: worldX, y: worldY },
          color,
        };
        addAnnotation(annotation);
        setTool("select");
      }
    },
    [addAnnotation],
  );

  return (
    <>
      <div ref={canvasContainerRef} className="w-full h-full relative">
        <InfiniteCanvas
          ref={canvasHandleRef}
          onCanvasClick={handleCanvasClick}
          externalTool={tool}
          onToolChange={setTool}
          handTrackingEnabled={handTrackingEnabled}
          onToggleHandTracking={() => setHandTrackingEnabled((p) => !p)}
        >
          {topic && <CanvasTitle topic={topic} />}
          {modules.length === 0 && annotations.length === 0 && <EmptyHint />}
          {modules.length > 1 && <FlowArrows modules={modules} />}

          {modules.map((mod) => (
            <DraggableModule
              key={mod.id}
              module={mod}
              onExpand={() => setExpandedModuleId(mod.id)}
            />
          ))}

          {annotations.map((ann) => (
            <CanvasAnnotationCard
              key={ann.id}
              annotation={ann}
              onMove={moveAnnotation}
              onUpdate={updateAnnotation}
              onRemove={removeAnnotation}
            />
          ))}

          {/* Hand-drawn highlight rectangle */}
          {handHighlight && handHighlight.w > 5 && (
            <div
              className="absolute border-2 border-dashed border-indigo-400/50 bg-indigo-400/5 rounded-lg pointer-events-none"
              style={{
                left: handHighlight.x,
                top: handHighlight.y,
                width: handHighlight.w,
                height: handHighlight.h,
              }}
            />
          )}
        </InfiniteCanvas>

        {/* Hand tracking overlay — renders webcam preview + gesture cursor */}
        <HandTrackingOverlay
          enabled={handTrackingEnabled}
          onGesture={handleGesture}
          containerRef={canvasContainerRef}
        />
      </div>

      {/* Artifact preparation toasts */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="bg-[#1c1c1e]/90 backdrop-blur-xl rounded-xl px-4 py-2.5 shadow-xl flex items-center gap-3"
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  toast.status === "done"
                    ? "bg-green-400"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold tracking-wider uppercase text-green-400">
                    CANVAS
                  </span>
                  <span className="text-[12px] text-white/80 font-medium">
                    {toast.title}
                  </span>
                </div>
                <span className="text-[10px] text-white/40">
                  {toast.status === "preparing"
                    ? "Generating content..."
                    : toast.status === "adding"
                      ? "Adding it to your canvas"
                      : "Added to canvas ✓"}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Undo toast */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2">
        <AnimatePresence>
          {undoStack.map((mod) => (
            <motion.div
              key={mod.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="bg-black/80 backdrop-blur-xl text-white rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-xl"
            >
              <span className="text-[12px]">Module removed</span>
              <button
                onClick={() => handleUndo(mod)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-blue-300 hover:text-blue-200 transition-colors"
              >
                <Undo2 className="w-3 h-3" />
                Undo
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Expanded module — full canvas experience */}
      <AnimatePresence>
        {expanded && (
          <ExpandedModuleCanvas
            module={expanded}
            onClose={() => setExpandedModuleId(null)}
            onDismiss={() => {
              handleDismiss(expanded);
              setExpandedModuleId(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ──────────────── Canvas Title ──────────────── */

function CanvasTitle({ topic }: { topic: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="absolute pointer-events-none select-none"
      style={{ left: "50%", top: TITLE_Y, transform: "translateX(-50%)" }}
    >
      <h1
        className="text-black/70 leading-tight text-center whitespace-nowrap"
        style={{
          fontFamily: "var(--font-caveat), 'Segoe Print', cursive",
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: "-0.01em",
        }}
      >
        {topic}
      </h1>
      <div
        className="mt-1 h-[2px] rounded-full bg-black/[0.06] mx-auto"
        style={{ width: Math.min(topic.length * 22, 600) }}
      />
    </motion.div>
  );
}

function EmptyHint() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="absolute pointer-events-none select-none"
      style={{ left: 84, top: ARTIFACTS_Y }}
    >
      <p className="text-[13px] text-black/20 italic">
        Start chatting below — modules will appear here as you explore...
      </p>
    </motion.div>
  );
}

/* ──────────────── Canvas Annotation (text / sticky) ──────────────── */

function CanvasAnnotationCard({
  annotation: ann,
  onMove,
  onUpdate,
  onRemove,
}: {
  annotation: CanvasAnnotation;
  onMove: (id: string, x: number, y: number) => void;
  onUpdate: (id: string, content: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(!ann.content);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: ann.position.x, origY: ann.position.y, moved: false });

  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus();
    }
  }, [editing]);

  const onGripDown = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: ann.position.x, origY: ann.position.y, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [ann.position.x, ann.position.y]);

  const onGripMove = useCallback((e: ReactPointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
    onMove(ann.id, dragRef.current.origX + dx, dragRef.current.origY + dy);
  }, [ann.id, onMove]);

  const onGripUp = useCallback(() => { dragRef.current.dragging = false; }, []);

  if (ann.type === "sticky") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="absolute group"
        style={{ left: ann.position.x, top: ann.position.y, width: 200 }}
      >
        <div
          className="rounded-lg shadow-md p-3 min-h-[120px] relative"
          style={{ backgroundColor: ann.color }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-6 cursor-grab active:cursor-grabbing"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
          />
          <button
            onClick={() => onRemove(ann.id)}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded flex items-center justify-center text-black/20 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <textarea
            ref={textRef}
            value={ann.content}
            onChange={(e) => onUpdate(ann.id, e.target.value)}
            onBlur={() => setEditing(false)}
            onFocus={() => setEditing(true)}
            placeholder="Write a note..."
            className="w-full h-full min-h-[90px] bg-transparent resize-none outline-none text-[13px] text-black/70 leading-relaxed mt-3"
            style={{ fontFamily: "var(--font-caveat), 'Segoe Print', cursive", fontSize: 16 }}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute group"
      style={{ left: ann.position.x, top: ann.position.y }}
    >
      <div className="relative">
        <div
          className="absolute -top-2 -left-2 w-6 h-6 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
        >
          <GripHorizontal className="w-4 h-4 text-black/20" />
        </div>
        <button
          onClick={() => onRemove(ann.id)}
          className="absolute -top-2 -right-2 w-5 h-5 rounded flex items-center justify-center text-black/20 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 z-10"
        >
          <X className="w-3 h-3" />
        </button>
        {editing ? (
          <textarea
            ref={textRef}
            value={ann.content}
            onChange={(e) => onUpdate(ann.id, e.target.value)}
            onBlur={() => { if (ann.content) setEditing(false); }}
            placeholder="Type here..."
            className="bg-transparent resize-none outline-none min-w-[120px]"
            style={{
              fontFamily: "var(--font-caveat), 'Segoe Print', cursive",
              fontSize: 20,
              color: ann.color,
              lineHeight: 1.4,
            }}
            rows={1}
            autoFocus
          />
        ) : (
          <p
            onClick={() => setEditing(true)}
            className="cursor-text min-w-[40px] whitespace-pre-wrap"
            style={{
              fontFamily: "var(--font-caveat), 'Segoe Print', cursive",
              fontSize: 20,
              color: ann.color,
              lineHeight: 1.4,
            }}
          >
            {ann.content || "Type here..."}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ──────────────── Flow Arrows ──────────────── */

function FlowArrows({ modules }: { modules: CanvasModule[] }) {
  const sorted = [...modules].sort((a, b) => a.createdAt - b.createdAt);

  const edges: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1];
    edges.push({
      id: `${from.id}->${to.id}`,
      x1: from.position.x + MODULE_W / 2,
      y1: from.position.y + MODULE_H_ESTIMATE,
      x2: to.position.x + MODULE_W / 2,
      y2: to.position.y,
    });
  }

  if (edges.length === 0) return null;

  const pad = 2000;
  const allX = edges.flatMap((e) => [e.x1, e.x2]);
  const allY = edges.flatMap((e) => [e.y1, e.y2]);
  const minX = Math.min(...allX) - pad;
  const minY = Math.min(...allY) - pad;
  const maxX = Math.max(...allX) + pad;
  const maxY = Math.max(...allY) + pad;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      style={{ overflow: "visible", width: maxX - minX, height: maxY - minY, left: minX, top: minY }}
    >
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="rgba(0,0,0,0.12)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const sx = e.x1 - minX, sy = e.y1 - minY, ex = e.x2 - minX, ey = e.y2 - minY;
        const curveStrength = Math.min(Math.abs(ey - sy) * 0.4, 80);
        const path = `M ${sx} ${sy} C ${sx} ${sy + curveStrength}, ${ex} ${ey - curveStrength}, ${ex} ${ey}`;
        return (
          <g key={e.id}>
            <path d={path} fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth={4} strokeLinecap="round" />
            <path d={path} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="6 4" markerEnd="url(#flow-arrow)">
              <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.5s" repeatCount="indefinite" />
            </path>
          </g>
        );
      })}
    </svg>
  );
}

/* ──────────────── Module Card (draggable) ──────────────── */

function DraggableModule({
  module: mod,
  onExpand,
}: {
  module: CanvasModule;
  onExpand: () => void;
}) {
  const { moveModule } = useCanvasStore();
  const pos = mod.position;
  const count = mod.artifacts.length;

  const dragRef = useRef({
    dragging: false, startX: 0, startY: 0, origX: pos.x, origY: pos.y, moved: false,
  });

  const onGripDown = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

  const onGripMove = useCallback((e: ReactPointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
    moveModule(mod.id, dragRef.current.origX + dx, dragRef.current.origY + dy);
  }, [mod.id, moveModule]);

  const onGripUp = useCallback(() => { dragRef.current.dragging = false; }, []);
  const handleClick = useCallback(() => { if (!dragRef.current.moved) onExpand(); dragRef.current.moved = false; }, [onExpand]);

  const typeBadges = [...new Set(mod.artifacts.map((a) => a.type))];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 280 }}
      className="absolute group"
      style={{ left: pos.x, top: pos.y, width: MODULE_W }}
    >
      <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm hover:shadow-lg transition-shadow overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-1.5 cursor-grab active:cursor-grabbing border-b border-black/[0.03] bg-[#fafafa]"
          onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-3.5 h-3.5 text-black/15" />
            <span className="text-[11px] font-medium text-black/50 truncate max-w-[200px]">{mod.title}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="w-6 h-6 rounded-md flex items-center justify-center text-black/25 hover:text-black/60 hover:bg-black/[0.04] transition-all opacity-0 group-hover:opacity-100"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>

        <div className="cursor-pointer overflow-hidden px-3 py-3" onClick={handleClick}>
          <div className="grid gap-2" style={{ gridTemplateColumns: count === 1 ? "1fr" : "1fr 1fr" }}>
            {mod.artifacts.slice(0, 4).map((art) => <MiniPreview key={art.id} artifact={art} />)}
          </div>
          {count > 4 && <p className="text-[10px] text-black/25 mt-2 text-center">+{count - 4} more</p>}
        </div>

        <div className="px-3 py-2 border-t border-black/[0.03] flex items-center gap-1.5 flex-wrap">
          {typeBadges.map((t) => {
            const meta = TYPE_META[t] || { icon: "📄", label: t, accent: "#666" };
            return (
              <div key={t} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase tracking-wider" style={{ backgroundColor: `${meta.accent}10`, color: `${meta.accent}bb` }}>
                <span>{meta.icon}</span>{meta.label}
              </div>
            );
          })}
          <span className="text-[9px] text-black/20 ml-auto">{count} item{count !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </motion.div>
  );
}

function MiniPreview({ artifact }: { artifact: CanvasArtifact }) {
  const meta = TYPE_META[artifact.type] || { icon: "📄", label: "Item", accent: "#666" };
  return (
    <div className="rounded-lg bg-[#f5f5f7] border border-black/[0.03] overflow-hidden h-[90px] relative">
      <div className="w-full h-full overflow-hidden p-1.5 flex items-center justify-center">
        <div className="transform scale-[0.45] origin-center pointer-events-none w-[200%] h-[200%] flex items-center justify-center">
          <ArtifactContent artifact={artifact} />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-[#f5f5f7] to-transparent" />
      <div className="absolute bottom-1 left-1.5 text-[7px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded" style={{ backgroundColor: `${meta.accent}15`, color: `${meta.accent}aa` }}>
        {meta.label}
      </div>
    </div>
  );
}

/* ──────────────── Expanded Module — Full Canvas + Agent ──────────────── */

const INNER_CARD_W = 300;
const INNER_CARD_H = 240;

interface ModuleChat {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function ExpandedModuleCanvas({
  module: mod,
  onClose,
  onDismiss,
}: {
  module: CanvasModule;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const { moveArtifactInModule } = useCanvasStore();
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ModuleChat[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const { persona, documentContext } = useSessionStore();

  const count = mod.artifacts.length;
  const expandedArtifact = mod.artifacts.find((a) => a.id === expandedArtifactId);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (expandedArtifactId) setExpandedArtifactId(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedArtifactId, onClose]);

  const sendChat = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;
    setChatMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text.trim() }]);
    setChatInput("");
    setChatLoading(true);

    const context = mod.artifacts.map((a) => `[${a.type}: ${a.title}]`).join(", ");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text.trim(),
          persona,
          history: chatMessages.slice(-8).map((m) => ({
            role: m.role === "assistant" ? "assistant" as const : "user" as const,
            content: m.content,
          })),
          documentContext: documentContext
            ? `${documentContext}\n\nCurrent module: "${mod.title}" contains: ${context}`
            : `Current module: "${mod.title}" contains: ${context}`,
          mode: "tutor",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.tutor?.explanation || data.rawResponse || "I couldn't process that." }]);
      }
    } catch {
      setChatMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Something went wrong." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages, persona, documentContext, mod]);

  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 3 && selection.length < 500) {
      setChatInput(`Explain this: "${selection}"`);
      setShowChat(true);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-[#f8f8fa] flex flex-col"
    >
      {/* Breadcrumb header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-black/[0.04] bg-white flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-[12px] text-black/40 hover:text-black/70 transition-all group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to canvas</span>
          </button>
          <div className="w-px h-4 bg-black/[0.06]" />
          <h3 className="text-[18px] font-bold text-black/75 truncate" style={{ fontFamily: "var(--font-caveat), 'Segoe Print', cursive" }}>
            {mod.title}
          </h3>
          <span className="text-[10px] text-black/25 bg-black/[0.03] rounded-md px-2 py-0.5">
            {count} artifact{count !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChat(!showChat)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${showChat ? "bg-blue-50 text-blue-600" : "bg-black/[0.03] text-black/40 hover:text-black/60"}`}
          >
            <MessageSquare className="w-3 h-3" /> Ask Doubts
          </button>
          <button onClick={onDismiss} className="w-7 h-7 rounded-lg bg-black/[0.03] flex items-center justify-center text-black/30 hover:text-red-500 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: real canvas + chat */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 relative" onMouseUp={handleTextSelect}>
          <InfiniteCanvas hideTools={false}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute pointer-events-none select-none"
              style={{ left: 60, top: 20 }}
            >
              <h2
                className="text-black/50 leading-tight"
                style={{ fontFamily: "var(--font-caveat), 'Segoe Print', cursive", fontSize: 28, fontWeight: 600 }}
              >
                {mod.title}
              </h2>
              <div className="mt-0.5 h-[1.5px] rounded-full bg-black/[0.04]" style={{ width: Math.min(mod.title.length * 14, 400) }} />
            </motion.div>

            {count > 1 && <InnerFlowArrows artifacts={mod.artifacts} />}

            {mod.artifacts.map((art) => (
              <InnerDraggableCard
                key={art.id}
                moduleId={mod.id}
                artifact={art}
                onExpand={() => setExpandedArtifactId(art.id)}
                onMove={moveArtifactInModule}
              />
            ))}
          </InfiniteCanvas>
        </div>

        {/* Inline doubt agent */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 24, stiffness: 300 }}
              className="border-l border-black/[0.04] bg-white flex flex-col overflow-hidden flex-shrink-0"
            >
              <div className="px-4 py-3 border-b border-black/[0.04] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center">
                    <MessageSquare className="w-3 h-3 text-blue-500" />
                  </div>
                  <span className="text-[12px] font-medium text-black/60">Module Agent</span>
                </div>
                <button onClick={() => setShowChat(false)} className="w-5 h-5 rounded flex items-center justify-center text-black/20 hover:text-black/50 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-[11px] text-black/20 leading-relaxed">
                      Ask anything about this module.<br />Select text to ask about it.
                    </p>
                  </div>
                )}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={msg.role === "user" ? "flex justify-end" : ""}>
                    <div className={`text-[12px] leading-relaxed rounded-xl px-3 py-2 max-w-[90%] ${msg.role === "user" ? "bg-black/[0.05] text-black/70" : "bg-blue-50/50 text-black/60"}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2 px-1">
                    <Loader2 className="w-3 h-3 animate-spin text-black/20" />
                    <span className="text-[10px] text-black/20">Thinking...</span>
                  </div>
                )}
              </div>

              <div className="p-3 pt-0">
                <div className="flex items-center gap-2 bg-black/[0.02] rounded-xl px-3 py-0.5 border border-black/[0.04]">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendChat(chatInput)}
                    placeholder="Ask a doubt..."
                    className="flex-1 bg-transparent text-[12px] text-black/70 py-2 outline-none placeholder:text-black/20"
                    disabled={chatLoading}
                  />
                  <button onClick={() => sendChat(chatInput)} disabled={!chatInput.trim() || chatLoading} className="w-6 h-6 rounded-lg bg-black/[0.04] flex items-center justify-center text-black/30 hover:text-black/60 transition-all disabled:opacity-20">
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expanded single artifact overlay */}
        <AnimatePresence>
          {expandedArtifact && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 bg-black/5 backdrop-blur-[2px] flex items-center justify-center p-8"
              onClick={() => setExpandedArtifactId(null)}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl border border-black/[0.06] shadow-xl w-full max-w-2xl max-h-[75vh] overflow-hidden flex flex-col"
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{(TYPE_META[expandedArtifact.type] || { icon: "📄" }).icon}</span>
                    <h4 className="text-[14px] font-medium text-black/70">{expandedArtifact.title}</h4>
                  </div>
                  <button onClick={() => setExpandedArtifactId(null)} className="w-7 h-7 rounded-lg bg-black/[0.03] flex items-center justify-center text-black/30 hover:text-black/60 transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-5">
                  <ArtifactContent artifact={expandedArtifact} />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ──── Inner canvas: draggable artifact card ──── */

function InnerDraggableCard({
  moduleId,
  artifact,
  onExpand,
  onMove,
}: {
  moduleId: string;
  artifact: CanvasArtifact;
  onExpand: () => void;
  onMove: (moduleId: string, artifactId: string, x: number, y: number) => void;
}) {
  const meta = TYPE_META[artifact.type] || { icon: "📄", label: "Item", accent: "#666" };
  const pos = artifact.position ?? { x: 0, y: 0 };

  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: pos.x, origY: pos.y, moved: false });

  const onGripDown = useCallback((e: ReactPointerEvent) => {
    e.stopPropagation();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

  const onGripMove = useCallback((e: ReactPointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
    onMove(moduleId, artifact.id, dragRef.current.origX + dx, dragRef.current.origY + dy);
  }, [moduleId, artifact.id, onMove]);

  const onGripUp = useCallback(() => { dragRef.current.dragging = false; }, []);
  const handleClick = useCallback(() => { if (!dragRef.current.moved) onExpand(); dragRef.current.moved = false; }, [onExpand]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 22, stiffness: 280 }}
      className="absolute group"
      style={{ left: pos.x, top: pos.y, width: INNER_CARD_W }}
    >
      <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm hover:shadow-lg transition-shadow overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-1.5 cursor-grab active:cursor-grabbing border-b border-black/[0.03] bg-[#fafafa]"
          onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-3.5 h-3.5 text-black/15" />
            <span className="text-[10px] font-medium text-black/50 truncate max-w-[180px]">{artifact.title}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="w-5 h-5 rounded flex items-center justify-center text-black/20 hover:text-black/50 transition-all opacity-0 group-hover:opacity-100"
          >
            <Maximize2 className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="cursor-pointer overflow-hidden h-[180px]" onClick={handleClick}>
          <div className="p-2 h-full flex items-center justify-center">
            <div className="transform scale-[0.5] origin-center pointer-events-none w-[200%] h-[200%] flex items-center justify-center">
              <ArtifactContent artifact={artifact} />
            </div>
          </div>
        </div>

        <div className="px-3 py-1.5 border-t border-black/[0.03] flex items-center gap-1.5">
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${meta.accent}10`, color: `${meta.accent}bb` }}
          >
            <span>{meta.icon}</span>{meta.label}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──── Inner canvas: flow arrows ──── */

function InnerFlowArrows({ artifacts }: { artifacts: CanvasArtifact[] }) {
  const edges: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < artifacts.length - 1; i++) {
    const from = artifacts[i];
    const to = artifacts[i + 1];
    const fp = from.position ?? { x: 0, y: 0 };
    const tp = to.position ?? { x: 0, y: 0 };
    edges.push({
      id: `${from.id}->${to.id}`,
      x1: fp.x + INNER_CARD_W / 2,
      y1: fp.y + INNER_CARD_H,
      x2: tp.x + INNER_CARD_W / 2,
      y2: tp.y,
    });
  }

  if (edges.length === 0) return null;

  const pad = 1000;
  const allX = edges.flatMap((e) => [e.x1, e.x2]);
  const allY = edges.flatMap((e) => [e.y1, e.y2]);
  const minX = Math.min(...allX) - pad;
  const minY = Math.min(...allY) - pad;
  const maxX = Math.max(...allX) + pad;
  const maxY = Math.max(...allY) + pad;

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      style={{ overflow: "visible", width: maxX - minX, height: maxY - minY, left: minX, top: minY }}
    >
      <defs>
        <marker id="inner-flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 2 L 10 5 L 0 8 z" fill="rgba(0,0,0,0.10)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const sx = e.x1 - minX, sy = e.y1 - minY, ex = e.x2 - minX, ey = e.y2 - minY;
        const curveStrength = Math.min(Math.abs(ey - sy) * 0.4, 60);
        const path = `M ${sx} ${sy} C ${sx} ${sy + curveStrength}, ${ex} ${ey - curveStrength}, ${ex} ${ey}`;
        return (
          <g key={e.id}>
            <path d={path} fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth={3} strokeLinecap="round" />
            <path d={path} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={1.2} strokeLinecap="round" strokeDasharray="5 3" markerEnd="url(#inner-flow-arrow)">
              <animate attributeName="stroke-dashoffset" from="16" to="0" dur="1.5s" repeatCount="indefinite" />
            </path>
          </g>
        );
      })}
    </svg>
  );
}

/* ──────────────── Artifact Content Renderer ──────────────── */

function ArtifactContent({ artifact }: { artifact: CanvasArtifact }) {
  switch (artifact.type) {
    case "visual":
      return <VisualCard artifact={artifact} />;
    case "graph":
      return <GraphCard artifact={artifact} />;
    case "notation":
      return <NotationCard artifact={artifact} />;
    case "flashcard":
      return <FlashcardCard artifact={artifact} />;
    case "lookup":
      return <LookupCard artifact={artifact} />;
    case "simulation":
      return <SimulationCard artifact={artifact} expanded />;
    default:
      return <p className="text-[11px] text-black/30">Unknown artifact type</p>;
  }
}
