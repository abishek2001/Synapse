"use client";

import { motion } from "framer-motion";
import { X, HelpCircle } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import { useUIStore } from "@/store/ui";

export default function SelectionBar() {
  const { selectedElementIds, elements, groups, clearSelection } = useCanvasStore();
  const { openDoubtPopup } = useUIStore();

  if (selectedElementIds.length < 2) return null;

  // Collect unique group names (or element types for ungrouped elements)
  const selectedEls = elements.filter((e) => selectedElementIds.includes(e.id));
  const groupIds = [...new Set(selectedEls.map((e) => e.groupId).filter(Boolean))];
  const groupNames = groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean) as string[];

  // Labels for the subtitle — prefer group names, fall back to element types
  const labels = groupNames.length > 0 ? groupNames : selectedEls.map((e) => e.type);
  const subtitle = labels.slice(0, 3).join(" · ") + (labels.length > 3 ? ` +${labels.length - 3}` : "");

  const handleAskAboutSelection = () => {
    const aboutText = groupNames.length > 0
      ? groupNames.map((n) => `"${n}"`).join(", ")
      : `${selectedElementIds.length} selected elements`;
    openDoubtPopup(400, 300, `Explain the relationship and connection between: ${aboutText}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ type: "spring", damping: 24, stiffness: 320 }}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
    >
      <div
        className="flex items-center gap-3 px-4 py-2 rounded-full border border-[#7c3aed]/40 shadow-lg"
        style={{ backgroundColor: "rgba(124,58,237,0.85)", backdropFilter: "blur(12px)" }}
      >
        <span className="text-[12px] font-semibold text-white/90">
          {selectedElementIds.length} selected
        </span>

        <div className="w-px h-4 bg-white/20" />

        <button
          onClick={handleAskAboutSelection}
          className="flex items-center gap-1.5 text-[11px] font-medium text-white/80 hover:text-white transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Ask about selection
        </button>

        <div className="w-px h-4 bg-white/20" />

        <button
          onClick={clearSelection}
          className="text-white/50 hover:text-white transition-colors"
          title="Clear selection"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {subtitle && (
        <div className="mt-1.5 text-center">
          <span className="text-[10px] text-white/30 truncate max-w-[400px] inline-block">{subtitle}</span>
        </div>
      )}
    </motion.div>
  );
}
