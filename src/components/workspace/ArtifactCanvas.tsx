"use client";

import { useCanvasStore, type CanvasElement, type CanvasStroke, ELEM_WIDTHS, estimateElemH } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import ElementCard from "./ElementCard";
import StrokeElement from "./StrokeElement";
import GroupBoundary, { computeGroupBounds } from "./GroupBoundary";
import InfiniteCanvas, { type CanvasTool, type InfiniteCanvasHandle } from "./InfiniteCanvas";
import HandTrackingOverlay, { type HandGestureEvent } from "./HandTrackingOverlay";
import DoubtPopup from "./DoubtPopup";
import SelectionBar from "./SelectionBar";
import CanvasContextMenu from "./CanvasContextMenu";

const STICKY_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];
const TITLE_Y = 50;
const ARTIFACTS_Y = 140;

interface ArtifactCanvasProps {
  topic?: string;
}

export default function ArtifactCanvas({ topic }: ArtifactCanvasProps) {
  const {
    elements,
    groups,
    connections,
    toasts,
    selectedElementIds,
    removeElement,
    addElement,
    moveElement,
    selectElements,
    toggleElementSelected,
    clearSelection,
  } = useCanvasStore();

  const {
    doubtPopup,
    contextMenu,
    darkMode,
    openDoubtPopup,
    closeDoubtPopup,
    openContextMenu,
    closeContextMenu,
  } = useUIStore();

  const [tool, setTool] = useState<CanvasTool>("interaction");
  const [canvasScale, setCanvasScale] = useState(1);
  const [handTrackingEnabled, setHandTrackingEnabled] = useState(false);
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const canvasHandleRef = useRef<InfiniteCanvasHandle>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Per-element undo on dismiss
  const [undoStack, setUndoStack] = useState<CanvasElement[]>([]);
  const handleDismiss = useCallback((el: CanvasElement) => {
    removeElement(el.id);
    setUndoStack((prev) => [...prev, el]);
    setTimeout(() => setUndoStack((prev) => prev.filter((e) => e.id !== el.id)), 6000);
  }, [removeElement]);

  const handleUndo = useCallback((el: CanvasElement) => {
    useCanvasStore.getState().addElement(el);
    setUndoStack((prev) => prev.filter((e) => e.id !== el.id));
  }, []);

  // Element selection — if element is grouped, select/toggle the whole group
  const handleElementSelect = useCallback((id: string, multi: boolean) => {
    const el = elements.find(e => e.id === id);
    const groupId = el?.groupId;
    if (groupId) {
      const memberIds = elements.filter(e => e.groupId === groupId).map(e => e.id);
      if (multi) {
        const anySelected = memberIds.some(mid => selectedElementIds.includes(mid));
        if (anySelected) {
          selectElements(selectedElementIds.filter(sid => !memberIds.includes(sid)));
        } else {
          selectElements([...selectedElementIds, ...memberIds]);
        }
      } else {
        selectElements(memberIds);
      }
    } else {
      if (multi) toggleElementSelected(id);
      else selectElements([id]);
    }
  }, [elements, selectedElementIds, selectElements, toggleElementSelected]);

  // Rubber-band box selection from InfiniteCanvas
  const handleBoxSelect = useCallback((x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    const hitIds = elements
      .filter((el) => {
        const elH = el.h ?? el.stroke?.height ?? estimateElemH(el.type);
        return el.x < maxX && el.x + el.w > minX && el.y < maxY && el.y + elH > minY;
      })
      .map((el) => el.id);
    if (hitIds.length > 0) selectElements(hitIds);
    else clearSelection();
  }, [elements, selectElements, clearSelection]);

  // ── Hand tracking ────────────────────────────────────────────────────────────

  const handDragTarget = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [handHighlight, setHandHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const highlightStart = useRef<{ x: number; y: number } | null>(null);

  const handleGesture = useCallback((event: HandGestureEvent) => {
    const handle = canvasHandleRef.current;
    if (!handle) return;

    switch (event.type) {
      case "pinch_start": {
        const world = handle.screenToWorld(event.screenX, event.screenY);
        const hit = elements.find((el) => {
          const elH = 300; // approximate
          return world.x >= el.x && world.x <= el.x + el.w &&
                 world.y >= el.y && world.y <= el.y + elH;
        });
        if (hit) {
          handDragTarget.current = { id: hit.id, offsetX: world.x - hit.x, offsetY: world.y - hit.y };
        } else {
          highlightStart.current = world;
          setHandHighlight({ x: world.x, y: world.y, w: 0, h: 0 });
        }
        break;
      }
      case "pinch_move": {
        const world = handle.screenToWorld(event.screenX, event.screenY);
        if (handDragTarget.current) {
          const { id, offsetX, offsetY } = handDragTarget.current;
          moveElement(id, world.x - offsetX, world.y - offsetY);
        } else if (highlightStart.current) {
          const sx = highlightStart.current.x, sy = highlightStart.current.y;
          setHandHighlight({ x: Math.min(sx, world.x), y: Math.min(sy, world.y), w: Math.abs(world.x - sx), h: Math.abs(world.y - sy) });
        }
        break;
      }
      case "pinch_end":
        handDragTarget.current = null;
        highlightStart.current = null;
        setHandHighlight(null);
        break;
      case "pan":
        if (event.deltaX !== undefined && event.deltaY !== undefined) {
          handle.panBy(event.deltaX * 0.7, event.deltaY * 0.7);
        }
        break;
      default: break;
    }
  }, [elements, moveElement]);

  // ── Hit-testing ──────────────────────────────────────────────────────────────

  // Convert a completed CanvasStroke into a first-class CanvasElement
  const handleStrokeComplete = useCallback((stroke: CanvasStroke) => {
    if (stroke.points.length < 2) return;
    const xs = stroke.points.map((p) => p[0]);
    const ys = stroke.points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = stroke.width * 2 + 8;
    const elX = minX - pad, elY = minY - pad;
    const elW = Math.max(maxX - minX + pad * 2, 4);
    const elH = Math.max(maxY - minY + pad * 2, 4);
    addElement({
      id: stroke.id,
      type: "stroke",
      x: elX, y: elY, w: elW,
      zIndex: useCanvasStore.getState().elements.length + 100,
      createdAt: Date.now(),
      stroke: {
        points: stroke.points.map(([x, y]) => [x - elX, y - elY] as [number, number]),
        color: stroke.color,
        width: stroke.width,
        height: elH,
      },
    });
  }, [addElement]);

  /** Find the element under a world coordinate. Uses measured height when available. */
  const hitTestElement = useCallback((worldX: number, worldY: number) => {
    return [...elements].reverse().find((el) => {
      const elH = el.h ?? el.stroke?.height ?? estimateElemH(el.type);
      return worldX >= el.x && worldX <= el.x + el.w &&
             worldY >= el.y && worldY <= el.y + elH;
    }) ?? null;
  }, [elements]);

  /** Find the group that owns a world coordinate. */
  const hitTestGroup = useCallback((worldX: number, worldY: number) => {
    for (const group of groups) {
      const bounds = computeGroupBounds(group.id, elements);
      if (!bounds) continue;
      if (worldX >= bounds.x && worldX <= bounds.x + bounds.w &&
          worldY >= bounds.y && worldY <= bounds.y + bounds.h) {
        return group;
      }
    }
    return null;
  }, [groups, elements]);

  // ── Canvas event handlers ────────────────────────────────────────────────────

  const handleCanvasDoubleClick = useCallback((worldX: number, worldY: number) => {
    const hitEl = hitTestElement(worldX, worldY);
    if (hitEl) {
      // Zoom to the element's group, or just the element if ungrouped
      const groupId = hitEl.groupId;
      const bounds = groupId
        ? computeGroupBounds(groupId, elements)
        : { x: hitEl.x - 32, y: hitEl.y - 32, w: hitEl.w + 64, h: 360 };
      if (bounds) {
        canvasHandleRef.current?.zoomToRect(bounds.x, bounds.y, bounds.w, bounds.h, 60);
      }
      return;
    }

    const hitGrp = hitTestGroup(worldX, worldY);
    if (hitGrp) {
      const bounds = computeGroupBounds(hitGrp.id, elements);
      if (bounds) canvasHandleRef.current?.zoomToRect(bounds.x, bounds.y, bounds.w, bounds.h, 60);
      return;
    }

    // Empty canvas — open doubt popup
    const handle = canvasHandleRef.current;
    if (!handle) return;
    const t = handle.getTransform();
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const screenX = worldX * t.scale + t.x + (rect?.left ?? 0);
    const screenY = worldY * t.scale + t.y + (rect?.top ?? 0);
    openDoubtPopup(worldX, worldY);
    (window as unknown as Record<string, unknown>).__doubtScreenX = screenX;
    (window as unknown as Record<string, unknown>).__doubtScreenY = screenY;
  }, [hitTestElement, hitTestGroup, elements, openDoubtPopup]);

  const handleCanvasRightClick = useCallback((worldX: number, worldY: number, screenX: number, screenY: number) => {
    const hitGrp = hitTestGroup(worldX, worldY);
    openContextMenu({ screenX, screenY, worldX, worldY, targetModuleId: hitGrp?.id });
  }, [hitTestGroup, openContextMenu]);

  const handleCanvasClick = useCallback((worldX: number, worldY: number, clickTool: CanvasTool) => {
    if (clickTool === "text") {
      addElement({
        id: `el-text-${Date.now()}`,
        type: "text",
        x: worldX, y: worldY,
        w: ELEM_WIDTHS.text,
        zIndex: elements.length + 10,
        createdAt: Date.now(),
        text: { content: "", style: "body" },
      });
      setTool("select");
    } else if (clickTool === "sticky") {
      const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
      addElement({
        id: `el-sticky-${Date.now()}`,
        type: "sticky",
        x: worldX, y: worldY,
        w: ELEM_WIDTHS.sticky,
        zIndex: elements.length + 10,
        createdAt: Date.now(),
        sticky: { content: "", color },
      });
      setTool("select");
    } else {
      // Select tool — click on empty canvas clears selection
      clearSelection();
    }
  }, [addElement, clearSelection, elements.length]);

  // ── Fit-all when groups change ───────────────────────────────────────────────

  useEffect(() => {
    if (elements.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      const elH = el.h ?? el.stroke?.height ?? estimateElemH(el.type);
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.w);
      maxY = Math.max(maxY, el.y + elH);
    }
    canvasHandleRef.current?.fitAll({ x: minX - 60, y: minY - 60, w: maxX - minX + 120, h: maxY - minY + 120 });
  // Only re-fit when group count changes (new module added by AI)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const doubtScreenPos = doubtPopup ? (() => {
    const wx = (window as unknown as Record<string, number>).__doubtScreenX ?? 400;
    const wy = (window as unknown as Record<string, number>).__doubtScreenY ?? 300;
    return { screenX: wx, screenY: wy };
  })() : null;

  const penColor = darkMode ? "rgba(124,58,237,0.8)" : "rgba(124,58,237,0.7)";

  const handleToolChange = useCallback((t: CanvasTool) => setTool(t), []);

  return (
    <>
      <div ref={canvasContainerRef} className="w-full h-full relative">
        <InfiniteCanvas
          ref={canvasHandleRef}
          onCanvasClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
          onRightClick={handleCanvasRightClick}
          onShiftClick={(worldX, worldY) => {
            const hitEl = hitTestElement(worldX, worldY);
            if (hitEl) toggleElementSelected(hitEl.id);
          }}
          onBoxSelect={handleBoxSelect}
          externalTool={tool}
          onToolChange={handleToolChange}
          handTrackingEnabled={handTrackingEnabled}
          onToggleHandTracking={() => setHandTrackingEnabled((p) => !p)}
          darkMode={darkMode}
          onStrokeComplete={handleStrokeComplete}
          strokeColor={penColor}
          onTransformChange={(t) => setCanvasScale(t.scale)}
        >
          {topic && <CanvasTitle topic={topic} dark={darkMode} />}
          {elements.length === 0 && <EmptyHint dark={darkMode} />}

          {/* Group boundaries — rendered below elements */}
          {groups.map((group) => {
            const members = elements.filter((e) => e.groupId === group.id);
            const hasSelected = members.some((e) => selectedElementIds.includes(e.id));
            return (
              <GroupBoundary
                key={group.id}
                group={group}
                elements={members}
                hasSelectedMember={hasSelected}
                isHovered={hoveredGroupId === group.id}
              />
            );
          })}

          {/* Connection arrows between groups */}
          {connections.length > 0 && (
            <FlowArrows
              connections={connections}
              elements={elements}
              selectedGroupIds={groups
                .filter((g) =>
                  elements.filter((e) => e.groupId === g.id).some((e) => selectedElementIds.includes(e.id)),
                )
                .map((g) => g.id)}
            />
          )}

          {/* Non-stroke elements — sorted by zIndex */}
          {[...elements]
            .filter((el) => el.type !== "stroke")
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((el) => (
              <ElementCard
                key={el.id}
                element={el}
                isSelected={selectedElementIds.includes(el.id)}
                onSelect={handleElementSelect}
                canvasScale={canvasScale}
                currentTool={tool}
                onGroupHover={setHoveredGroupId}
              />
            ))}

          {/* Stroke annotations — always rendered above artifacts */}
          {[...elements]
            .filter((el) => el.type === "stroke")
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((el) => (
              <StrokeElement
                key={el.id}
                element={el}
                isSelected={selectedElementIds.includes(el.id)}
                onSelect={handleElementSelect}
                canvasScale={canvasScale}
                currentTool={tool}
                onGroupHover={setHoveredGroupId}
              />
            ))}

          {/* Hand-tracking selection highlight */}
          {handHighlight && handHighlight.w > 5 && (
            <div
              className="absolute border-2 border-dashed border-indigo-400/50 bg-indigo-400/5 rounded-lg pointer-events-none"
              style={{ left: handHighlight.x, top: handHighlight.y, width: handHighlight.w, height: handHighlight.h }}
            />
          )}
        </InfiniteCanvas>

        <HandTrackingOverlay
          enabled={handTrackingEnabled}
          onGesture={handleGesture}
          containerRef={canvasContainerRef}
        />

        {/* Selection bar */}
        <AnimatePresence>
          {selectedElementIds.length >= 1 && <SelectionBar />}
        </AnimatePresence>

        {/* Doubt popup */}
        <AnimatePresence>
          {doubtPopup && doubtScreenPos && (
            <DoubtPopup
              worldX={doubtPopup.worldX}
              worldY={doubtPopup.worldY}
              screenX={doubtScreenPos.screenX}
              screenY={doubtScreenPos.screenY}
              prefill={doubtPopup.prefill}
              onClose={closeDoubtPopup}
            />
          )}
        </AnimatePresence>

        {/* Context menu */}
        <AnimatePresence>
          {contextMenu && (
            <CanvasContextMenu
              {...contextMenu}
              onClose={closeContextMenu}
              onSetTool={setTool}
              onExpandModule={(groupId) => {
                const bounds = computeGroupBounds(groupId, elements);
                if (bounds) canvasHandleRef.current?.zoomToRect(bounds.x, bounds.y, bounds.w, bounds.h, 60);
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Artifact toasts */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="rounded-xl px-4 py-2.5 shadow-xl flex items-center gap-3"
              style={{
                backgroundColor: darkMode ? "rgba(20,20,40,0.94)" : "rgba(255,255,255,0.96)",
                border: `1px solid ${darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)"}`,
                backdropFilter: "blur(12px)",
              }}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${toast.status === "done" ? "bg-green-400" : "bg-amber-400 animate-pulse"}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-semibold tracking-wider uppercase text-green-500">CANVAS</span>
                  <span className={`text-[12px] font-medium ${darkMode ? "text-white/80" : "text-black/75"}`}>{toast.title}</span>
                </div>
                <span className={`text-[10px] ${darkMode ? "text-white/40" : "text-black/35"}`}>
                  {toast.status === "preparing" ? "Generating..." : toast.status === "adding" ? "Adding to canvas" : "Added ✓"}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Undo toasts */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2">
        <AnimatePresence>
          {undoStack.map((el) => (
            <motion.div
              key={el.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-xl"
              style={{
                backgroundColor: darkMode ? "rgba(20,20,40,0.92)" : "rgba(255,255,255,0.96)",
                border: `1px solid ${darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)"}`,
                backdropFilter: "blur(12px)",
                color: darkMode ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)",
              }}
            >
              <span className="text-[12px]">Element removed</span>
              <button
                onClick={() => handleUndo(el)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-violet-500 hover:text-violet-600 transition-colors"
              >
                ↩ Undo
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/* ──── Canvas Title ──── */

function CanvasTitle({ topic, dark }: { topic: string; dark: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="absolute pointer-events-none select-none"
      style={{ left: "50%", top: TITLE_Y, transform: "translateX(-50%)" }}
    >
      <h1
        className="leading-tight text-center whitespace-nowrap"
        style={{
          fontFamily: "var(--font-caveat), 'Segoe Print', cursive",
          fontSize: 48, fontWeight: 700, letterSpacing: "-0.01em",
          color: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
        }}
      >
        {topic}
      </h1>
      <div
        className="mt-1 h-[2px] rounded-full mx-auto"
        style={{ width: Math.min(topic.length * 22, 600), backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
      />
    </motion.div>
  );
}

function EmptyHint({ dark }: { dark: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="absolute pointer-events-none select-none"
      style={{ left: 84, top: ARTIFACTS_Y }}
    >
      <p className="text-[13px] italic" style={{ color: dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.2)" }}>
        Start chatting below — groups will appear as you explore...
      </p>
      <p className="text-[11px] mt-1 italic" style={{ color: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)" }}>
        Double-click to zoom · Right-click for options · P for pen
      </p>
    </motion.div>
  );
}

/* ──── Flow Arrows ──── */

interface FlowArrowsProps {
  connections: { id: string; fromModuleId: string; toModuleId: string }[];
  elements: CanvasElement[];
  selectedGroupIds: string[];
}

function FlowArrows({ connections, elements, selectedGroupIds }: FlowArrowsProps) {
  const edges = connections.map((conn) => {
    const fromBounds = computeGroupBounds(conn.fromModuleId, elements);
    const toBounds   = computeGroupBounds(conn.toModuleId,   elements);
    if (!fromBounds || !toBounds) return null;

    const isHighlighted = selectedGroupIds.includes(conn.fromModuleId) || selectedGroupIds.includes(conn.toModuleId);
    return {
      id: conn.id,
      x1: fromBounds.x + fromBounds.w / 2,
      y1: fromBounds.y + fromBounds.h,
      x2: toBounds.x   + toBounds.w   / 2,
      y2: toBounds.y,
      highlighted: isHighlighted,
    };
  }).filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number; highlighted: boolean }[];

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
        <marker id="fa-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="rgba(124,58,237,0.4)" />
        </marker>
        <marker id="fa-bright" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="rgba(124,58,237,0.85)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const sx = e.x1 - minX, sy = e.y1 - minY, ex = e.x2 - minX, ey = e.y2 - minY;
        const curve = Math.min(Math.abs(ey - sy) * 0.4, 100);
        const path = `M ${sx} ${sy} C ${sx} ${sy + curve}, ${ex} ${ey - curve}, ${ex} ${ey}`;
        const stroke = e.highlighted ? "rgba(124,58,237,0.7)" : "rgba(124,58,237,0.22)";
        const marker = e.highlighted ? "url(#fa-bright)" : "url(#fa-dim)";
        return (
          <g key={e.id}>
            <path d={path} fill="none" stroke="rgba(124,58,237,0.05)" strokeWidth={6} strokeLinecap="round" />
            <path
              d={path} fill="none" stroke={stroke}
              strokeWidth={1.5} strokeLinecap="round"
              strokeDasharray={e.highlighted ? undefined : "7 5"}
              markerEnd={marker}
            >
              {!e.highlighted && (
                <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.5s" repeatCount="indefinite" />
              )}
            </path>
          </g>
        );
      })}
    </svg>
  );
}
