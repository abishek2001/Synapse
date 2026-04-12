"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { detectGesture, resetGestureState, type GestureResult } from "@/lib/hand-tracking/gestures";

export interface HandGestureEvent {
  type: "move" | "pinch_start" | "pinch_move" | "pinch_end" | "highlight_start" | "highlight_move" | "highlight_end" | "pan";
  screenX: number;
  screenY: number;
  deltaX?: number;
  deltaY?: number;
}

interface Props {
  enabled: boolean;
  onGesture: (event: HandGestureEvent) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
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

const CURSOR_SMOOTHING = 0.35;

export default function HandTrackingOverlay({ enabled, onGesture, containerRef }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handLandmarkerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [currentGesture, setCurrentGesture] = useState<string>("none");

  const smoothPos = useRef({ x: 0, y: 0 });
  const wasPinching = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const initMediaPipe = useCallback(async () => {
    setLoadState("loading");
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const { HandLandmarker, FilesetResolver } = vision;

      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const drawSkeleton = useCallback(
    (landmarks: { x: number; y: number; z: number }[], ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(99, 102, 241, 0.5)";
      ctx.lineWidth = 2;
      for (const [a, b] of SKELETON_CONNECTIONS) {
        const pA = landmarks[a];
        const pB = landmarks[b];
        ctx.beginPath();
        ctx.moveTo(pA.x * w, pA.y * h);
        ctx.lineTo(pB.x * w, pB.y * h);
        ctx.stroke();
      }

      for (const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 3, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(129, 140, 248, 0.8)";
        ctx.fill();
      }
    },
    [],
  );

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const landmarker = handLandmarkerRef.current as any;
    const canvas = canvasRef.current;
    const container = containerRef.current;

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

    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      drawSkeleton(landmarks, ctx, cw, ch);

      const gesture: GestureResult = detectGesture(landmarks);
      setCurrentGesture(gesture.gesture);

      const containerRect = container.getBoundingClientRect();

      // Mirror X (webcam is mirrored), map normalized coords to container
      const rawX = (1 - gesture.cursor.x) * containerRect.width;
      const rawY = gesture.cursor.y * containerRect.height;

      // Smooth cursor
      smoothPos.current.x += (rawX - smoothPos.current.x) * CURSOR_SMOOTHING;
      smoothPos.current.y += (rawY - smoothPos.current.y) * CURSOR_SMOOTHING;

      const sx = smoothPos.current.x;
      const sy = smoothPos.current.y;

      const screenX = containerRect.left + sx;
      const screenY = containerRect.top + sy;

      setCursorPos({ x: sx, y: sy });

      const dx = sx - lastPos.current.x;
      const dy = sy - lastPos.current.y;
      lastPos.current = { x: sx, y: sy };

      switch (gesture.gesture) {
        case "pinch":
          if (!wasPinching.current) {
            wasPinching.current = true;
            onGesture({ type: "pinch_start", screenX, screenY });
          } else {
            onGesture({ type: "pinch_move", screenX, screenY, deltaX: dx, deltaY: dy });
          }
          break;

        case "open":
          if (wasPinching.current) {
            wasPinching.current = false;
            onGesture({ type: "pinch_end", screenX, screenY });
          } else {
            onGesture({ type: "pan", screenX, screenY, deltaX: dx, deltaY: dy });
          }
          break;

        case "point":
          if (wasPinching.current) {
            wasPinching.current = false;
            onGesture({ type: "pinch_end", screenX, screenY });
          }
          onGesture({ type: "move", screenX, screenY });
          break;

        default:
          if (wasPinching.current) {
            wasPinching.current = false;
            onGesture({ type: "pinch_end", screenX, screenY });
          }
      }
    } else {
      ctx.clearRect(0, 0, cw, ch);
      setCursorPos(null);
      setCurrentGesture("none");
      if (wasPinching.current) {
        wasPinching.current = false;
      }
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [containerRef, drawSkeleton, onGesture]);

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(animFrameRef.current);
      stopCamera();
      setCursorPos(null);
      setCurrentGesture("none");
      resetGestureState();
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
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      stopCamera();
    };
  }, [enabled, initMediaPipe, startCamera, stopCamera, processFrame]);

  if (!enabled) return null;

  const gestureLabel: Record<string, string> = {
    pinch: "Grabbing",
    point: "Pointing",
    open: "Pan",
    fist: "Fist",
    none: "No hand",
  };

  const gestureColor: Record<string, string> = {
    pinch: "#ef4444",
    point: "#6366f1",
    open: "#22c55e",
    fist: "#f59e0b",
    none: "#94a3b8",
  };

  return (
    <>
      {/* Hidden video element */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />

      {/* Webcam preview + skeleton overlay (bottom-left, small) */}
      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="fixed bottom-20 left-4 z-[60] rounded-2xl overflow-hidden shadow-xl border border-black/10 bg-black/90"
            style={{ width: 200, height: 150 }}
          >
            {/* Mirrored video feed */}
            <video
              ref={(el) => {
                if (el && videoRef.current) {
                  el.srcObject = videoRef.current.srcObject;
                  el.play().catch(() => {});
                }
              }}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
              playsInline
              muted
              autoPlay
            />

            {/* Skeleton canvas */}
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="absolute inset-0 w-full h-full"
              style={{ transform: "scaleX(-1)" }}
            />

            {/* Loading overlay */}
            {loadState === "loading" && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white/70 animate-spin" />
              </div>
            )}
            {loadState === "error" && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <CameraOff className="w-5 h-5 text-red-400" />
              </div>
            )}

            {/* Gesture badge */}
            <div
              className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-medium text-white/90 backdrop-blur-sm"
              style={{ backgroundColor: `${gestureColor[currentGesture] ?? "#94a3b8"}99` }}
            >
              {gestureLabel[currentGesture] ?? "—"}
            </div>

            {/* Camera icon badge */}
            <div className="absolute top-2 right-2">
              <Camera className="w-3 h-3 text-white/40" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gesture cursor on canvas */}
      <AnimatePresence>
        {cursorPos && (
          <motion.div
            ref={cursorRef}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: cursorPos.x - 16,
              y: cursorPos.y - 16,
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="absolute z-[55] pointer-events-none"
            style={{ top: 0, left: 0 }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors duration-200"
              style={{
                borderColor: gestureColor[currentGesture] ?? "#6366f1",
                backgroundColor: currentGesture === "pinch" ? "rgba(239,68,68,0.15)" : "rgba(99,102,241,0.08)",
                boxShadow: `0 0 ${currentGesture === "pinch" ? 20 : 10}px ${gestureColor[currentGesture] ?? "#6366f1"}40`,
              }}
            >
              <div
                className="w-2 h-2 rounded-full transition-all duration-200"
                style={{
                  backgroundColor: gestureColor[currentGesture] ?? "#6366f1",
                  transform: currentGesture === "pinch" ? "scale(1.5)" : "scale(1)",
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
