"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, Circle, ChevronRight } from "lucide-react";
import { useGroundingStore } from "@/store/grounding";
import { useSessionStore } from "@/store/session";
import { useUIStore } from "@/store/ui";
import { useState } from "react";

/**
 * Horizontal timeline of study-plan modules with the current step highlighted.
 * Sits at the top of the canvas — collapses to a thin pill when not hovered.
 */
export default function ModuleTimeline() {
  const studyPlan = useGroundingStore((s) => s.studyPlan);
  const sessionContext = useGroundingStore((s) => s.sessionContext);
  const setPendingVoiceText = useSessionStore((s) => s.setPendingVoiceText);
  const darkMode = useUIStore((s) => s.darkMode);
  const [expanded, setExpanded] = useState(false);

  if (!studyPlan || studyPlan.modules.length === 0) return null;

  const currentIdx = sessionContext?.currentModuleIndex ?? 0;
  const total = studyPlan.modules.length;
  const completed = Math.max(0, Math.min(currentIdx, total - 1));
  const pct = total > 0 ? Math.round(((completed + 1) / total) * 100) : 0;

  const surface = darkMode
    ? "bg-[#0d0d18]/95 border-white/[0.08] text-white/55"
    : "bg-white/95 border-black/[0.06] text-black/55";

  return (
    <motion.div
      initial={false}
      onHoverStart={() => setExpanded(true)}
      onHoverEnd={() => setExpanded(false)}
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 ${surface} rounded-full shadow-lg border backdrop-blur-xl overflow-hidden`}
      style={{
        // We let width grow naturally — collapsed is compact
        maxWidth: expanded ? "min(720px, 92vw)" : 360,
        transition: "max-width 0.3s ease",
      }}
    >
      <div className="flex items-center px-3 py-1.5 gap-2.5">
        {/* Progress ring */}
        <div className="relative w-5 h-5 flex-shrink-0">
          <svg viewBox="0 0 20 20" className="w-5 h-5 -rotate-90">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke={darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} strokeWidth="2" />
            <motion.circle
              cx="10" cy="10" r="8.5"
              fill="none"
              stroke="rgb(124,58,237)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 8.5}
              animate={{ strokeDashoffset: 2 * Math.PI * 8.5 * (1 - pct / 100) }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold tabular-nums" style={{ color: darkMode ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)" }}>
            {pct}
          </span>
        </div>

        <div className="flex flex-col min-w-0 flex-shrink">
          <span className="text-[9.5px] uppercase tracking-wider font-semibold opacity-70 leading-none mb-0.5">
            Module {completed + 1} of {total}
          </span>
          <span className="text-[12px] font-medium truncate leading-tight" style={{ color: darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)" }}>
            {studyPlan.modules[completed]?.title ?? "—"}
          </span>
        </div>

        <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-40" />

        {/* Step dots */}
        <div className="flex items-center gap-1 flex-shrink-0">
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
                  animate={{
                    width: status === "active" ? 14 : 6,
                    height: 6,
                  }}
                  transition={{ type: "spring", damping: 22, stiffness: 350 }}
                  className="rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      status === "done"    ? "rgb(124,58,237)" :
                      status === "active"  ? "rgb(167,139,250)" :
                      darkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded details — full title list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t overflow-hidden"
            style={{ borderColor: darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}
          >
            <div className="px-3 py-2 flex flex-col gap-1 max-h-[200px] overflow-y-auto scrollbar-light">
              {studyPlan.modules.map((m, i) => {
                const status = i < completed ? "done" : i === completed ? "active" : "pending";
                return (
                  <button
                    key={m.id ?? i}
                    onClick={() => setPendingVoiceText(`Take me to module ${i + 1}: ${m.title}`)}
                    className={`flex items-start gap-2 text-left px-2 py-1 rounded-md transition-colors ${
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
                      <div className={`text-[11px] font-medium truncate ${status === "active" ? (darkMode ? "text-violet-300" : "text-violet-700") : darkMode ? "text-white/80" : "text-black/75"}`}>
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
    </motion.div>
  );
}
