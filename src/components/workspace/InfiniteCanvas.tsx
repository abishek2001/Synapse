"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  type PointerEvent as ReactPointerEvent,
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
} from "lucide-react";

interface Transform {
  x: number;
  y: number;
  scale: number;
}

export type CanvasTool = "select" | "hand" | "text" | "sticky";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const DOT_SIZE = 1;
const DOT_GAP = 24;

interface InfiniteCanvasProps {
  children: ReactNode;
  onCanvasClick?: (worldX: number, worldY: number, tool: CanvasTool) => void;
  externalTool?: CanvasTool;
  onToolChange?: (tool: CanvasTool) => void;
  hideTools?: boolean;
  handTrackingEnabled?: boolean;
  onToggleHandTracking?: () => void;
}

export interface InfiniteCanvasHandle {
  getContainerRef: () => HTMLDivElement | null;
  getTransform: () => Transform;
  panBy: (dx: number, dy: number) => void;
  screenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
}

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(function InfiniteCanvas(
  {
    children,
    onCanvasClick,
    externalTool,
    onToolChange,
    hideTools,
    handTrackingEnabled,
    onToggleHandTracking,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [internalTool, setInternalTool] = useState<CanvasTool>("select");
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const spaceDown = useRef(false);

  useImperativeHandle(ref, () => ({
    getContainerRef: () => containerRef.current,
    getTransform: () => transform,
    panBy: (dx: number, dy: number) => {
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    },
    screenToWorld: (screenX: number, screenY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (screenX - rect.left - transform.x) / transform.scale,
        y: (screenY - rect.top - transform.y) / transform.scale,
      };
    },
  }));

  const tool = externalTool ?? internalTool;
  const setTool = onToolChange ?? setInternalTool;

  const zoom = useCallback(
    (delta: number, cx?: number, cy?: number) => {
      setTransform((t) => {
        const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.scale + delta));
        if (cx !== undefined && cy !== undefined) {
          const ratio = newScale / t.scale;
          return {
            scale: newScale,
            x: cx - (cx - t.x) * ratio,
            y: cy - (cy - t.y) * ratio,
          };
        }
        return { ...t, scale: newScale };
      });
    },
    [],
  );

  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      zoom(delta * transform.scale, cx, cy);
    },
    [zoom, transform.scale],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button === 1 || tool === "hand" || spaceDown.current) {
        e.preventDefault();
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          tx: transform.x,
          ty: transform.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [tool, transform.x, transform.y],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTransform((t) => ({
        ...t,
        x: panStart.current.tx + dx,
        y: panStart.current.ty + dy,
      }));
    },
    [isPanning],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        return;
      }

      if ((tool === "text" || tool === "sticky") && onCanvasClick) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = (screenX - transform.x) / transform.scale;
        const worldY = (screenY - transform.y) / transform.scale;
        onCanvasClick(worldX, worldY, tool);
      }
    },
    [isPanning, tool, onCanvasClick, transform],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceDown.current = true;
      }
      if (e.key === "v" || e.key === "V") setTool("select");
      if (e.key === "h" || e.key === "H") setTool("hand");
      if (e.key === "t" || e.key === "T") setTool("text");
      if (e.key === "n" || e.key === "N") setTool("sticky");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown.current = false;
        setIsPanning(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setTool]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", prevent, { passive: false });
    return () => el.removeEventListener("wheel", prevent);
  }, []);

  const zoomIn = () => zoom(ZOOM_STEP * transform.scale);
  const zoomOut = () => zoom(-ZOOM_STEP * transform.scale);
  const zoomToFit = () => setTransform({ x: 0, y: 0, scale: 1 });
  const zoomPct = Math.round(transform.scale * 100);

  const cursorStyle = isPanning
    ? "grabbing"
    : tool === "hand" || spaceDown.current
      ? "grab"
      : tool === "text"
        ? "text"
        : tool === "sticky"
          ? "crosshair"
          : "default";

  const TOOLS: { id: CanvasTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
    { id: "select", icon: MousePointer2, label: "Select", shortcut: "V" },
    { id: "hand", icon: Hand, label: "Pan", shortcut: "H" },
    { id: "text", icon: Type, label: "Text", shortcut: "T" },
    { id: "sticky", icon: StickyNote, label: "Note", shortcut: "N" },
  ];

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none"
      style={{ cursor: cursorStyle }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.07) ${DOT_SIZE}px, transparent ${DOT_SIZE}px)`,
          backgroundSize: `${DOT_GAP * transform.scale}px ${DOT_GAP * transform.scale}px`,
          backgroundPosition: `${transform.x % (DOT_GAP * transform.scale)}px ${transform.y % (DOT_GAP * transform.scale)}px`,
        }}
      />

      {/* Canvas content layer */}
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          willChange: "transform",
        }}
      >
        {children}
      </div>

      {!hideTools && (
        <>
          {/* Bottom-left toolbar */}
          <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1">
            <div className="flex items-center bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTool(t.id)}
                    className={`w-9 h-9 flex items-center justify-center transition-all relative group ${
                      tool === t.id
                        ? "bg-black/[0.06] text-black/70"
                        : "text-black/30 hover:text-black/60 hover:bg-black/[0.03]"
                    }`}
                    title={`${t.label} (${t.shortcut})`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[9px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                      {t.label} ({t.shortcut})
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom-right zoom controls */}
          <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2">
            {/* Hand tracking toggle */}
            {onToggleHandTracking && (
              <button
                onClick={onToggleHandTracking}
                className={`w-9 h-9 flex items-center justify-center rounded-xl border shadow-sm transition-all ${
                  handTrackingEnabled
                    ? "bg-indigo-500 text-white border-indigo-400 shadow-indigo-500/20"
                    : "bg-white text-black/30 border-black/[0.06] hover:text-black/60 hover:bg-black/[0.03]"
                }`}
                title="Hand Tracking (Camera)"
              >
                <ScanEye className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center bg-white rounded-xl border border-black/[0.06] shadow-sm overflow-hidden">
              <button
                onClick={zoomOut}
                className="w-8 h-8 flex items-center justify-center text-black/30 hover:text-black/60 hover:bg-black/[0.03] transition-all"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={zoomToFit}
                className="h-8 px-2 text-[10px] font-mono text-black/40 hover:text-black/60 hover:bg-black/[0.03] transition-all min-w-[48px] text-center"
              >
                {zoomPct}%
              </button>
              <button
                onClick={zoomIn}
                className="w-8 h-8 flex items-center justify-center text-black/30 hover:text-black/60 hover:bg-black/[0.03] transition-all"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={zoomToFit}
                className="w-8 h-8 flex items-center justify-center text-black/30 hover:text-black/60 hover:bg-black/[0.03] transition-all border-l border-black/[0.04]"
                title="Zoom to Fit"
              >
                <Maximize className="w-3 h-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default InfiniteCanvas;
