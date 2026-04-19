"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, Loader2, X, HelpCircle } from "lucide-react";
import {
  HandStateMachine,
  combineHands,
  type HandFrame,
  type Gesture,
} from "@/lib/hand-tracking/gestures";

// ── Public event API ────────────────────────────────────────────────────────

export type HandGestureEvent =
  /** Pointer position update — fires every frame a hand is visible. */
  | { type: "cursor"; screenX: number; screenY: number; gesture: Gesture }
  /** Pinch began — like a mouse-down. */
  | { type: "grab_start"; screenX: number; screenY: number }
  /** Pinch held + moving. `dx/dy` are screen-pixel deltas since the last frame. */
  | { type: "grab_move"; screenX: number; screenY: number; dx: number; dy: number }
  /** Pinch released. `wasClick` true if the pinch was short and didn't move. */
  | { type: "grab_end"; screenX: number; screenY: number; wasClick: boolean }
  /** Fist drag — pan canvas. `dx/dy` are screen-pixel deltas. */
  | { type: "pan"; dx: number; dy: number }
  /** Two-finger zoom (peace sign vertical motion or two-hand pinch).
   *  `factor` is the multiplicative scale change since the last event.
   *  `cx,cy` is the screen-space pivot (cursor for peace, midpoint for two-hand). */
  | { type: "zoom"; factor: number; cx: number; cy: number; dx?: number; dy?: number };

interface Props {
  enabled: boolean;
  onGesture: (event: HandGestureEvent) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  darkMode?: boolean;
}

type LoadState = "idle" | "loading" | "ready" | "error";

const SKELETON_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// One-Euro filter would be ideal, but a tuned exponential moving average is
// good enough for a webcam at 30fps and far simpler to maintain. Smaller =
// smoother (laggier); larger = snappier (jitterier).
const CURSOR_SMOOTHING = 0.55;

/** Pixel movement threshold under which a pinch counts as a "click" (not a drag). */
const CLICK_MOVE_PX = 14;
/** Maximum hold duration that still counts as a click. */
const CLICK_MAX_MS  = 380;

/** Sensitivity for peace-sign vertical zoom — pixels of vertical hand motion
 *  per 1× zoom factor. Higher = need to move further to zoom the same amount. */
const PEACE_ZOOM_PX_PER_FACTOR = 240;

export default function HandTrackingOverlay({ enabled, onGesture, containerRef, darkMode = false }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handLandmarkerRef = useRef<any>(null);
  const animFrameRef      = useRef<number>(0);
  const streamRef         = useRef<MediaStream | null>(null);
  const onGestureRef      = useRef(onGesture);
  useEffect(() => { onGestureRef.current = onGesture; }, [onGesture]);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [currentGesture, setCurrentGesture] = useState<Gesture>("none");
  const [showHelp, setShowHelp] = useState(false);
  const [twoHands, setTwoHands] = useState(false);

  // Voice "help" / "show gestures" toggles the cheatsheet from anywhere.
  useEffect(() => {
    const toggle = () => setShowHelp((h) => !h);
    window.addEventListener("synapse:show_help", toggle);
    return () => window.removeEventListener("synapse:show_help", toggle);
  }, []);

  // ── Persistent state across frames (refs to avoid re-renders) ─────────────
  const machineLeft  = useRef(new HandStateMachine());
  const machineRight = useRef(new HandStateMachine());
  const smoothPos    = useRef({ x: 0, y: 0, init: false });
  const lastPos      = useRef({ x: 0, y: 0 });

  // Pinch / drag state
  const grabStateRef = useRef<{
    active: boolean;
    startX: number; startY: number;
    startTime: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, startTime: 0, moved: false });

  // Peace-sign zoom anchor
  const peaceStateRef = useRef<{ active: boolean; startY: number; lastY: number }>(
    { active: false, startY: 0, lastY: 0 },
  );

  // Two-hand pinch zoom state
  const twoHandStateRef = useRef<{ active: boolean; spread: number; midX: number; midY: number }>(
    { active: false, spread: 0, midX: 0, midY: 0 },
  );

  // ── MediaPipe init ────────────────────────────────────────────────────────
  const initMediaPipe = useCallback(async () => {
    setLoadState("loading");
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const { HandLandmarker, FilesetResolver } = vision;

      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
      );

      const landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handLandmarkerRef.current = landmarker as any;
      setLoadState("ready");
    } catch (err) {
      console.error("MediaPipe init failed:", err);
      setLoadState("error");
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // Mirror the same stream into the visible preview so we don't grab the
      // camera twice (some browsers block the second getUserMedia).
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setLoadState("error");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
  }, []);

  // ── Skeleton drawing (debug preview) ──────────────────────────────────────
  const drawSkeleton = useCallback(
    (
      hands: { x: number; y: number; z: number }[][],
      hands_gestures: Gesture[],
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
    ) => {
      ctx.clearRect(0, 0, w, h);
      hands.forEach((landmarks, idx) => {
        const g = hands_gestures[idx] ?? "none";
        const accent =
          g === "pinch"     ? "rgba(244,63,94,0.95)"
        : g === "fist"      ? "rgba(245,158,11,0.95)"
        : g === "peace"     ? "rgba(34,197,94,0.95)"
        : g === "openPalm"  ? "rgba(96,165,250,0.85)"
        : g === "point"     ? "rgba(99,102,241,0.95)"
        :                     "rgba(148,163,184,0.6)";

        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        for (const [a, b] of SKELETON_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
          ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
          ctx.stroke();
        }
        ctx.fillStyle = accent;
        for (const lm of landmarks) {
          ctx.beginPath();
          ctx.arc(lm.x * w, lm.y * h, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    [],
  );

  // ── Per-frame processing ──────────────────────────────────────────────────
  const processFrame = useCallback(() => {
    const video      = videoRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const landmarker = handLandmarkerRef.current as any;
    const canvas     = canvasRef.current;
    const container  = containerRef.current;

    if (!video || !landmarker || !canvas || !container || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const result = landmarker.detectForVideo(video, performance.now());
    const cw = canvas.width;
    const ch = canvas.height;

    const hands: { x: number; y: number; z: number }[][] = result.landmarks ?? [];
    // MediaPipe returns handedness mirrored relative to the displayed mirrored
    // preview; we don't actually care which is left/right, only that we have
    // up to two hands. We pick whichever order MediaPipe returns.
    const leftLm  = hands[0] ?? null;
    const rightLm = hands[1] ?? null;

    const left  = machineLeft.current.step(leftLm);
    const right = machineRight.current.step(rightLm);
    const both  = combineHands(left, right);

    const handsGestures: Gesture[] = [left.gesture, right.gesture];
    drawSkeleton(hands, handsGestures, ctx, cw, ch);

    const noHand = !left.visible && !right.visible;
    if (noHand) {
      // Cleanly end any in-flight gesture session
      endGrabIfActive(0, 0);
      endPeaceIfActive();
      endTwoHandIfActive();
      lastFistPosRef.current = null;
      setCursorPos(null);
      setCurrentGesture("none");
      setTwoHands(false);
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // Pick the "primary" hand for single-handed gestures: prefer the one
    // doing something (pinch > fist > peace > openPalm > point > none),
    // else the first visible.
    const score = (g: Gesture) =>
      g === "pinch" ? 5 : g === "fist" ? 4 : g === "peace" ? 3 : g === "openPalm" ? 2 : g === "point" ? 1 : 0;
    const primary = score(left.gesture) >= score(right.gesture) ? left : right;
    setCurrentGesture(primary.gesture);
    setTwoHands(left.visible && right.visible);

    // ── Cursor (always tracked) ─────────────────────────────────────────────
    const containerRect = container.getBoundingClientRect();
    // Camera is mirrored — flip X.
    const rawX = (1 - primary.cursor.x) * containerRect.width;
    const rawY = primary.cursor.y * containerRect.height;

    if (!smoothPos.current.init) {
      smoothPos.current.x = rawX;
      smoothPos.current.y = rawY;
      smoothPos.current.init = true;
    } else {
      smoothPos.current.x += (rawX - smoothPos.current.x) * CURSOR_SMOOTHING;
      smoothPos.current.y += (rawY - smoothPos.current.y) * CURSOR_SMOOTHING;
    }
    const sx = smoothPos.current.x;
    const sy = smoothPos.current.y;
    const screenX = containerRect.left + sx;
    const screenY = containerRect.top + sy;
    const dx = sx - lastPos.current.x;
    const dy = sy - lastPos.current.y;
    lastPos.current = { x: sx, y: sy };
    setCursorPos({ x: sx, y: sy });

    onGestureRef.current({ type: "cursor", screenX, screenY, gesture: primary.gesture });

    // ── Two-hand pinch zoom takes precedence ────────────────────────────────
    if (both?.bothPinching) {
      // First frame of the gesture
      if (!twoHandStateRef.current.active) {
        // Cancel any single-hand pinch session that may have started a frame
        // earlier.
        endGrabIfActive(screenX, screenY);
        endPeaceIfActive();
        twoHandStateRef.current = {
          active: true,
          spread: both.spread,
          midX: (1 - both.mid.x) * containerRect.width + containerRect.left,
          midY: both.mid.y * containerRect.height + containerRect.top,
        };
      } else {
        const newMidX = (1 - both.mid.x) * containerRect.width + containerRect.left;
        const newMidY = both.mid.y * containerRect.height + containerRect.top;
        const factor = both.spread / Math.max(twoHandStateRef.current.spread, 1e-6);
        const midDx = newMidX - twoHandStateRef.current.midX;
        const midDy = newMidY - twoHandStateRef.current.midY;
        if (Math.abs(factor - 1) > 0.005 || Math.abs(midDx) > 0.5 || Math.abs(midDy) > 0.5) {
          onGestureRef.current({
            type: "zoom",
            factor,
            cx: newMidX,
            cy: newMidY,
            dx: midDx,
            dy: midDy,
          });
        }
        twoHandStateRef.current.spread = both.spread;
        twoHandStateRef.current.midX = newMidX;
        twoHandStateRef.current.midY = newMidY;
      }
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    if (twoHandStateRef.current.active) endTwoHandIfActive();

    // ── Single-hand mode dispatch ────────────────────────────────────────────
    switch (primary.gesture) {
      case "pinch": {
        endPeaceIfActive();
        lastFistPosRef.current = null;
        const g = grabStateRef.current;
        if (!g.active) {
          g.active = true;
          g.startX = screenX;
          g.startY = screenY;
          g.startTime = performance.now();
          g.moved = false;
          onGestureRef.current({ type: "grab_start", screenX, screenY });
        } else {
          if (Math.abs(screenX - g.startX) > CLICK_MOVE_PX || Math.abs(screenY - g.startY) > CLICK_MOVE_PX) {
            g.moved = true;
          }
          onGestureRef.current({ type: "grab_move", screenX, screenY, dx, dy });
        }
        break;
      }

      case "fist": {
        endGrabIfActive(screenX, screenY);
        endPeaceIfActive();
        // Fist drag → pan. Use deltas relative to the last fist position so a
        // rest-fist (still hand) doesn't keep emitting pan with last `dx/dy`.
        if (lastFistPosRef.current) {
          const fdx = sx - lastFistPosRef.current.x;
          const fdy = sy - lastFistPosRef.current.y;
          if (Math.abs(fdx) > 0.3 || Math.abs(fdy) > 0.3) {
            onGestureRef.current({ type: "pan", dx: fdx, dy: fdy });
          }
        }
        lastFistPosRef.current = { x: sx, y: sy };
        break;
      }

      case "peace": {
        endGrabIfActive(screenX, screenY);
        lastFistPosRef.current = null;
        const ps = peaceStateRef.current;
        if (!ps.active) {
          ps.active = true;
          ps.startY = sy;
          ps.lastY = sy;
        } else {
          const delta = ps.lastY - sy; // up = positive = zoom in
          if (Math.abs(delta) > 0.3) {
            const factor = Math.exp(delta / PEACE_ZOOM_PX_PER_FACTOR);
            onGestureRef.current({ type: "zoom", factor, cx: screenX, cy: screenY });
            ps.lastY = sy;
          }
        }
        break;
      }

      // Cursor-only modes — close any in-flight gesture session
      case "openPalm":
      case "point":
      case "none":
      default:
        endGrabIfActive(screenX, screenY);
        endPeaceIfActive();
        lastFistPosRef.current = null;
        break;
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, drawSkeleton]);

  // Helpers used by processFrame ------------------------------------------------
  const lastFistPosRef = useRef<{ x: number; y: number } | null>(null);

  const endGrabIfActive = (screenX: number, screenY: number) => {
    const g = grabStateRef.current;
    if (!g.active) return;
    const heldMs = performance.now() - g.startTime;
    const wasClick = !g.moved && heldMs < CLICK_MAX_MS;
    onGestureRef.current({ type: "grab_end", screenX, screenY, wasClick });
    g.active = false;
    g.moved = false;
  };
  const endPeaceIfActive = () => {
    if (peaceStateRef.current.active) peaceStateRef.current = { active: false, startY: 0, lastY: 0 };
  };
  const endTwoHandIfActive = () => {
    if (twoHandStateRef.current.active) {
      twoHandStateRef.current = { active: false, spread: 0, midX: 0, midY: 0 };
    }
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(animFrameRef.current);
      stopCamera();
      machineLeft.current.reset();
      machineRight.current.reset();
      smoothPos.current = { x: 0, y: 0, init: false };
      grabStateRef.current = { active: false, startX: 0, startY: 0, startTime: 0, moved: false };
      peaceStateRef.current = { active: false, startY: 0, lastY: 0 };
      twoHandStateRef.current = { active: false, spread: 0, midX: 0, midY: 0 };
      lastFistPosRef.current = null;
      setCursorPos(null);
      setCurrentGesture("none");
      setTwoHands(false);
      setLoadState("idle");
      return;
    }

    let cancelled = false;
    (async () => {
      await initMediaPipe();
      if (cancelled) return;
      await startCamera();
      if (cancelled) return;
      animFrameRef.current = requestAnimationFrame(processFrame);
      // Auto-show help on first enable for ~5s, then collapse.
      setShowHelp(true);
      setTimeout(() => setShowHelp(false), 5500);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      stopCamera();
    };
  }, [enabled, initMediaPipe, startCamera, stopCamera, processFrame]);

  if (!enabled) return null;

  // ── Visual config ─────────────────────────────────────────────────────────
  const gestureLabel: Record<Gesture, string> = {
    pinch:    "Grab / Click",
    fist:     "Pan canvas",
    peace:    "Zoom (move ↑↓)",
    openPalm: "Idle",
    point:    "Pointing",
    none:     "No hand",
  };

  const gestureColor: Record<Gesture, string> = {
    pinch:    "#f43f5e",
    fist:     "#f59e0b",
    peace:    "#22c55e",
    openPalm: "#60a5fa",
    point:    "#6366f1",
    none:     "#94a3b8",
  };

  return (
    <>
      {/* Hidden video — feeds MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* ── Webcam preview + skeleton overlay (top-right) ─────────────────── */}
      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="fixed top-20 right-4 z-[60] rounded-2xl overflow-hidden shadow-2xl bg-black/90"
            style={{
              width: 220,
              height: 165,
              border: `1px solid ${gestureColor[currentGesture]}55`,
              boxShadow: `0 0 24px ${gestureColor[currentGesture]}22, 0 8px 32px rgba(0,0,0,0.25)`,
            }}
          >
            {/* Mirrored video feed — same MediaStream as the hidden one */}
            <video
              ref={previewVideoRef}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
              playsInline
              muted
              autoPlay
            />

            {/* Skeleton canvas — also mirrored so it overlays correctly */}
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="absolute inset-0 w-full h-full"
              style={{ transform: "scaleX(-1)" }}
            />

            {/* Loading / error overlays */}
            {loadState === "loading" && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1.5">
                <Loader2 className="w-5 h-5 text-white/70 animate-spin" />
                <span className="text-[10px] text-white/60">Loading model…</span>
              </div>
            )}
            {loadState === "error" && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-1 px-3 text-center">
                <CameraOff className="w-5 h-5 text-rose-400" />
                <span className="text-[10px] text-white/70">Camera blocked</span>
              </div>
            )}

            {/* Gesture badge */}
            <div
              className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-semibold text-white tracking-wide flex items-center gap-1.5 backdrop-blur-md"
              style={{ backgroundColor: `${gestureColor[currentGesture]}cc` }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "white", boxShadow: "0 0 6px white" }}
              />
              {gestureLabel[currentGesture]}
              {twoHands && currentGesture !== "none" && (
                <span className="ml-0.5 opacity-75">· 2H</span>
              )}
            </div>

            {/* Camera badge + help toggle */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
              <button
                onClick={() => setShowHelp((h) => !h)}
                className="w-5 h-5 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
                title="Show gesture cheatsheet"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
              <Camera className="w-3 h-3 text-white/40" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cheatsheet popover ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: 8 }}
            className="fixed top-20 right-[244px] z-[60] rounded-2xl shadow-2xl px-3.5 py-3 backdrop-blur-xl"
            style={{
              width: 240,
              backgroundColor: darkMode ? "rgba(20,20,30,0.92)" : "rgba(255,255,255,0.97)",
              border: `1px solid ${darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
              color: darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold tracking-wide uppercase opacity-60">
                Gesture cheatsheet
              </span>
              <button
                onClick={() => setShowHelp(false)}
                className="opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-col gap-1.5 text-[11px]">
              <CheatRow color="#6366f1" label="Point" desc="Move cursor" />
              <CheatRow color="#f43f5e" label="Pinch" desc="Click / drag elements" />
              <CheatRow color="#f59e0b" label="Fist"  desc="Pan the canvas" />
              <CheatRow color="#22c55e" label="Peace ✌"  desc="Zoom (move hand ↑↓)" />
              <CheatRow color="#60a5fa" label="Open palm" desc="Idle / cursor only" />
              <CheatRow color="#a78bfa" label="Two hands pinch" desc="Pinch to zoom + pan" />
            </div>
            <div className="mt-2.5 pt-2 border-t text-[10px] opacity-60 leading-snug"
              style={{ borderColor: darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
              Quick pinch = click. Hold + move = drag. Voice handles questions.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── On-canvas cursor ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {cursorPos && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: cursorPos.x - 18,
              y: cursorPos.y - 18,
            }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", damping: 32, stiffness: 380, mass: 0.4 }}
            className="absolute z-[55] pointer-events-none"
            style={{ top: 0, left: 0 }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                border: `2px solid ${gestureColor[currentGesture]}`,
                backgroundColor: currentGesture === "pinch" ? `${gestureColor[currentGesture]}33` : `${gestureColor[currentGesture]}10`,
                boxShadow: `0 0 ${currentGesture === "pinch" ? 24 : 12}px ${gestureColor[currentGesture]}55, 0 0 0 1px ${gestureColor[currentGesture]}22 inset`,
                transition: "background-color 120ms, box-shadow 120ms",
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: currentGesture === "pinch" ? 10 : 6,
                  height: currentGesture === "pinch" ? 10 : 6,
                  backgroundColor: gestureColor[currentGesture],
                  transition: "all 120ms",
                  boxShadow: `0 0 6px ${gestureColor[currentGesture]}`,
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CheatRow({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
      />
      <span className="font-medium" style={{ minWidth: 76 }}>{label}</span>
      <span className="opacity-70">{desc}</span>
    </div>
  );
}
