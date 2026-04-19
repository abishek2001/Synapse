"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import { useUIStore } from "@/store/ui";

interface TangentReturnPillProps {
  /** Pan/zoom the canvas back to the main module when clicked. */
  onReturn: (groupId: string) => void;
}

/**
 * Floating "Back to {currentMain}" pill. Appears whenever a tangent module is
 * the latest thing on the canvas and there's a different "current main" module
 * the user was working on before the tangent. Clicking it pans the canvas back
 * to the main module and clears the tangent state so the pill goes away.
 */
export default function TangentReturnPill({ onReturn }: TangentReturnPillProps) {
  const { groups, currentMainGroupId, lastTangentGroupId, clearTangent } =
    useCanvasStore();
  const { darkMode } = useUIStore();

  const visible =
    !!lastTangentGroupId &&
    !!currentMainGroupId &&
    lastTangentGroupId !== currentMainGroupId;

  const mainGroup = currentMainGroupId
    ? groups.find((g) => g.id === currentMainGroupId)
    : null;

  if (!visible || !mainGroup) return null;

  const handleClick = () => {
    onReturn(mainGroup.id);
    clearTangent();
  };

  // Truncate long names so the pill stays compact.
  const label =
    mainGroup.name.length > 32
      ? `${mainGroup.name.slice(0, 32)}…`
      : mainGroup.name;

  const bg = darkMode ? "rgba(20,20,37,0.92)" : "rgba(255,255,255,0.95)";
  const border = darkMode ? "rgba(124,58,237,0.45)" : "rgba(124,58,237,0.35)";
  const textColor = darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const labelColor = darkMode ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";

  return (
    <AnimatePresence>
      <motion.button
        key="tangent-return-pill"
        onClick={handleClick}
        initial={{ opacity: 0, y: 8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.95 }}
        transition={{ type: "spring", damping: 22, stiffness: 320 }}
        className="absolute z-40 pointer-events-auto group flex items-center gap-2 px-3.5 py-2 rounded-full shadow-[0_8px_28px_rgba(124,58,237,0.18)] backdrop-blur-md transition-shadow hover:shadow-[0_10px_32px_rgba(124,58,237,0.28)]"
        style={{
          left: "50%",
          bottom: 110,
          transform: "translateX(-50%)",
          backgroundColor: bg,
          border: `1px solid ${border}`,
        }}
        title={`Back to "${mainGroup.name}"`}
      >
        <ArrowLeft
          className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5"
          style={{ color: "#7c3aed" }}
        />
        <span
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: labelColor }}
        >
          Back to
        </span>
        <span
          className="text-[12px] font-semibold max-w-[260px] truncate"
          style={{ color: textColor }}
        >
          {label}
        </span>
      </motion.button>
    </AnimatePresence>
  );
}
