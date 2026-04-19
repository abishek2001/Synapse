"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Circle, ChevronRight, Minus, Maximize2 } from "lucide-react";
import { useGroundingStore } from "@/store/grounding";
import { useSessionStore } from "@/store/session";
import { useUIStore, type ModuleTimelineDock } from "@/store/ui";
import { useEffect, useRef, useState } from "react";
import { useViewport } from "@/hooks/useViewport";

/**
 * Floating timeline of study-plan modules with the current step highlighted.
 *
 * - Defaults to a rounded pill anchored top-center; on hover, expands a proper
 *   rectangular dropdown panel below it (or above it, when docked at the bottom).
 * - Can be minimized to a small circle (just the progress ring).
 * - Position is user-configurable across six anchor positions
 *   (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right).
 */
export default function ModuleTimeline() {
  const studyPlan = useGroundingStore((s) => s.studyPlan);
  const sessionContext = useGroundingStore((s) => s.sessionContext);
  const setPendingVoiceText = useSessionStore((s) => s.setPendingVoiceText);
  const darkMode = useUIStore((s) => s.darkMode);
  const dock = useUIStore((s) => s.moduleTimelineDock);
  const minimized = useUIStore((s) => s.moduleTimelineMinimized);
  const setDock = useUIStore((s) => s.setModuleTimelineDock);
  const setMinimized = useUIStore((s) => s.setModuleTimelineMinimized);

  const [hovered, setHovered] = useState(false);
  const { isCompact } = useViewport();
  const compactInitRef = useRef(false);

  // First time we hit a compact viewport, collapse the timeline to its
  // progress ring so it doesn't dominate the navbar. Users can re-open by
  // clicking; we don't keep forcing it.
  useEffect(() => {
    if (isCompact && !compactInitRef.current && !minimized) {
      compactInitRef.current = true;
      setMinimized(true);
    }
  }, [isCompact, minimized, setMinimized]);

  if (!studyPlan || studyPlan.modules.length === 0) return null;

  const currentIdx = sessionContext?.currentModuleIndex ?? 0;
  const total = studyPlan.modules.length;
  const completed = Math.max(0, Math.min(currentIdx, total - 1));
  const pct = total > 0 ? Math.round(((completed + 1) / total) * 100) : 0;

  const surface = darkMode
    ? "bg-[#0d0d18]/95 border-white/[0.08] text-white/55"
    : "bg-white/95 border-black/[0.06] text-black/55";

  const anchorClass = DOCK_CLASS[dock];
  const isBottom = dock.startsWith("b");
  const expanded = hovered && !minimized;

  return (
    <div
      className={`absolute z-30 ${anchorClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {minimized ? (
        // ── Minimized: just a small circle showing progress ─────────────────
        <MinimizedPill
          pct={pct}
          darkMode={darkMode}
          dock={dock}
          onExpand={() => setMinimized(false)}
          onPickDock={setDock}
          hovered={hovered}
        />
      ) : (
        // Pill + dropdown live in a flex column so the pill stays pill-shaped
        // and the dropdown is a *separate* rounded rectangle that hangs below
        // (or above, when docked at the bottom).
        <div className={`flex flex-col items-center gap-1.5 ${isBottom ? "flex-col-reverse" : ""}`}>
          {/* Pill */}
          <motion.div
            layout
            initial={false}
            className={`${surface} rounded-full shadow-lg border backdrop-blur-xl overflow-hidden`}
            style={{ maxWidth: "min(720px, 92vw)" }}
          >
            <div className="flex items-center px-3 py-1.5 gap-2.5">
              {/* Progress ring */}
              <ProgressRing pct={pct} darkMode={darkMode} />

              <div className="flex flex-col min-w-0 flex-shrink">
                <span className="text-[9.5px] uppercase tracking-wider font-semibold opacity-70 leading-none mb-0.5">
                  Module {completed + 1} of {total}
                </span>
                <span
                  className="text-[12px] font-medium truncate leading-tight"
                  style={{ color: darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)" }}
                >
                  {studyPlan.modules[completed]?.title ?? "—"}
                </span>
              </div>

              <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-40" />

              {/* Step dots — hidden on compact viewports (where the pill is
                  already tight) to keep the title from being truncated. */}
              <div className={`items-center gap-1 flex-shrink-0 ${isCompact ? "hidden" : "flex"}`}>
                {studyPlan.modules.map((m, i) => {
                  const status = i < completed ? "done" : i === completed ? "active" : "pending";
                  return (
                    <button
                      key={m.id ?? i}
                      onClick={() => setPendingVoiceText(`Take me to module ${i + 1}: ${m.title}`)}
                      title={`${i + 1}. ${m.title}`}
                      className="group/dot relative flex-shrink-0"
                    >
                      <motion.div
                        animate={{ width: status === "active" ? 14 : 6, height: 6 }}
                        transition={{ type: "spring", damping: 22, stiffness: 350 }}
                        className="rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            status === "done"   ? "rgb(124,58,237)" :
                            status === "active" ? "rgb(167,139,250)" :
                            darkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Dropdown panel — separate from the pill so corners stay rectangular */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, y: isBottom ? 6 : -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: isBottom ? 6 : -6, scale: 0.97 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={`${surface} rounded-2xl shadow-xl border backdrop-blur-xl overflow-hidden`}
                style={{
                  width: "min(360px, 92vw)",
                  transformOrigin: isBottom ? "center bottom" : "center top",
                }}
              >
                {/* Header — minimize + dock picker */}
                <div
                  className="flex items-center justify-between px-3 py-1.5 border-b"
                  style={{ borderColor: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}
                >
                  <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">
                    Modules
                  </span>
                  <div className="flex items-center gap-1.5">
                    <DockPicker dock={dock} onPick={setDock} darkMode={darkMode} />
                    <button
                      onClick={() => setMinimized(true)}
                      title="Minimize"
                      className={`p-1 rounded-md transition-colors ${darkMode ? "hover:bg-white/[0.06]" : "hover:bg-black/[0.05]"}`}
                    >
                      <Minus className="w-3 h-3 opacity-60" />
                    </button>
                  </div>
                </div>

                {/* Module list */}
                <div className="px-2 py-2 flex flex-col gap-1 max-h-[260px] overflow-y-auto scrollbar-light">
                  {studyPlan.modules.map((m, i) => {
                    const status = i < completed ? "done" : i === completed ? "active" : "pending";
                    return (
                      <button
                        key={m.id ?? i}
                        onClick={() => setPendingVoiceText(`Take me to module ${i + 1}: ${m.title}`)}
                        className={`flex items-start gap-2 text-left px-2 py-1.5 rounded-md transition-colors ${
                          status === "active"
                            ? darkMode ? "bg-violet-500/10" : "bg-violet-50"
                            : darkMode ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.03]"
                        }`}
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {status === "done" ? (
                            <Check className="w-3 h-3 text-violet-500" />
                          ) : status === "active" ? (
                            <motion.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                              className="w-3 h-3 rounded-full bg-violet-500"
                            />
                          ) : (
                            <Circle className="w-3 h-3" style={{ color: darkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[11.5px] font-medium truncate ${
                            status === "active"
                              ? darkMode ? "text-violet-300" : "text-violet-700"
                              : darkMode ? "text-white/80" : "text-black/75"
                          }`}>
                            {m.title}
                          </div>
                          {m.estimatedMinutes && (
                            <div className="text-[9.5px] opacity-50 mt-0.5">
                              ~{m.estimatedMinutes} min
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

const DOCK_CLASS: Record<ModuleTimelineDock, string> = {
  tl: "top-3 left-3",
  tc: "top-3 left-1/2 -translate-x-1/2",
  tr: "top-3 right-3",
  bl: "bottom-3 left-3",
  bc: "bottom-3 left-1/2 -translate-x-1/2",
  br: "bottom-3 right-3",
};

const DOCK_GRID: ModuleTimelineDock[][] = [
  ["tl", "tc", "tr"],
  ["bl", "bc", "br"],
];

function ProgressRing({ pct, darkMode, size = 20 }: { pct: number; darkMode: boolean; size?: number }) {
  const r = size / 2 - 1.5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} strokeWidth="2" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="rgb(124,58,237)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums"
        style={{ color: darkMode ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)", fontSize: Math.max(7, size * 0.35) }}
      >
        {pct}
      </span>
    </div>
  );
}

function MinimizedPill({
  pct, darkMode, dock, onExpand, onPickDock, hovered,
}: {
  pct: number;
  darkMode: boolean;
  dock: ModuleTimelineDock;
  onExpand: () => void;
  onPickDock: (d: ModuleTimelineDock) => void;
  hovered: boolean;
}) {
  const surface = darkMode
    ? "bg-[#0d0d18]/95 border-white/[0.08]"
    : "bg-white/95 border-black/[0.06]";
  const isBottom = dock.startsWith("b");

  return (
    <div className={`flex flex-col items-center gap-1.5 ${isBottom ? "flex-col-reverse" : ""}`}>
      <button
        onClick={onExpand}
        title="Expand timeline"
        className={`relative ${surface} rounded-full shadow-lg border backdrop-blur-xl flex items-center justify-center w-9 h-9 transition-transform hover:scale-105`}
      >
        <ProgressRing pct={pct} darkMode={darkMode} size={26} />
        <Maximize2
          className="absolute -top-0.5 -right-0.5 w-3 h-3 opacity-0 group-hover:opacity-100"
          style={{ color: darkMode ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)" }}
        />
      </button>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: isBottom ? 4 : -4, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isBottom ? 4 : -4, scale: 0.92 }}
            transition={{ duration: 0.15 }}
            className={`${surface} rounded-xl shadow-xl border backdrop-blur-xl p-1.5`}
          >
            <DockPicker dock={dock} onPick={onPickDock} darkMode={darkMode} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DockPicker({
  dock, onPick, darkMode,
}: {
  dock: ModuleTimelineDock;
  onPick: (d: ModuleTimelineDock) => void;
  darkMode: boolean;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-1 p-1 rounded-md"
      style={{ backgroundColor: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.035)" }}
      role="group"
      aria-label="Move timeline"
    >
      {DOCK_GRID.flat().map((d) => {
        const active = d === dock;
        return (
          <button
            key={d}
            onClick={(e) => { e.stopPropagation(); onPick(d); }}
            title={DOCK_LABEL[d]}
            className="w-3.5 h-3.5 rounded-sm transition-colors flex items-center justify-center"
            style={{
              backgroundColor: active
                ? "rgb(124,58,237)"
                : darkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
            }}
          >
            <span className="sr-only">{DOCK_LABEL[d]}</span>
          </button>
        );
      })}
    </div>
  );
}

const DOCK_LABEL: Record<ModuleTimelineDock, string> = {
  tl: "Top left",
  tc: "Top center",
  tr: "Top right",
  bl: "Bottom left",
  bc: "Bottom center",
  br: "Bottom right",
};
