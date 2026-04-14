"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
} from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Hand,
  MousePointer2,
  Type,
  StickyNote,
  ScanEye,
  Pencil,
} from "lucide-react";
import type { CanvasStroke } from "@/store/canvas";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transform { x: number; y: number; scale: number }
export type CanvasTool = "select" | "hand" | "text" | "sticky" | "pen";

const MIN_ZOOM  = 0.1;
const MAX_ZOOM  = 4;
const ZOOM_STEP = 0.12;
const DOT_SIZE  = 1;
const DOT_GAP   = 24;
const PAN_THRESHOLD = 8;

interface InfiniteCanvasProps {
  children: ReactNode;
  onCanvasClick?: (worldX: number, worldY: number, tool: CanvasTool) => void;
  onDoubleClick?: (worldX: number, worldY: number) => void;
  onRightClick?: (worldX: number, worldY: number, screenX: number, screenY: number) => void;
  onShiftClick?: (worldX: number, worldY: number) => void;
  onBoxSelect?: (x1: number, y1: number, x2: number, y2: number) => void;
  externalTool?: CanvasTool;
  onToolChange?: (tool: CanvasTool) => void;
  hideTools?: boolean;
  handTrackingEnabled?: boolean;
  onToggleHandTracking?: () => void;
  darkMode?: boolean;
  strokes?: CanvasStroke[];
  onStrokeComplete?: (stroke: CanvasStroke) => void;
  strokeColor?: string;
  onTransformChange?: (t: Transform) => void;
}

export interface InfiniteCanvasHandle {
  getContainerRef: () => HTMLDivElement | null;
  getTransform: () => Transform;
  panBy: (dx: number, dy: number) => void;
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
  worldToScreen: (worldX: number, worldY: number) => { x: number; y: number };
  zoomToRect: (x: number, y: number, w: number, h: number, padding?: number) => void;
  fitAll: (bounds: { x: number; y: number; w: number; h: number }) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(
  function InfiniteCanvas(
    {
      children,
      onCanvasClick,
      onDoubleClick,
      onRightClick,
      onShiftClick,
      onBoxSelect,
      externalTool,
      onToolChange,
      hideTools,
      handTrackingEnabled,
      onToggleHandTracking,
      darkMode = false,
      strokes = [],
      onStrokeComplete,
      strokeColor = "#7c3aed",
      onTransformChange,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
    const [transform, setTransformState] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const [smoothing, setSmoothing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [internalTool, setInternalTool] = useState<CanvasTool>("select");

    const tool    = externalTool ?? internalTool;
    const setTool = onToolChange ?? setInternalTool;

    // Ref so native handlers always see latest tool without re-registering
    const toolRef = useRef<CanvasTool>(tool);
    useEffect(() => { toolRef.current = tool; }, [tool]);

    // ── Pen stroke state ──────────────────────────────────────────────────────
    // Live strokes drawn imperatively on liveCanvasRef — no React state, no
    // listener churn. Committed strokes drawn on committedCanvasRef in screen
    // space (world→screen via transform), so CSS overflow:hidden never clips them.
    const liveCanvasRef      = useRef<HTMLCanvasElement>(null);
    const committedCanvasRef = useRef<HTMLCanvasElement>(null);
    const livePtsRef         = useRef<[number, number][]>([]); // screen pts for commit
    const isDrawing          = useRef(false);

    const onStrokeCompleteRef = useRef(onStrokeComplete);
    useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);
    const strokeColorRef = useRef(strokeColor);
    useEffect(() => { strokeColorRef.current = strokeColor; }, [strokeColor]);

    // Redraw committed strokes canvas whenever strokes or transform changes
    useEffect(() => {
      const cvs = committedCanvasRef.current;
      const container = containerRef.current;
      if (!cvs || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const w = container.offsetWidth;
      const h = container.offsetHeight;
      cvs.width  = w * dpr;
      cvs.height = h * dpr;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      if (strokes.length === 0) return;
      const t = transform;
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        const pts: [number, number][] = stroke.points.map(([wx, wy]) => [
          wx * t.scale + t.x,
          wy * t.scale + t.y,
        ]);
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth   = stroke.width * t.scale;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.globalAlpha = 0.85;
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
      }
    }, [strokes, transform]);

    // ── Pan state ─────────────────────────────────────────────────────────────
    const panState = useRef({
      active: false, pending: false,
      startX: 0, startY: 0,
      originTx: 0, originTy: 0,
    });

    // ── Rubber-band selection state ───────────────────────────────────────────
    const rbRef   = useRef<HTMLDivElement>(null);
    const rbState = useRef<{ active: boolean; sx: number; sy: number; ex: number; ey: number } | null>(null);

    // ── Transform helpers ─────────────────────────────────────────────────────
    const setTransform = useCallback(
      (updater: Transform | ((t: Transform) => Transform)) => {
        const next = typeof updater === "function" ? updater(transformRef.current) : updater;
        transformRef.current = next;
        setTransformState(next);
        onTransformChange?.(next);
      },
      [onTransformChange],
    );

    // ── Imperative handle ─────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getContainerRef: () => containerRef.current,
      getTransform: () => transformRef.current,
      panBy: (dx, dy) => setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy })),
      screenToWorld: (sx, sy) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        const t = transformRef.current;
        return { x: (sx - rect.left - t.x) / t.scale, y: (sy - rect.top - t.y) / t.scale };
      },
      worldToScreen: (wx, wy) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        const t = transformRef.current;
        return { x: wx * t.scale + t.x + rect.left, y: wy * t.scale + t.y + rect.top };
      },
      zoomToRect: (x, y, w, h, padding = 80) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const vw = rect.width, vh = rect.height;
        const s = Math.min((vw - padding * 2) / w, (vh - padding * 2) / h, MAX_ZOOM);
        const tx = vw / 2 - (x + w / 2) * s;
        const ty = vh / 2 - (y + h / 2) * s;
        setSmoothing(true);
        setTransform({ x: tx, y: ty, scale: s });
        setTimeout(() => setSmoothing(false), 700);
      },
      fitAll: (bounds) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pad = 100, vw = rect.width, vh = rect.height;
        const s = Math.min((vw - pad * 2) / bounds.w, (vh - pad * 2) / bounds.h, 1.5);
        const tx = vw / 2 - (bounds.x + bounds.w / 2) * s;
        const ty = vh / 2 - (bounds.y + bounds.h / 2) * s;
        setSmoothing(true);
        setTransform({ x: tx, y: ty, scale: s });
        setTimeout(() => setSmoothing(false), 700);
      },
    }));

    // ── Zoom on wheel ─────────────────────────────────────────────────────────
    const zoom = useCallback(
      (delta: number, cx?: number, cy?: number) => {
        setTransform((t) => {
          const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.scale + delta));
          if (cx !== undefined && cy !== undefined) {
            const r = ns / t.scale;
            return { scale: ns, x: cx - (cx - t.x) * r, y: cy - (cy - t.y) * r };
          }
          return { ...t, scale: ns };
        });
      },
      [setTransform],
    );

    // Prevent browser-default scroll/pinch-zoom
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const prevent = (e: Event) => e.preventDefault();
      el.addEventListener("wheel", prevent, { passive: false });
      return () => el.removeEventListener("wheel", prevent);
    }, []);

    // Reset pan state on tool change
    useEffect(() => {
      panState.current = { active: false, pending: false, startX: 0, startY: 0, originTx: 0, originTy: 0 };
      setIsPanning(false);
    }, [tool]);

    // ── All pointer logic via native events ───────────────────────────────────
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const onDown = (e: PointerEvent) => {
        const target = e.target as HTMLElement;
        const t = toolRef.current;

        // Never fire on toolbar / UI controls
        if (target.closest("[data-canvas-ui]")) return;

        // ── Pen ──────────────────────────────────────────────────────────────
        if (t === "pen") {
          if (e.button !== 0) return;
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          isDrawing.current = true;
          const rect = el.getBoundingClientRect();
          const pt: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
          livePtsRef.current = [pt];
          // Set up canvas for drawing
          const cvs = liveCanvasRef.current;
          if (cvs) {
            const dpr = window.devicePixelRatio || 1;
            cvs.width  = rect.width  * dpr;
            cvs.height = rect.height * dpr;
            const ctx = cvs.getContext("2d");
            if (ctx) {
              ctx.scale(dpr, dpr);
              ctx.strokeStyle = strokeColorRef.current;
              ctx.lineWidth   = 2;
              ctx.lineCap     = "round";
              ctx.lineJoin    = "round";
              ctx.globalAlpha = 0.9;
              ctx.beginPath();
              ctx.moveTo(pt[0], pt[1]);
            }
          }
          return;
        }

        if (e.button === 1 || t === "hand") {
          panState.current = {
            active: true, pending: false,
            startX: e.clientX, startY: e.clientY,
            originTx: transformRef.current.x, originTy: transformRef.current.y,
          };
          el.setPointerCapture(e.pointerId);
          setIsPanning(true);
          return;
        }

        if (e.button === 0) {
          if (t === "select") {
            rbState.current = { active: true, sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY };
            el.setPointerCapture(e.pointerId);
            const rect = el.getBoundingClientRect();
            const div = rbRef.current;
            if (div) {
              div.style.left    = `${e.clientX - rect.left}px`;
              div.style.top     = `${e.clientY - rect.top}px`;
              div.style.width   = "0px";
              div.style.height  = "0px";
              div.style.display = "block";
            }
          } else {
            panState.current = {
              active: false, pending: true,
              startX: e.clientX, startY: e.clientY,
              originTx: transformRef.current.x, originTy: transformRef.current.y,
            };
          }
        }
      };

      const onMove = (e: PointerEvent) => {
        // ── Pen ──────────────────────────────────────────────────────────────
        if (toolRef.current === "pen") {
          if (!isDrawing.current) return;
          const rect = el.getBoundingClientRect();
          const pt: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
          livePtsRef.current = [...livePtsRef.current, pt];
          const ctx = liveCanvasRef.current?.getContext("2d");
          if (ctx) {
            ctx.lineTo(pt[0], pt[1]);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pt[0], pt[1]);
          }
          return;
        }

        const rb = rbState.current;
        if (rb?.active) {
          rb.ex = e.clientX;
          rb.ey = e.clientY;
          const div = rbRef.current;
          if (div) {
            const rect = el.getBoundingClientRect();
            div.style.left   = `${Math.min(rb.sx, e.clientX) - rect.left}px`;
            div.style.top    = `${Math.min(rb.sy, e.clientY) - rect.top}px`;
            div.style.width  = `${Math.abs(e.clientX - rb.sx)}px`;
            div.style.height = `${Math.abs(e.clientY - rb.sy)}px`;
          }
          return;
        }

        const ps = panState.current;
        if (ps.active) {
          const dx = e.clientX - ps.startX;
          const dy = e.clientY - ps.startY;
          setTransform({ x: ps.originTx + dx, y: ps.originTy + dy, scale: transformRef.current.scale });
          return;
        }
        if (ps.pending && e.buttons === 1) {
          const dx = e.clientX - ps.startX;
          const dy = e.clientY - ps.startY;
          if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
            panState.current = { ...ps, active: true, pending: false };
            el.setPointerCapture(e.pointerId);
            setIsPanning(true);
            setTransform({ x: ps.originTx + dx, y: ps.originTy + dy, scale: transformRef.current.scale });
          }
        }
      };

      const onUp = (e: PointerEvent) => {
        // ── Pen ──────────────────────────────────────────────────────────────
        if (toolRef.current === "pen") {
          if (!isDrawing.current) return;
          isDrawing.current = false;
          const screenPts = livePtsRef.current;
          livePtsRef.current = [];
          // Clear the live canvas
          const cvs = liveCanvasRef.current;
          if (cvs) cvs.getContext("2d")?.clearRect(0, 0, cvs.width, cvs.height);
          if (screenPts.length >= 2 && onStrokeCompleteRef.current) {
            const t = transformRef.current;
            const worldPts: [number, number][] = screenPts.map(([px, py]) => [
              (px - t.x) / t.scale,
              (py - t.y) / t.scale,
            ]);
            onStrokeCompleteRef.current({
              id: `stroke-${Date.now()}`,
              points: worldPts,
              color: strokeColorRef.current,
              width: 2,
            });
          }
          return;
        }

        const rb = rbState.current;
        if (rb?.active) {
          rbState.current = null;
          const div = rbRef.current;
          if (div) div.style.display = "none";

          const dx = Math.abs(rb.ex - rb.sx);
          const dy = Math.abs(rb.ey - rb.sy);

          if (dx < 5 && dy < 5) {
            const rect = el.getBoundingClientRect();
            const t = transformRef.current;
            if (e.shiftKey && onShiftClick) {
              onShiftClick((rb.ex - rect.left - t.x) / t.scale, (rb.ey - rect.top - t.y) / t.scale);
            } else if (onCanvasClick) {
              onCanvasClick((rb.ex - rect.left - t.x) / t.scale, (rb.ey - rect.top - t.y) / t.scale, "select");
            }
          } else if (onBoxSelect) {
            const rect = el.getBoundingClientRect();
            const t = transformRef.current;
            onBoxSelect(
              (Math.min(rb.sx, rb.ex) - rect.left - t.x) / t.scale,
              (Math.min(rb.sy, rb.ey) - rect.top  - t.y) / t.scale,
              (Math.max(rb.sx, rb.ex) - rect.left - t.x) / t.scale,
              (Math.max(rb.sy, rb.ey) - rect.top  - t.y) / t.scale,
            );
          }
          return;
        }

        const ps = panState.current;
        const wasActive = ps.active;
        panState.current = { active: false, pending: false, startX: 0, startY: 0, originTx: 0, originTy: 0 };

        if (wasActive) {
          setIsPanning(false);
          return;
        }

        const rect = el.getBoundingClientRect();
        const t = transformRef.current;
        const worldX = (e.clientX - rect.left - t.x) / t.scale;
        const worldY = (e.clientY - rect.top  - t.y) / t.scale;

        if (e.shiftKey && onShiftClick) {
          onShiftClick(worldX, worldY);
          return;
        }
        if (onCanvasClick) onCanvasClick(worldX, worldY, toolRef.current);
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        zoom(delta * transformRef.current.scale, cx, cy);
      };

      const onDblClick = (e: MouseEvent) => {
        if (!onDoubleClick) return;
        const rect = el.getBoundingClientRect();
        const t = transformRef.current;
        onDoubleClick(
          (e.clientX - rect.left - t.x) / t.scale,
          (e.clientY - rect.top  - t.y) / t.scale,
        );
      };

      const onCtxMenu = (e: MouseEvent) => {
        e.preventDefault();
        if (!onRightClick) return;
        const rect = el.getBoundingClientRect();
        const t = transformRef.current;
        onRightClick(
          (e.clientX - rect.left - t.x) / t.scale,
          (e.clientY - rect.top  - t.y) / t.scale,
          e.clientX, e.clientY,
        );
      };

      el.addEventListener("pointerdown",   onDown);
      el.addEventListener("pointermove",   onMove);
      el.addEventListener("pointerup",     onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("wheel",         onWheel,    { passive: false });
      el.addEventListener("dblclick",      onDblClick);
      el.addEventListener("contextmenu",   onCtxMenu);

      return () => {
        el.removeEventListener("pointerdown",   onDown);
        el.removeEventListener("pointermove",   onMove);
        el.removeEventListener("pointerup",     onUp);
        el.removeEventListener("pointercancel", onUp);
        el.removeEventListener("wheel",         onWheel);
        el.removeEventListener("dblclick",      onDblClick);
        el.removeEventListener("contextmenu",   onCtxMenu);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoom, setTransform, onCanvasClick, onDoubleClick, onRightClick, onShiftClick, onBoxSelect]);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (e.key === "Escape")             setTool("select");
        if (e.key === "v" || e.key === "V") setTool("select");
        if (e.key === "h" || e.key === "H") setTool("hand");
        if (e.key === "p" || e.key === "P") setTool("pen");
        if (e.key === "t" || e.key === "T") setTool("text");
        if (e.key === "n" || e.key === "N") setTool("sticky");
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [setTool]);

    // ── Visual helpers ────────────────────────────────────────────────────────
    const zoomIn    = () => zoom(ZOOM_STEP * transformRef.current.scale);
    const zoomOut   = () => zoom(-ZOOM_STEP * transformRef.current.scale);
    const zoomReset = () => {
      setSmoothing(true);
      setTransform({ x: 0, y: 0, scale: 1 });
      setTimeout(() => setSmoothing(false), 700);
    };
    const zoomPct = Math.round(transform.scale * 100);

    const cursorStyle = isPanning    ? "grabbing"
      : tool === "hand"   ? "grab"
      : tool === "pen"    ? "crosshair"
      : tool === "text"   ? "text"
      : tool === "sticky" ? "crosshair"
      : "default";

    const toolbarBg     = darkMode ? "bg-[#1a1a2e]" : "bg-white";
    const toolbarBorder = darkMode ? "border-white/[0.08]" : "border-black/[0.06]";
    const toolbarText   = darkMode
      ? "text-white/30 hover:text-white/70 hover:bg-white/[0.05]"
      : "text-black/30 hover:text-black/60 hover:bg-black/[0.03]";
    const toolbarActive = darkMode ? "bg-white/[0.08] text-white/70" : "bg-black/[0.06] text-black/70";
    const dotColor      = darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.07)";

    const TOOLS = [
      { id: "select" as CanvasTool, icon: MousePointer2, label: "Select", shortcut: "V" },
      { id: "hand"   as CanvasTool, icon: Hand,          label: "Pan",    shortcut: "H" },
      { id: "pen"    as CanvasTool, icon: Pencil,        label: "Draw",   shortcut: "P" },
      { id: "text"   as CanvasTool, icon: Type,          label: "Text",   shortcut: "T" },
      { id: "sticky" as CanvasTool, icon: StickyNote,    label: "Sticky", shortcut: "N" },
    ];

    return (
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden select-none"
        style={{ cursor: cursorStyle }}
      >
        {/* Dot-grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, ${dotColor} ${DOT_SIZE}px, transparent ${DOT_SIZE}px)`,
            backgroundSize: `${DOT_GAP * transform.scale}px ${DOT_GAP * transform.scale}px`,
            backgroundPosition: `${transform.x % (DOT_GAP * transform.scale)}px ${transform.y % (DOT_GAP * transform.scale)}px`,
          }}
        />

        {/* Transformed world layer */}
        <div
          className="absolute origin-top-left"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            willChange: "transform",
            transition: smoothing ? "transform 0.6s cubic-bezier(0.4,0,0.2,1)" : "none",
          }}
        >
          {children}

        </div>

        {/* Pen-mode intercept overlay — sits above all world content so pointer
            events always reach the container handler, even over artifact cards. */}
        {tool === "pen" && (
          <div
            className="absolute inset-0"
            style={{ zIndex: 15, cursor: "crosshair" }}
          />
        )}

        {/* ── Committed strokes canvas (screen-space, redrawn on transform/stroke change) ── */}
        <canvas
          ref={committedCanvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 22, width: "100%", height: "100%" }}
        />

        {/* ── Live pen stroke canvas overlay (drawn imperatively, no React state) ── */}
        <canvas
          ref={liveCanvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 23, width: "100%", height: "100%" }}
        />

        {/* Rubber-band selection rect */}
        <div
          ref={rbRef}
          className="absolute pointer-events-none"
          style={{
            display: "none",
            border: `1px solid ${darkMode ? "rgba(124,58,237,0.55)" : "rgba(124,58,237,0.45)"}`,
            backgroundColor: darkMode ? "rgba(124,58,237,0.05)" : "rgba(124,58,237,0.04)",
            borderRadius: 3,
            zIndex: 20,
          }}
        />

        {/* Toolbars */}
        {!hideTools && (
          <>
            {/* Bottom-left: tool switcher */}
            <div
              data-canvas-ui="control"
              className="absolute bottom-4 left-4 flex items-center gap-1"
              style={{ zIndex: 50 }}
            >
              <div className={`flex items-center ${toolbarBg} rounded-xl border ${toolbarBorder} shadow-sm overflow-hidden`}>
                {TOOLS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setTool(t.id)}
                      className={`w-9 h-9 flex items-center justify-center transition-all relative group ${
                        tool === t.id ? toolbarActive : toolbarText
                      }`}
                      title={`${t.label} (${t.shortcut})`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <div className={`absolute -top-8 left-1/2 -translate-x-1/2 ${
                        darkMode ? "bg-white/10 text-white/80" : "bg-black/80 text-white"
                      } text-[9px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap`}>
                        {t.label} ({t.shortcut})
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom-right: zoom controls */}
            <div
              data-canvas-ui="control"
              className="absolute bottom-4 right-4 flex items-center gap-2"
              style={{ zIndex: 50 }}
            >
              {onToggleHandTracking && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onToggleHandTracking}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl border shadow-sm transition-all ${
                    handTrackingEnabled
                      ? "bg-indigo-500 text-white border-indigo-400"
                      : `${toolbarBg} ${toolbarText} ${toolbarBorder}`
                  }`}
                  title="Hand Tracking"
                >
                  <ScanEye className="w-4 h-4" />
                </button>
              )}
              <div className={`flex items-center ${toolbarBg} rounded-xl border ${toolbarBorder} shadow-sm overflow-hidden`}>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={zoomOut} className={`w-8 h-8 flex items-center justify-center ${toolbarText} transition-all`}>
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={zoomReset} className={`h-8 px-2 text-[10px] font-mono ${darkMode ? "text-white/30 hover:text-white/60 hover:bg-white/[0.05]" : "text-black/40 hover:text-black/60 hover:bg-black/[0.03]"} transition-all min-w-[48px] text-center`}>
                  {zoomPct}%
                </button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={zoomIn} className={`w-8 h-8 flex items-center justify-center ${toolbarText} transition-all`}>
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={zoomReset} className={`w-8 h-8 flex items-center justify-center ${toolbarText} transition-all ${darkMode ? "border-l border-white/[0.06]" : "border-l border-black/[0.04]"}`} title="Reset zoom">
                  <Maximize className="w-3 h-3" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
);

export default InfiniteCanvas;
