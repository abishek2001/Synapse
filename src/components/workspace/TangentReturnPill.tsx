"use client";

import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import { useUIStore } from "@/store/ui";

interface TangentReturnPillProps {
  /** Pan/zoom the canvas back to the main module when clicked. */
  onReturn: (groupId: string) => void;
}

/**
 * "Back to {currentMain}" pill rendered inline beside the follow-up chips
 * inside `CanvasInputBar`. Visible whenever a tangent module is the latest
 * thing on the canvas and there's a different "current main" module the user
 * was working on before the tangent. Clicking it pans the canvas back to the
 * main module and clears the tangent state so the pill goes away.
 *
 * Was previously a floating absolutely-positioned pill above the input bar,
 * but it overlapped the live caption bubble — see screenshot in chat. Now it
 * lives in the same flex row as the follow-up chips and uses matching
 * violet/lavender styling.
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

  // Truncate long names so the pill stays compact in the chip row.
  const label =
    mainGroup.name.length > 24
      ? `${mainGroup.name.slice(0, 24)}…`
      : mainGroup.name;

  // White (light) / dark surface with a violet accent ring — matches the
  // original floating pill design the user wanted to keep, just rendered
  // inline beside the follow-up chips instead of floating above the caption.
  const bg = darkMode ? "rgba(20,20,37,0.92)" : "rgba(255,255,255,0.95)";
  const border = darkMode ? "rgba(124,58,237,0.45)" : "rgba(124,58,237,0.35)";
  const textColor = darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const labelColor = darkMode ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";

  return (
    <motion.button
      key="tangent-return-pill"
      onClick={handleClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", damping: 24, stiffness: 320 }}
      title={`Back to "${mainGroup.name}"`}
      className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-shadow whitespace-nowrap shadow-[0_4px_16px_rgba(124,58,237,0.14)] hover:shadow-[0_6px_20px_rgba(124,58,237,0.22)] flex-shrink-0"
      style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
        backdropFilter: "blur(12px)",
      }}
    >
      <ArrowLeft
        className="w-3 h-3 transition-transform group-hover:-translate-x-0.5"
        style={{ color: "#7c3aed" }}
        aria-hidden
      />
      <span
        className="font-semibold uppercase tracking-wider text-[10px]"
        style={{ color: labelColor }}
      >
        Back to
      </span>
      <span
        className="text-[11.5px] font-semibold max-w-[180px] truncate"
        style={{ color: textColor }}
      >
        {label}
      </span>
    </motion.button>
  );
}
