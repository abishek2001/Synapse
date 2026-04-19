"use client";

import { useCanvasStore, type CanvasElement, type CanvasStroke, ELEM_WIDTHS, estimateElemH, isUserAnnotation } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import { useSessionStore } from "@/store/session";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import ElementCard from "./ElementCard";
import StrokeElement from "./StrokeElement";
import GroupBoundary, { PendingGroupBoundary, computeGroupBounds } from "./GroupBoundary";
import InfiniteCanvas, { type CanvasTool, type InfiniteCanvasHandle } from "./InfiniteCanvas";
import HandTrackingOverlay, { type HandGestureEvent } from "./HandTrackingOverlay";
import DoubtPopup from "./DoubtPopup";
import SelectionBar from "./SelectionBar";
import CanvasContextMenu from "./CanvasContextMenu";
import { CANVAS_COMMAND_EVENT, type CanvasCommand } from "@/lib/voice/commands";
import { stopSpeaking } from "@/lib/voice/speech";

export interface ArtifactCanvasHandle {
  zoomToGroup: (groupId: string) => void;
}

const STICKY_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];
const TITLE_Y = 50;
const ARTIFACTS_Y = 140;

interface ArtifactCanvasProps {
  topic?: string;
  intro?: string;
}

const ArtifactCanvas = forwardRef<ArtifactCanvasHandle, ArtifactCanvasProps>(function ArtifactCanvas({ topic, intro }, ref) {
  const {
    elements,
    groups,
    connections,
    selectedElementIds,
    pendingModule,
    removeElement,
    addElement,
    addUserAnnotation,
    removeUserAnnotation,
    undoLastUserAction,
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

  useImperativeHandle(ref, () => ({
    zoomToGroup(groupId: string) {
      const els = useCanvasStore.getState().elements;
      const scale = useUIStore.getState().canvasScale;
      const bounds = computeGroupBounds(groupId, els, scale);
      if (bounds) canvasHandleRef.current?.zoomToRect(bounds.x, bounds.y, bounds.w, bounds.h, 60, 1.0);
    },
  }));

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

  // ── Hit-testing ──────────────────────────────────────────────────────────────

  // Convert a completed CanvasStroke into a first-class CanvasElement.
  // Routed through `addUserAnnotation` so the stroke joins the annotation
  // undo stack and Cmd/Ctrl+Z (or the toolbar undo) can take it back.
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
    addUserAnnotation({
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
  }, [addUserAnnotation]);

  // Eraser sweep — find any user annotation whose bounding box (inflated by
  // `radius`) contains the cursor, and remove it. Strokes already have a
  // tight bounding box (they're sized to their drawn extent + a small pad)
  // so this gives reasonably accurate erase behaviour without needing
  // per-segment distance math.
  const handleEraseAt = useCallback((worldX: number, worldY: number, radius: number) => {
    const all = useCanvasStore.getState().elements;
    const hit = [...all].reverse().find((el) => {
      if (!isUserAnnotation(el)) return false;
      const elH = el.h ?? el.stroke?.height ?? estimateElemH(el.type);
      return worldX >= el.x - radius && worldX <= el.x + el.w + radius &&
             worldY >= el.y - radius && worldY <= el.y + elH + radius;
    });
    if (hit) removeUserAnnotation(hit.id);
  }, [removeUserAnnotation]);

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
      const bounds = computeGroupBounds(group.id, elements, canvasScale);
      if (!bounds) continue;
      if (worldX >= bounds.x && worldX <= bounds.x + bounds.w &&
          worldY >= bounds.y && worldY <= bounds.y + bounds.h) {
        return group;
      }
    }
    return null;
  }, [groups, elements, canvasScale]);

  // ── Hand tracking ────────────────────────────────────────────────────────────
  // Event model (see HandTrackingOverlay for the producer side):
  //   cursor      — every frame; hover-highlight what the user is aiming at,
  //                 and (when gesture==="point") accumulate a dwell timer over
  //                 the element under the cursor. Hold steady for DWELL_MS to
  //                 fire a selection without needing to pinch.
  //   grab_start  — pinch began; hit-test under cursor and remember either an
  //                 element-drag target or "canvas-drag" mode
  //   grab_move   — element-drag updates the element; canvas-drag pans
  //   grab_end    — wasClick=true short pinches act like a left click (select
  //                 element, or clear selection)
  //   pan         — fist drag; pans the canvas with a small gain so small hand
  //                 motion still moves the world
  //   zoom        — peace sign or two-hand pinch; pivots on the supplied point

  /** While pinch is held: either a target element (drag mode) or the screen
   *  position where the pinch began (canvas-drag/pan mode). */
  const handDragRef = useRef<
    | { kind: "element"; id: string; offsetX: number; offsetY: number; movedGroupSnapshot?: Map<string, { x: number; y: number }>; groupId?: string }
    | { kind: "canvas" }
    | null
  >(null);

  // ── Dwell-to-select (point gesture) ─────────────────────────────────────
  // While the user holds a "point" gesture steady over an element for
  // DWELL_MS, we treat it as a click — same effect as a quick pinch. A small
  // ring around the cursor visualises the progress so the user knows when
  // selection will fire and can move away to cancel.
  const DWELL_MS = 700;
  const DWELL_RADIUS_PX = 28;
  const dwellStateRef = useRef<{
    startTime: number;
    startScreenX: number;
    startScreenY: number;
    targetElementId: string;
  } | null>(null);
  const [dwellProgress, setDwellProgress] = useState<{
    x: number;
    y: number;
    pct: number;
    elementId: string;
  } | null>(null);

  const cancelDwell = useCallback(() => {
    if (dwellStateRef.current || dwellProgress) {
      dwellStateRef.current = null;
      setDwellProgress(null);
    }
  }, [dwellProgress]);

  const handleGesture = useCallback((event: HandGestureEvent) => {
    const handle = canvasHandleRef.current;
    if (!handle) return;

    switch (event.type) {
      case "cursor": {
        if (event.gesture === "point" || event.gesture === "openPalm") {
          const w = handle.screenToWorld(event.screenX, event.screenY);
          const grp = hitTestGroup(w.x, w.y);
          setHoveredGroupId(grp?.id ?? null);

          // Dwell-to-select only fires on a true "point" gesture (index out,
          // others curled). openPalm is just an idle hover.
          if (event.gesture !== "point") {
            cancelDwell();
            break;
          }
          const hitEl = hitTestElement(w.x, w.y);
          if (!hitEl) {
            cancelDwell();
            break;
          }

          const ds = dwellStateRef.current;
          const movedFar =
            ds &&
            (Math.abs(event.screenX - ds.startScreenX) > DWELL_RADIUS_PX ||
              Math.abs(event.screenY - ds.startScreenY) > DWELL_RADIUS_PX);
          const targetChanged = ds && ds.targetElementId !== hitEl.id;

          if (!ds || movedFar || targetChanged) {
            // Start a fresh dwell window over the new target.
            dwellStateRef.current = {
              startTime: performance.now(),
              startScreenX: event.screenX,
              startScreenY: event.screenY,
              targetElementId: hitEl.id,
            };
            setDwellProgress({
              x: event.screenX,
              y: event.screenY,
              pct: 0,
              elementId: hitEl.id,
            });
          } else {
            const elapsed = performance.now() - ds.startTime;
            const pct = Math.min(1, elapsed / DWELL_MS);
            setDwellProgress({
              x: event.screenX,
              y: event.screenY,
              pct,
              elementId: hitEl.id,
            });
            if (elapsed >= DWELL_MS) {
              // Fire the same selection logic a quick-pinch click would.
              handleElementSelect(hitEl.id, false);
              dwellStateRef.current = null;
              setDwellProgress(null);
            }
          }
        } else {
          // Any non-pointing/idle gesture cancels an in-flight dwell.
          cancelDwell();
        }
        break;
      }

      case "grab_start": {
        cancelDwell();
        const world = handle.screenToWorld(event.screenX, event.screenY);
        const hitEl = hitTestElement(world.x, world.y);
        if (hitEl) {
          // Snapshot all sibling group positions so the entire group moves
          // together (matches the mouse drag model in ElementCard).
          const groupId = hitEl.groupId;
          const snapshot = new Map<string, { x: number; y: number }>();
          if (groupId) {
            for (const sibling of useCanvasStore.getState().elements) {
              if (sibling.groupId === groupId) snapshot.set(sibling.id, { x: sibling.x, y: sibling.y });
            }
          }
          handDragRef.current = {
            kind: "element",
            id: hitEl.id,
            offsetX: world.x - hitEl.x,
            offsetY: world.y - hitEl.y,
            movedGroupSnapshot: snapshot.size > 1 ? snapshot : undefined,
            groupId,
          };
        } else {
          handDragRef.current = { kind: "canvas" };
        }
        break;
      }

      case "grab_move": {
        const drag = handDragRef.current;
        if (!drag) return;
        if (drag.kind === "element") {
          const world = handle.screenToWorld(event.screenX, event.screenY);
          const targetX = world.x - drag.offsetX;
          const targetY = world.y - drag.offsetY;
          if (drag.movedGroupSnapshot) {
            const anchor = drag.movedGroupSnapshot.get(drag.id);
            if (anchor) {
              const dxw = targetX - anchor.x;
              const dyw = targetY - anchor.y;
              for (const [id, pos] of drag.movedGroupSnapshot) {
                moveElement(id, pos.x + dxw, pos.y + dyw);
              }
            } else {
              moveElement(drag.id, targetX, targetY);
            }
          } else {
            moveElement(drag.id, targetX, targetY);
          }
        } else {
          handle.panBy(event.dx, event.dy);
        }
        break;
      }

      case "grab_end": {
        const drag = handDragRef.current;
        handDragRef.current = null;
        if (event.wasClick) {
          // Short pinch = click — select element or clear selection
          const world = handle.screenToWorld(event.screenX, event.screenY);
          const hitEl = hitTestElement(world.x, world.y);
          if (hitEl) handleElementSelect(hitEl.id, false);
          else if (drag?.kind === "canvas") clearSelection();
        }
        break;
      }

      case "pan": {
        cancelDwell();
        // Fist drag — small gain so a comfortable hand range covers the viewport
        const GAIN = 1.4;
        handle.panBy(event.dx * GAIN, event.dy * GAIN);
        break;
      }

      case "zoom": {
        cancelDwell();
        handle.zoomAt(event.factor, event.cx, event.cy);
        if (event.dx !== undefined && event.dy !== undefined) {
          handle.panBy(event.dx, event.dy);
        }
        break;
      }
    }
  }, [hitTestElement, hitTestGroup, handleElementSelect, moveElement, clearSelection, cancelDwell]);

  // ── Canvas event handlers ────────────────────────────────────────────────────

  const handleCanvasDoubleClick = useCallback((worldX: number, worldY: number) => {
    const hitEl = hitTestElement(worldX, worldY);
    if (hitEl) {
      // Zoom to the element's group, or just the element if ungrouped
      const groupId = hitEl.groupId;
      const bounds = groupId
        ? computeGroupBounds(groupId, elements, canvasScale)
        : { x: hitEl.x - 32, y: hitEl.y - 32, w: hitEl.w + 64, h: 360 };
      if (bounds) {
        canvasHandleRef.current?.zoomToRect(bounds.x, bounds.y, bounds.w, bounds.h, 60);
      }
      return;
    }

    const hitGrp = hitTestGroup(worldX, worldY);
    if (hitGrp) {
      const bounds = computeGroupBounds(hitGrp.id, elements, canvasScale);
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
      addUserAnnotation({
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
      addUserAnnotation({
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
  }, [addUserAnnotation, clearSelection, elements.length]);

  // ── Voice / external canvas commands ─────────────────────────────────────────
  // Listens for `synapse:canvas-command` events dispatched by `lib/voice/commands.ts`
  // (CanvasInputBar intercepts navigation phrases from the speech-to-text result
  // before they reach the chat orchestrator). Module navigation tracks an
  // "active module index" so "next/previous" can walk through groups in the
  // order they were created. The index is also resynced when the user
  // explicitly jumps to a module by number.
  const activeModuleIdxRef = useRef(0);

  const zoomToGroupAtIndex = useCallback((idx: number) => {
    const gs = useCanvasStore.getState().groups;
    const els = useCanvasStore.getState().elements;
    if (gs.length === 0 || idx < 0 || idx >= gs.length) return;
    activeModuleIdxRef.current = idx;
    const bounds = computeGroupBounds(gs[idx].id, els, canvasScale);
    if (bounds) canvasHandleRef.current?.zoomToRect(bounds.x, bounds.y, bounds.w, bounds.h, 60, 1.0);
  }, [canvasScale]);

  useEffect(() => {
    const handler = (raw: Event) => {
      const cmd = (raw as CustomEvent<CanvasCommand>).detail;
      const handle = canvasHandleRef.current;
      if (!handle) return;
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      const cx = (rect?.left ?? 0) + (rect?.width ?? 0) / 2;
      const cy = (rect?.top  ?? 0) + (rect?.height ?? 0) / 2;

      switch (cmd.type) {
        case "zoom_in":     handle.zoomAt(cmd.amount ?? 1.25, cx, cy); break;
        case "zoom_out":    handle.zoomAt(cmd.amount ?? 0.8,  cx, cy); break;
        case "zoom_reset":  {
          const t = handle.getTransform();
          // Reset to 100% centred on viewport — use zoomAt to land smoothly
          const factor = 1 / Math.max(t.scale, 1e-6);
          handle.zoomAt(factor, cx, cy);
          break;
        }
        case "fit_all": {
          const els = useCanvasStore.getState().elements;
          if (els.length === 0) return;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const el of els) {
            const elH = el.h ?? el.stroke?.height ?? estimateElemH(el.type);
            minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + el.w); maxY = Math.max(maxY, el.y + elH);
          }
          handle.fitAll({ x: minX - 60, y: minY - 60, w: maxX - minX + 120, h: maxY - minY + 120 });
          break;
        }
        case "next_module": {
          const total = useCanvasStore.getState().groups.length;
          if (total === 0) return;
          const next = Math.min(total - 1, activeModuleIdxRef.current + 1);
          zoomToGroupAtIndex(next);
          break;
        }
        case "prev_module": {
          const total = useCanvasStore.getState().groups.length;
          if (total === 0) return;
          const prev = Math.max(0, activeModuleIdxRef.current - 1);
          zoomToGroupAtIndex(prev);
          break;
        }
        case "goto_module": {
          zoomToGroupAtIndex(cmd.index - 1);
          break;
        }
        case "pan":           handle.panBy(cmd.dx, cmd.dy); break;
        case "stop_speaking": stopSpeaking(); break;
        case "undo":          undoLastUserAction(); break;
        case "clear_selection": clearSelection(); break;
        case "select_all":    selectElements(useCanvasStore.getState().elements.map((e) => e.id)); break;
        case "open_doubt": {
          const t = handle.getTransform();
          const wx = (cx - (rect?.left ?? 0) - t.x) / t.scale;
          const wy = (cy - (rect?.top  ?? 0) - t.y) / t.scale;
          openDoubtPopup(wx, wy);
          (window as unknown as Record<string, unknown>).__doubtScreenX = cx;
          (window as unknown as Record<string, unknown>).__doubtScreenY = cy;
          break;
        }
        // `replay` and `show_help` are forwarded as well-known events that
        // CanvasInputBar / HandTrackingOverlay listen for separately.
        case "replay":
        case "show_help":
          window.dispatchEvent(new CustomEvent(`synapse:${cmd.type}`));
          break;
      }
    };
    window.addEventListener(CANVAS_COMMAND_EVENT, handler as EventListener);
    return () => window.removeEventListener(CANVAS_COMMAND_EVENT, handler as EventListener);
  }, [zoomToGroupAtIndex, undoLastUserAction, clearSelection, selectElements, openDoubtPopup]);

  // ── Zoom when groups change ──────────────────────────────────────────────────

  const prevGroupCountRef = useRef(0);
  useEffect(() => {
    const delta = groups.length - prevGroupCountRef.current;
    prevGroupCountRef.current = groups.length;
    if (groups.length === 0) return;

    if (delta === 1) {
      // New AI group — zoom to it at natural (100%) scale, shrinking only if it doesn't fit
      const newGroup = groups[groups.length - 1];
      const bounds = computeGroupBounds(newGroup.id, elements, canvasScale);
      if (bounds) {
        canvasHandleRef.current?.zoomToRect(bounds.x, bounds.y, bounds.w, bounds.h, 80, 1.0);
      }
    } else {
      // Multiple groups at once (mock load, initial restore) — fit everything
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const doubtScreenPos = doubtPopup ? (() => {
    const wx = (window as unknown as Record<string, number>).__doubtScreenX ?? 400;
    const wy = (window as unknown as Record<string, number>).__doubtScreenY ?? 300;
    return { screenX: wx, screenY: wy };
  })() : null;

  const penColor = darkMode ? "rgba(124,58,237,0.8)" : "rgba(124,58,237,0.7)";

  const handleToolChange = useCallback((t: CanvasTool) => setTool(t), []);

  const { setCanvasScale: setGlobalCanvasScale } = useUIStore();

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
          onEraseAt={handleEraseAt}
          onUndoAnnotation={undoLastUserAction}
          onTransformChange={(t) => { setCanvasScale(t.scale); setGlobalCanvasScale(t.scale); }}
        >
          {intro && <CanvasIntroText intro={intro} dark={darkMode} />}
          {elements.length === 0 && !intro && <EmptyHint dark={darkMode} />}

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
                canvasScale={canvasScale}
              />
            );
          })}

          {/* In-flight pending module — dashed boundary while AI streams artifacts */}
          {pendingModule && pendingModule.elementIds.length > 0 && (
            <PendingGroupBoundary
              elements={elements.filter((e) => pendingModule.elementIds.includes(e.id))}
              title={pendingModule.title}
              canvasScale={canvasScale}
            />
          )}

          {/* Connection arrows between groups */}
          {connections.length > 0 && (
            <FlowArrows
              connections={connections}
              elements={elements}
              canvasScale={canvasScale}
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

        </InfiniteCanvas>

        <HandTrackingOverlay
          enabled={handTrackingEnabled}
          onGesture={handleGesture}
          containerRef={canvasContainerRef}
          darkMode={darkMode}
        />

        {/* Dwell-to-select progress ring — visualises the 700ms hold required
            for a "point" gesture to act as a click. Sits at viewport-absolute
            coords (same coordinate space as the cursor produced by the
            HandTrackingOverlay) so it renders directly under the user's
            fingertip cursor. */}
        {handTrackingEnabled && dwellProgress && (
          <svg
            className="fixed pointer-events-none z-[56]"
            width={64}
            height={64}
            style={{
              left: dwellProgress.x - 32,
              top: dwellProgress.y - 32,
            }}
          >
            <circle
              cx={32}
              cy={32}
              r={26}
              fill="none"
              stroke="rgba(99,102,241,0.18)"
              strokeWidth={3}
            />
            <circle
              cx={32}
              cy={32}
              r={26}
              fill="none"
              stroke="#6366f1"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 * (1 - dwellProgress.pct)}
              transform="rotate(-90 32 32)"
              style={{ transition: "stroke-dashoffset 80ms linear" }}
            />
          </svg>
        )}

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
              originGroupId={doubtPopup.originGroupId}
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
});

export default ArtifactCanvas;

/* ──── Canvas Title ──── */

function CanvasTitle({ topic, dark }: { topic: string; dark: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="absolute pointer-events-none select-none flex flex-col items-center"
      style={{
        left: "50%",
        top: TITLE_Y,
        transform: "translateX(-50%)",
      }}
    >
      <h1
        className="leading-tight text-center whitespace-nowrap"
        style={{
          fontFamily: "var(--font-caveat), 'Segoe Print', cursive",
          // Scale font with viewport — clamp prevents tiny on small screens / huge on 4K
          fontSize: "clamp(32px, 4.5vw, 64px)",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
        }}
      >
        {topic}
      </h1>
      <div
        className="mt-1 rounded-full mx-auto"
        style={{
          // Scale underline width AND thickness with viewport
          width: `clamp(${Math.min(topic.length * 14, 280)}px, ${Math.min(topic.length * 1.4, 36)}vw, ${Math.min(topic.length * 24, 720)}px)`,
          height: "clamp(2px, 0.32vw, 4px)",
          backgroundColor: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
        }}
      />
    </motion.div>
  );
}

/* ──── Canvas Intro Text (typewriter) ──── */

function CanvasIntroText({ intro, dark }: { intro: string; dark: boolean }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(intro.slice(0, i));
      if (i >= intro.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [intro]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="absolute pointer-events-none select-none"
      style={{ left: 80, top: TITLE_Y + 100, width: 640 }}
    >
      <p
        style={{
          fontFamily: "var(--font-caveat), 'Segoe Print', cursive",
          fontSize: 21,
          lineHeight: 1.65,
          color: dark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.48)",
        }}
      >
        {displayed}
        {displayed.length < intro.length && (
          <span
            className="animate-pulse"
            style={{ color: dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }}
          >
            |
          </span>
        )}
      </p>
    </motion.div>
  );
}

function EmptyHint({ dark }: { dark: boolean }) {
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const learningMode = useSessionStore((s) => s.learningMode);

  // While streaming the first turn, show the onboarding ghost
  if (isStreaming) {
    return <OnboardingGhost dark={dark} mode={learningMode} />;
  }

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

/* ── Onboarding Ghost — 3-step pulse while first turn is streaming ───────── */
function OnboardingGhost({ dark, mode }: { dark: boolean; mode: "guided" | "auto" | null }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 3), 1500);
    return () => clearInterval(id);
  }, []);

  const steps = [
    { label: "Synapse is thinking", icon: "·" },
    { label: mode === "auto" ? "Architecting your canvas" : "Drawing your first concept", icon: "✦" },
    { label: "Almost there", icon: "→" },
  ];

  const muted = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)";
  const accent = "rgba(124,58,237,0.85)";
  const ghostFill = dark ? "rgba(124,58,237,0.10)" : "rgba(124,58,237,0.06)";
  const ghostStroke = dark ? "rgba(124,58,237,0.30)" : "rgba(124,58,237,0.28)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute pointer-events-none select-none"
      style={{ left: 84, top: ARTIFACTS_Y }}
    >
      {/* Ghost artifact rectangles */}
      <div className="flex gap-3 mb-5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{
              opacity: step >= 1 ? [0.4, 0.8, 0.4] : 0.18,
              scale: 1,
            }}
            transition={{
              duration: 1.8,
              delay: i * 0.15,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              width: 160,
              height: 100,
              backgroundColor: ghostFill,
              border: `1px dashed ${ghostStroke}`,
              borderRadius: 12,
            }}
          />
        ))}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                backgroundColor: step === i ? accent : muted,
                scale: step === i ? 1.4 : 1,
              }}
              transition={{ duration: 0.3 }}
              style={{ width: 6, height: 6, borderRadius: 3 }}
            />
          ))}
        </div>
        <motion.span
          key={step}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="text-[13px] font-medium"
          style={{ color: dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)" }}
        >
          {steps[step].label}
          <span className="ml-1.5 text-violet-500">{steps[step].icon}</span>
        </motion.span>
      </div>
    </motion.div>
  );
}

/* ──── Flow Arrows ──── */

interface FlowArrowsProps {
  connections: { id: string; fromModuleId: string; toModuleId: string }[];
  elements: CanvasElement[];
  canvasScale: number;
  selectedGroupIds: string[];
}

type ArrowSide = "right" | "left" | "top" | "bottom";

interface ArrowAnchor {
  x: number;
  y: number;
  dirX: number; // outward normal of the chosen edge
  dirY: number;
}

function pickSides(
  from: { x: number; y: number; w: number; h: number },
  to:   { x: number; y: number; w: number; h: number },
): { fromSide: ArrowSide; toSide: ArrowSide } {
  const gapRight  = to.x - (from.x + from.w);
  const gapLeft   = from.x - (to.x + to.w);
  const gapBottom = to.y - (from.y + from.h);
  const gapTop    = from.y - (to.y + to.h);

  const horizSep = gapRight >= 0 || gapLeft >= 0;
  const vertSep  = gapBottom >= 0 || gapTop >= 0;

  // Both axes separated → boxes are diagonally offset. Pick the axis with the
  // *smaller* positive gap so the arrow exits through the closer pair of faces.
  if (horizSep && vertSep) {
    const hGap = gapRight  >= 0 ? gapRight  : gapLeft;
    const vGap = gapBottom >= 0 ? gapBottom : gapTop;
    if (hGap <= vGap) {
      return gapRight >= 0
        ? { fromSide: "right", toSide: "left"  }
        : { fromSide: "left",  toSide: "right" };
    }
    return gapBottom >= 0
      ? { fromSide: "bottom", toSide: "top"    }
      : { fromSide: "top",    toSide: "bottom" };
  }

  if (horizSep) {
    return gapRight >= 0
      ? { fromSide: "right", toSide: "left"  }
      : { fromSide: "left",  toSide: "right" };
  }

  if (vertSep) {
    return gapBottom >= 0
      ? { fromSide: "bottom", toSide: "top"    }
      : { fromSide: "top",    toSide: "bottom" };
  }

  // Overlap on both axes → fall back to dominant center-to-center axis.
  const dx = (to.x + to.w / 2) - (from.x + from.w / 2);
  const dy = (to.y + to.h / 2) - (from.y + from.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { fromSide: "right", toSide: "left" } : { fromSide: "left", toSide: "right" };
  }
  return dy >= 0 ? { fromSide: "bottom", toSide: "top" } : { fromSide: "top", toSide: "bottom" };
}

function anchorOnSide(
  b: { x: number; y: number; w: number; h: number },
  side: ArrowSide,
  alignX: number,
  alignY: number,
): ArrowAnchor {
  // Inset keeps the anchor away from rounded corners. Shrink for tiny edges.
  const insetX = Math.min(20, b.w / 2 - 1);
  const insetY = Math.min(20, b.h / 2 - 1);
  const clampX = Math.max(b.x + insetX, Math.min(alignX, b.x + b.w - insetX));
  const clampY = Math.max(b.y + insetY, Math.min(alignY, b.y + b.h - insetY));
  switch (side) {
    case "right":  return { x: b.x + b.w,  y: clampY,      dirX:  1, dirY:  0 };
    case "left":   return { x: b.x,        y: clampY,      dirX: -1, dirY:  0 };
    case "bottom": return { x: clampX,     y: b.y + b.h,   dirX:  0, dirY:  1 };
    case "top":    return { x: clampX,     y: b.y,         dirX:  0, dirY: -1 };
  }
}

function FlowArrows({ connections, elements, canvasScale, selectedGroupIds }: FlowArrowsProps) {
  const edges = connections.map((conn) => {
    // Pass canvasScale so bounds match the counter-scaled visual positions
    const from = computeGroupBounds(conn.fromModuleId, elements, canvasScale);
    const to   = computeGroupBounds(conn.toModuleId,   elements, canvasScale);
    if (!from || !to) return null;

    const isHighlighted = selectedGroupIds.includes(conn.fromModuleId) || selectedGroupIds.includes(conn.toModuleId);

    const { fromSide, toSide } = pickSides(from, to);

    // Align each anchor to the *other* endpoint's center (clamped to the edge
    // range). This avoids the "diagonal across two tall boxes" look that
    // happens when each anchor uses its own box center.
    const toCX   = to.x   + to.w   / 2;
    const toCY   = to.y   + to.h   / 2;
    const fromCX = from.x + from.w / 2;
    const fromCY = from.y + from.h / 2;

    const a = anchorOnSide(from, fromSide, toCX,   toCY);
    const b = anchorOnSide(to,   toSide,   fromCX, fromCY);

    // Cubic bezier with perpendicular tangents at each anchor. This single
    // shape covers all the cases naturally:
    //  - near-straight when anchors are colinear,
    //  - smooth curve when slightly offset,
    //  - S-shape when sides face the same direction with vertical/horizontal offset,
    //  - 90°-feeling sweep when the chosen sides are perpendicular.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Tangent length: prefer the projection of the connector along each anchor's
    // exit direction so colinear anchors get small tangents (≈ straight) and
    // perpendicular anchors get tangents proportional to the perpendicular leg.
    const aProj = Math.abs(a.dirX * dx + a.dirY * dy);
    const bProj = Math.abs(b.dirX * dx + b.dirY * dy);
    const dist  = Math.hypot(dx, dy);
    const tangent = (proj: number) => Math.max(24, Math.min(160, proj * 0.5 + dist * 0.15));
    const aT = tangent(aProj);
    const bT = tangent(bProj);

    const c1x = a.x + a.dirX * aT;
    const c1y = a.y + a.dirY * aT;
    const c2x = b.x + b.dirX * bT;
    const c2y = b.y + b.dirY * bT;

    return {
      id: conn.id,
      x1: a.x, y1: a.y,
      x2: b.x, y2: b.y,
      c1x, c1y, c2x, c2y,
      highlighted: isHighlighted,
    };
  }).filter(Boolean) as {
    id: string; x1: number; y1: number; x2: number; y2: number;
    c1x: number; c1y: number; c2x: number; c2y: number;
    highlighted: boolean;
  }[];

  if (edges.length === 0) return null;

  // SVG viewport covers all edge endpoints + control points with padding
  const pad = 200;
  const allX = edges.flatMap((e) => [e.x1, e.x2, e.c1x, e.c2x]);
  const allY = edges.flatMap((e) => [e.y1, e.y2, e.c1y, e.c2y]);
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
        <marker id="fa-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 2 L 9 5 L 0 8 z" fill="rgba(124,58,237,0.45)" />
        </marker>
        <marker id="fa-arrow-hi" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 2 L 9 5 L 0 8 z" fill="rgba(124,58,237,0.85)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const sx = e.x1 - minX,  sy = e.y1 - minY;
        const ex = e.x2 - minX,  ey = e.y2 - minY;
        const c1x = e.c1x - minX, c1y = e.c1y - minY;
        const c2x = e.c2x - minX, c2y = e.c2y - minY;
        // Cubic bezier: M start C ctrl1, ctrl2, end
        const path = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
        const stroke = e.highlighted ? "rgba(124,58,237,0.6)" : "rgba(124,58,237,0.18)";
        const marker = e.highlighted ? "url(#fa-arrow-hi)" : "url(#fa-arrow)";
        return (
          <path
            key={e.id}
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            markerEnd={marker}
          />
        );
      })}
    </svg>
  );
}
