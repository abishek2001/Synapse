"use client";

import {
  useCanvasStore,
  ELEM_WIDTHS,
  estimateElemH,
  type ElementType,
  type CanvasElement,
} from "@/store/canvas";
import { useSessionStore } from "@/store/session";
import type { CanvasArtifact } from "@/lib/tools/types";
import type { DemoScript, DemoModule, DemoAnnotation } from "./types";

// ── Timing knobs ──────────────────────────────────────────────────────────
const INTER_ARTIFACT_MIN = 420;     // ms between successive skeletons appearing
const INTER_ARTIFACT_MAX = 780;     // ms (jittered)
const RESOLVE_MIN        = 520;     // ms a skeleton stays visible before resolving
const RESOLVE_MAX        = 950;
const BEFORE_TITLE       = 250;     // ms after first skeleton before tutor title shows
const AFTER_TITLE        = 350;     // ms after title shows before continuing to resolve
const AFTER_GROUP_LAND   = 900;     // ms after addModule fires (lets the auto-zoom settle)
const ANNOTATION_DELAY   = 450;     // ms between sticky drops once group has settled
const TTS_POLL_MS        = 200;     // poll interval while waiting for TTS to finish
const TTS_CAP_MS         = 12000;   // hard cap so a stuck TTS never freezes the demo

const DEFAULT_STICKY_COLOR = "#fff7c2";

function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

function sleep(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (cancelled()) return resolve();
      const left = ms - (Date.now() - start);
      if (left <= 0) return resolve();
      setTimeout(tick, Math.min(60, left));
    };
    tick();
  });
}

/** Wait for `useSessionStore.isSpeaking` to become false (i.e. TTS finished),
 *  capped so the demo never stalls if TTS never starts (mute, no API key, etc.). */
async function awaitTtsOrCap(cancelled: () => boolean): Promise<void> {
  const sess = useSessionStore.getState();
  if (sess.isMuted) return;
  // Give TTS a moment to actually start.
  await sleep(500, cancelled);
  if (cancelled()) return;
  const start = Date.now();
  while (!cancelled() && Date.now() - start < TTS_CAP_MS) {
    if (!useSessionStore.getState().isSpeaking) return;
    await sleep(TTS_POLL_MS, cancelled);
  }
}

/** Mirror of `boundsForGroup` from `useAIChat.ts` — world-space bbox of a group. */
function boundsForGroup(
  groupId: string,
): { x: number; y: number; w: number; h: number } | null {
  const inGroup = useCanvasStore
    .getState()
    .elements.filter((e) => e.groupId === groupId);
  if (inGroup.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of inGroup) {
    const h = el.h ?? estimateElemH(el.type);
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.w);
    maxY = Math.max(maxY, el.y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function formatArtifactType(t: string): string {
  switch (t) {
    case "render3d":   return "3D scene";
    case "simulation": return "simulation";
    case "graph":      return "graph";
    case "notation":   return "notation";
    case "flashcard":  return "flashcard";
    case "diagram":    return "diagram";
    case "lookup":     return "lookup";
    case "visual":     return "visual";
    default:           return t;
  }
}

/** Place a single annotation (sticky / text) relative to a group's bounding
 *  box. Used after each module lands to drop "student-style" notes in the
 *  margins. Falls back to a sane viewport-relative location if the group
 *  isn't found. */
function placeAnnotation(
  ann: DemoAnnotation,
  groupId: string,
  idx: number,
): void {
  const bounds = boundsForGroup(groupId);
  const w = ann.width ?? (ann.kind === "sticky" ? ELEM_WIDTHS.sticky : ELEM_WIDTHS.text);
  const hEst = estimateElemH(ann.kind === "sticky" ? "sticky" : "text");
  const anchor = ann.anchor ?? "right";

  let x = 0;
  let y = 0;
  if (bounds) {
    switch (anchor) {
      case "top-left":     x = bounds.x - w - 40;          y = bounds.y - 20;          break;
      case "top-right":    x = bounds.x + bounds.w + 40;   y = bounds.y - 20;          break;
      case "bottom-left":  x = bounds.x - w - 40;          y = bounds.y + bounds.h - hEst; break;
      case "bottom-right": x = bounds.x + bounds.w + 40;   y = bounds.y + bounds.h - hEst; break;
      case "left":         x = bounds.x - w - 40;          y = bounds.y + bounds.h / 2 - hEst / 2; break;
      case "right":        x = bounds.x + bounds.w + 40;   y = bounds.y + bounds.h / 2 - hEst / 2; break;
      case "above":        x = bounds.x + bounds.w / 2 - w / 2; y = bounds.y - hEst - 32; break;
      case "below":        x = bounds.x + bounds.w / 2 - w / 2; y = bounds.y + bounds.h + 32; break;
    }
    // Stagger multiple annotations on the same anchor so they don't overlap.
    y += idx * (ann.kind === "sticky" ? 30 : 22);
    x += idx * 18;
  } else {
    x = 200 + idx * (w + 24);
    y = 200;
  }
  x += (ann.offsetX ?? 0);
  y += (ann.offsetY ?? 0);

  const elId = `el-demo-ann-${groupId}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
  const allEls = useCanvasStore.getState().elements;
  const base: CanvasElement = {
    id: elId,
    type: ann.kind as ElementType,
    x,
    y,
    w,
    zIndex: allEls.length + 50, // above artifacts so handwritten notes pop
    createdAt: Date.now(),
  };
  if (ann.kind === "sticky") {
    base.sticky = { content: ann.content, color: ann.color ?? DEFAULT_STICKY_COLOR };
  } else {
    base.text = { content: ann.content, style: "body" };
  }
  // Use the user-annotation path so it lands in the undo stack and the eraser
  // can remove it just like a real user-drawn note.
  useCanvasStore.getState().addUserAnnotation(base);
}

export interface PlayModuleHandle {
  /** Cancel the currently-streaming module. */
  abort: () => void;
  /** Resolves with the new group id (or null) once the module fully lands. */
  done: Promise<{ groupId: string | null }>;
}

interface PlayModuleOpts {
  script: DemoScript;
  module: DemoModule;
  moduleIdx: number;
  prevGroupId: string | null;
  /** Whether to seed the user prompt as a transcript message before playing.
   *  True for module 0 (kickoff prompt) and any subsequent module triggered
   *  by the user submitting a queued prompt. */
  seedUserMessage: boolean;
}

/** Stream a single demo module — drives the same store actions `useAIChat`'s
 *  SSE handler drives. Visually indistinguishable from a real AI turn.
 *
 *  Returns a handle so the demo store can abort mid-stream and await the
 *  group landing before queueing the next module's prompt. */
export function playDemoModule(opts: PlayModuleOpts): PlayModuleHandle {
  const { script, module: mod, moduleIdx, prevGroupId, seedUserMessage } = opts;
  const cancelFlag = { value: false };
  const cancelled = () => cancelFlag.value;
  const inFlightElIds = new Set<string>();

  const done = (async (): Promise<{ groupId: string | null }> => {
    const session = useSessionStore.getState();
    session.setLearningMode("guided");
    session.setStreaming(true);

    if (seedUserMessage) {
      // For module 0 the prompt is the script's kickoff. For later modules
      // it's the previous module's `nextPrompt` — already added to messages
      // by the input bar, so we skip in that case (handled by caller).
      if (moduleIdx === 0) {
        session.addMessage({
          id: crypto.randomUUID(),
          role: "user",
          content: script.userPrompt,
          timestamp: Date.now(),
        });
      }
    }

    if (moduleIdx === 0) {
      useCanvasStore.getState().addUpdate({
        id: `upd-demo-start-${Date.now()}`,
        type: "thinking",
        title: "Demo playback started",
        detail: script.title,
        timestamp: Date.now(),
      });
    }

    // ── Phase 1: open the dashed pending boundary ─────────────────────────
    useCanvasStore.getState().startPendingModule();

    const anchorBounds = prevGroupId ? boundsForGroup(prevGroupId) : null;
    const skeletonByArtifactId = new Map<string, string>();
    const pendingPlacementIdx = { count: 0 };

    const placeSkeleton = (artifact: CanvasArtifact) => {
      const w = ELEM_WIDTHS[artifact.type] ?? 360;
      const allEls = useCanvasStore.getState().elements;
      const elId = `el-demo-${script.id}-${moduleIdx}-${pendingPlacementIdx.count}-${Math.random().toString(36).slice(2, 6)}`;
      let x: number;
      let y: number;
      if (anchorBounds) {
        x = anchorBounds.x + pendingPlacementIdx.count * (w + 24);
        y = anchorBounds.y + anchorBounds.h + 140;
      } else {
        const rightEdge = allEls.reduce((max, e) => Math.max(max, e.x + e.w), 80);
        x = rightEdge + 80;
        y = 200;
      }
      pendingPlacementIdx.count += 1;
      const skeleton: CanvasElement = {
        id: elId,
        type: artifact.type as ElementType,
        x,
        y,
        w,
        zIndex: allEls.length + 10,
        createdAt: Date.now(),
      };
      useCanvasStore.getState().addPendingElement(skeleton);
      useCanvasStore.getState().addToPendingModule(elId);
      useCanvasStore.getState().addUpdate({
        id: `upd-demo-pending-${elId}`,
        type: "artifact_generating",
        title: `Generating ${formatArtifactType(artifact.type)}`,
        detail: artifact.title || "preparing artifact…",
        timestamp: Date.now(),
      });
      skeletonByArtifactId.set(artifact.id, elId);
      inFlightElIds.add(elId);
      return elId;
    };

    if (mod.artifacts.length > 0) {
      placeSkeleton(mod.artifacts[0]);
    }

    await sleep(BEFORE_TITLE, cancelled);
    if (cancelled()) return { groupId: null };
    useCanvasStore.getState().setPendingModuleTitle(mod.title);

    session.addMessage({
      id: crypto.randomUUID(),
      role: "tutor",
      content: mod.writtenText,
      spokenText: mod.spokenText,
      timestamp: Date.now(),
    });

    await sleep(AFTER_TITLE, cancelled);
    if (cancelled()) return { groupId: null };

    if (mod.artifacts.length > 0) {
      await sleep(rand(RESOLVE_MIN, RESOLVE_MAX), cancelled);
      if (cancelled()) return { groupId: null };
      const firstArt = mod.artifacts[0];
      const firstId = skeletonByArtifactId.get(firstArt.id);
      if (firstId) {
        useCanvasStore.getState().resolvePendingElement(firstId, firstArt);
        useCanvasStore.getState().addUpdate({
          id: `upd-demo-done-${firstId}`,
          type: "artifact_added",
          title: `Drew ${formatArtifactType(firstArt.type)}`,
          detail: firstArt.title || "added to canvas",
          timestamp: Date.now(),
        });
        import("@/lib/voice/sfx").then((m) => m.playSfx("artifact-added")).catch(() => {});
      }
    }

    for (let aIdx = 1; aIdx < mod.artifacts.length; aIdx++) {
      if (cancelled()) return { groupId: null };
      const art = mod.artifacts[aIdx];
      await sleep(rand(INTER_ARTIFACT_MIN, INTER_ARTIFACT_MAX), cancelled);
      if (cancelled()) return { groupId: null };
      placeSkeleton(art);

      await sleep(rand(RESOLVE_MIN, RESOLVE_MAX), cancelled);
      if (cancelled()) return { groupId: null };
      const elId = skeletonByArtifactId.get(art.id);
      if (elId) {
        useCanvasStore.getState().resolvePendingElement(elId, art);
        useCanvasStore.getState().addUpdate({
          id: `upd-demo-done-${elId}`,
          type: "artifact_added",
          title: `Drew ${formatArtifactType(art.type)}`,
          detail: art.title || "added to canvas",
          timestamp: Date.now(),
        });
        import("@/lib/voice/sfx").then((m) => m.playSfx("artifact-added")).catch(() => {});
      }
    }

    if (cancelled()) return { groupId: null };

    // ── Phase 3: build the real grouped module ──────────────────────────
    const trackedIds = new Set(skeletonByArtifactId.values());
    const freshEls = useCanvasStore
      .getState()
      .elements.filter((e) => trackedIds.has(e.id) && !e.pending && e.artifact);
    const resolvedArtifacts = freshEls.map((e) => e.artifact!);
    for (const el of freshEls) {
      useCanvasStore.getState().removeElement(el.id);
      inFlightElIds.delete(el.id);
    }

    let newGroupId: string | null = null;
    if (resolvedArtifacts.length > 0 || mod.writtenText) {
      newGroupId = useCanvasStore.getState().addModule(
        mod.title,
        resolvedArtifacts,
        undefined,
        mod.writtenText,
        { anchorGroupId: prevGroupId, isTangent: false },
      );
    }
    useCanvasStore.getState().clearPendingModule();
    if (newGroupId) {
      useCanvasStore.getState().setCurrentMain(newGroupId);
    }

    // ── Phase 4: speak + drop annotations while TTS plays ────────────────
    session.setSpeakReady(true);
    await sleep(AFTER_GROUP_LAND, cancelled);
    if (cancelled()) return { groupId: newGroupId };

    if (newGroupId && mod.annotations && mod.annotations.length > 0) {
      // Group annotations by anchor so multi-stickies on the same edge stack
      // instead of overlapping.
      const byAnchor = new Map<string, number>();
      for (const ann of mod.annotations) {
        if (cancelled()) break;
        const key = ann.anchor ?? "right";
        const idx = byAnchor.get(key) ?? 0;
        byAnchor.set(key, idx + 1);
        placeAnnotation(ann, newGroupId, idx);
        await sleep(ANNOTATION_DELAY, cancelled);
      }
    }

    if (mod.sideEffects && typeof window !== "undefined") {
      const fx = mod.sideEffects;
      if (typeof fx.handTracking === "boolean") {
        window.dispatchEvent(
          new CustomEvent("synapse:set_hand_tracking", { detail: fx.handTracking }),
        );
      }
      if (fx.showHelp) {
        window.dispatchEvent(new CustomEvent("synapse:show_help"));
      }
    }

    if (cancelled()) return { groupId: newGroupId };
    await awaitTtsOrCap(cancelled);

    session.setStreaming(false);
    return { groupId: newGroupId };
  })().catch((err) => {
    console.error("[demo playback] module error:", err);
    useCanvasStore.getState().clearPendingModule();
    useSessionStore.getState().setStreaming(false);
    return { groupId: null as string | null };
  }).finally(() => {
    if (cancelled()) {
      for (const elId of inFlightElIds) {
        useCanvasStore.getState().removeElement(elId);
      }
      useCanvasStore.getState().clearPendingModule();
      useSessionStore.getState().setStreaming(false);
    }
  });

  return {
    abort: () => { cancelFlag.value = true; },
    done,
  };
}
