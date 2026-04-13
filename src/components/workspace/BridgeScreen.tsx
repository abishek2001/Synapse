"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export type StageStatus = "waiting" | "active" | "done";

export interface BridgeStage {
  id: string;
  label: string;
  detail: string;
  status: StageStatus;
  icon: React.ReactNode;
}

export interface BridgeLog {
  id: string;
  text: string;
  type: "info" | "success" | "data";
  timestamp: number;
}

interface BridgeScreenProps {
  query: string;
  persona: string;
  stages: BridgeStage[];
  logs: BridgeLog[];
  contextCard: {
    title: string;
    description: string;
    tags: { label: string; color: string }[];
    status: string;
  };
  latencyMs: number | null;
  fileNames: string[];
}

// Whiteboard "group" shapes that animate drawing in
const GROUPS = [
  { x: 80,  y: 120, w: 220, h: 140, title: "Introduction",     delay: 0.0 },
  { x: 380, y: 80,  w: 240, h: 120, title: "Core Concepts",    delay: 0.7 },
  { x: 700, y: 110, w: 200, h: 150, title: "Deep Dive",        delay: 1.4 },
  { x: 160, y: 330, w: 260, h: 130, title: "Examples",         delay: 2.1 },
  { x: 520, y: 310, w: 220, h: 160, title: "Applications",     delay: 2.8 },
];

const ARROWS = [
  { from: 0, to: 1, delay: 1.2 },
  { from: 1, to: 2, delay: 1.9 },
  { from: 0, to: 3, delay: 2.6 },
  { from: 2, to: 4, delay: 3.3 },
];

function getRectPerimeter(w: number, h: number) {
  return 2 * (w + h);
}

function getCenterX(g: typeof GROUPS[0]) { return g.x + g.w / 2; }
function getCenterY(g: typeof GROUPS[0]) { return g.y + g.h / 2; }

// Compute a curved arrow path between two group rects
function arrowPath(from: typeof GROUPS[0], to: typeof GROUPS[0]) {
  const sx = getCenterX(from), sy = from.y + from.h; // bottom center of from
  const ex = getCenterX(to),   ey = to.y;             // top center of to
  const midY = (sy + ey) / 2;
  return `M ${sx} ${sy} C ${sx} ${midY}, ${ex} ${midY}, ${ex} ${ey}`;
}

function ArrowDef() {
  return (
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="rgba(124,58,237,0.45)" />
      </marker>
    </defs>
  );
}

// Content-line "skeleton" inside each group box
function ContentLines({ groupX, groupY, groupW, delay }: { groupX: number; groupY: number; groupW: number; delay: number }) {
  const lines = [
    { y: 52, w: groupW * 0.75 },
    { y: 68, w: groupW * 0.55 },
    { y: 84, w: groupW * 0.65 },
    { y: 100, w: groupW * 0.45 },
  ];
  return (
    <>
      {lines.map((l, i) => (
        <motion.rect
          key={i}
          x={groupX + 16}
          y={groupY + l.y}
          width={l.w}
          height={4}
          rx={2}
          fill="rgba(124,58,237,0.10)"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          style={{ originX: `${groupX + 16}px`, transformBox: "fill-box" }}
          transition={{ delay: delay + 0.55 + i * 0.08, duration: 0.35, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

export default function BridgeScreen({
  query,
  stages,
}: BridgeScreenProps) {
  const doneCount = stages.filter((s) => s.status === "done").length;
  const activeStage = stages.find((s) => s.status === "active");
  const pct = Math.round(((doneCount + (activeStage ? 0.5 : 0)) / Math.max(stages.length, 1)) * 100);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 600);
    return () => clearInterval(id);
  }, []);
  const dots = ".".repeat((tick % 3) + 1).padEnd(3, " ");

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-[#fafafa] flex flex-col items-center justify-center overflow-hidden"
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.5 }}
    >
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(124,58,237,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Whiteboard canvas animation */}
      <div className="relative w-full max-w-[980px] h-[520px] mx-auto">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 980 520"
          preserveAspectRatio="xMidYMid meet"
          style={{ overflow: "visible" }}
        >
          <ArrowDef />

          {/* Curved connection arrows */}
          {ARROWS.map((arrow, i) => {
            const from = GROUPS[arrow.from], to = GROUPS[arrow.to];
            const d = arrowPath(from, to);
            // Rough path length estimate
            const pathLen = 160;
            return (
              <motion.path
                key={i}
                d={d}
                fill="none"
                stroke="rgba(124,58,237,0.35)"
                strokeWidth={1.5}
                strokeDasharray={pathLen}
                initial={{ strokeDashoffset: pathLen }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ delay: arrow.delay, duration: 0.55, ease: "easeInOut" }}
                markerEnd="url(#arrow)"
              />
            );
          })}

          {/* Group boxes */}
          {GROUPS.map((g, i) => {
            const perim = getRectPerimeter(g.w, g.h);
            return (
              <g key={i}>
                {/* Box outline draws in */}
                <motion.rect
                  x={g.x}
                  y={g.y}
                  width={g.w}
                  height={g.h}
                  rx={12}
                  fill="rgba(124,58,237,0.025)"
                  stroke="rgba(124,58,237,0.30)"
                  strokeWidth={1.5}
                  strokeDasharray={perim}
                  initial={{ strokeDashoffset: perim, opacity: 0 }}
                  animate={{ strokeDashoffset: 0, opacity: 1 }}
                  transition={{ delay: g.delay, duration: 0.7, ease: "easeInOut" }}
                />

                {/* Title bar */}
                <motion.rect
                  x={g.x}
                  y={g.y}
                  width={g.w}
                  height={32}
                  rx={12}
                  fill="rgba(124,58,237,0.06)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: g.delay + 0.4, duration: 0.3 }}
                />
                {/* Bottom of title bar (covers bottom radius) */}
                <motion.rect
                  x={g.x}
                  y={g.y + 20}
                  width={g.w}
                  height={12}
                  fill="rgba(124,58,237,0.06)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: g.delay + 0.4, duration: 0.3 }}
                />

                {/* Title text */}
                <motion.text
                  x={g.x + 12}
                  y={g.y + 20}
                  fontSize={11}
                  fontWeight={600}
                  fill="rgba(124,58,237,0.65)"
                  fontFamily="Inter, system-ui, sans-serif"
                  letterSpacing={0.3}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: g.delay + 0.45, duration: 0.3 }}
                >
                  {g.title}
                </motion.text>

                {/* Content skeleton lines */}
                <ContentLines groupX={g.x} groupY={g.y} groupW={g.w} delay={g.delay} />
              </g>
            );
          })}

          {/* Floating "cursor" — a small pen that moves around */}
          <motion.circle
            r={4}
            fill="#7c3aed"
            opacity={0.6}
            animate={{
              cx: [180, 500, 800, 290, 630],
              cy: [190, 140, 185, 395, 390],
            }}
            transition={{
              duration: 5,
              times: [0, 0.2, 0.45, 0.65, 0.9],
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
        </svg>
      </div>

      {/* Bottom status strip */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      >
        {/* Progress bar */}
        <div className="w-48 h-[2px] rounded-full bg-black/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-violet-500"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex gap-[4px]">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full bg-violet-400"
                animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.2, 0.8] }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.18,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
          <span className="text-[12px] text-black/40 font-medium">
            {activeStage ? activeStage.label : "Building your workspace"}
            <span className="font-mono">{dots}</span>
          </span>
        </div>

        {query && (
          <AnimatePresence>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-[11px] text-black/25 max-w-[300px] text-center truncate"
            >
              {query}
            </motion.p>
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}

import { BookOpen, Cpu, Box, Sparkles } from "lucide-react";

export function buildStages(hasFiles: boolean): BridgeStage[] {
  const stages: BridgeStage[] = [];
  if (hasFiles) {
    stages.push({ id: "source", label: "Source Grounding", detail: "Queued", status: "waiting", icon: <BookOpen className="w-4 h-4" /> });
  }
  stages.push({ id: "tutor",    label: "Tutor Intelligence",  detail: "Queued", status: "waiting", icon: <Cpu className="w-4 h-4" /> });
  stages.push({ id: "canvas",   label: "Visual Architecture", detail: "Queued", status: "waiting", icon: <Sparkles className="w-4 h-4" /> });
  stages.push({ id: "simulation", label: "Simulation Engines", detail: "Queued", status: "waiting", icon: <Box className="w-4 h-4" /> });
  return stages;
}
