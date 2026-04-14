"use client";

import { motion } from "framer-motion";
import { useCanvasStore } from "@/store/canvas";
import { useSessionStore } from "@/store/session";
import { useUIStore } from "@/store/ui";

export default function MockButton() {
  const { isMockMode, setMockMode, clearCanvas, loadMockData } = useCanvasStore();
  const { query } = useSessionStore();
  const { darkMode } = useUIStore();

  const handleClick = () => {
    if (isMockMode) {
      clearCanvas();
      setMockMode(false);
    } else {
      loadMockData(query || undefined);
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      className={`absolute bottom-20 right-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-mono transition-all ${
        isMockMode
          ? "bg-amber-500/10 border-amber-500/25 text-amber-500"
          : darkMode
            ? "border-white/[0.10] text-white/30 hover:text-white/50 hover:border-white/20"
            : "border-black/[0.08] text-black/30 hover:text-black/50 hover:border-black/15"
      }`}
      style={{ backgroundColor: isMockMode ? undefined : darkMode ? "#1a1a2e" : "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)" }}
      title="Load mock canvas data for UI testing"
    >
      {isMockMode && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      )}
      {isMockMode ? "Mock Active · Click to Clear" : "[DEV] Mock Canvas"}
    </motion.button>
  );
}
