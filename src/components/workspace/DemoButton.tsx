"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";
import { useDemoStore } from "@/store/demo";
import { DEMO_SCRIPTS } from "@/lib/demos";
import type { DemoScript } from "@/lib/demos/types";

export default function DemoButton() {
  const { darkMode } = useUIStore();
  const script = useDemoStore((s) => s.script);
  const isPlaying = useDemoStore((s) => s.isPlaying);
  const queuedPrompt = useDemoStore((s) => s.queuedPrompt);
  const currentModuleIdx = useDemoStore((s) => s.currentModuleIdx);
  const start = useDemoStore((s) => s.start);
  const stop = useDemoStore((s) => s.stop);
  const activeScriptId = script?.id ?? null;
  // "Active" means the demo is on rails — either streaming a module or sitting
  // on a queued prompt waiting for the user. Treat both as "demo running".
  const demoActive = !!script;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Outside-click → close popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onPick = (script: DemoScript) => {
    setOpen(false);
    start(script);
  };

  const onMainClick = () => {
    if (demoActive) {
      stop();
      return;
    }
    setOpen((v) => !v);
  };

  const activeScript = activeScriptId
    ? DEMO_SCRIPTS.find((s) => s.id === activeScriptId)
    : null;
  const totalModules = activeScript?.modules.length ?? 0;
  const moduleProgress = activeScript
    ? `${Math.min(currentModuleIdx + 1, totalModules)}/${totalModules}`
    : "";

  return (
    <div
      ref={containerRef}
      className="absolute right-4 bottom-32 z-40 hidden sm:flex flex-col items-end gap-2"
    >
      <AnimatePresence>
        {open && !demoActive && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl border shadow-2xl p-2 w-[300px] flex flex-col gap-1.5"
            style={{
              backgroundColor: darkMode ? "#0d0e1f" : "rgba(255,255,255,0.97)",
              borderColor: darkMode ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div
              className="px-2 pt-1 pb-1.5 text-[10px] font-mono uppercase tracking-wider"
              style={{ color: darkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}
            >
              Pick a demo
            </div>
            {DEMO_SCRIPTS.map((script) => (
              <button
                key={script.id}
                onClick={() => onPick(script)}
                className="text-left rounded-xl px-3 py-2.5 transition-colors"
                style={{
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = darkMode
                    ? "rgba(124,58,237,0.10)"
                    : "rgba(124,58,237,0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div
                  className="text-[13px] font-semibold leading-tight"
                  style={{ color: darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)" }}
                >
                  {script.title}
                </div>
                <div
                  className="text-[11px] mt-0.5 leading-snug"
                  style={{ color: darkMode ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)" }}
                >
                  {script.description}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {script.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                      style={{
                        backgroundColor: darkMode
                          ? "rgba(124,58,237,0.18)"
                          : "rgba(124,58,237,0.10)",
                        color: "#7c3aed",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  <span
                    className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md ml-auto"
                    style={{
                      backgroundColor: darkMode
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                      color: darkMode ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
                    }}
                  >
                    {script.modules.length} modules
                  </span>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={onMainClick}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-mono transition-all ${
          demoActive
            ? "bg-violet-500/15 border-violet-500/40 text-violet-400"
            : darkMode
              ? "border-white/[0.10] text-white/40 hover:text-white/60 hover:border-white/20"
              : "border-black/[0.08] text-black/40 hover:text-black/60 hover:border-black/15"
        }`}
        style={{
          backgroundColor: demoActive
            ? undefined
            : darkMode
              ? "#1a1a2e"
              : "rgba(255,255,255,0.9)",
          backdropFilter: "blur(8px)",
        }}
        title={
          demoActive
            ? queuedPrompt
              ? "Demo paused — submit the queued prompt to continue"
              : "Stop the running demo"
            : "Play a hardcoded demo (looks like real-time)"
        }
      >
        {demoActive && (
          <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? "bg-violet-400 animate-pulse" : "bg-amber-300"}`} />
        )}
        {demoActive
          ? isPlaying
            ? `▶ ${activeScript?.title ?? "Demo"} · ${moduleProgress}`
            : `⏸ ${activeScript?.title ?? "Demo"} · ${moduleProgress} · Click to Stop`
          : "[DEMO] Play Session"}
      </motion.button>
    </div>
  );
}
