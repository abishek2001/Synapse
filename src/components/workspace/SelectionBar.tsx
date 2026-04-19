"use client";

import { motion } from "framer-motion";
import { X, HelpCircle, Group, Ungroup, Trash2 } from "lucide-react";
import { useCanvasStore, isUserAnnotation } from "@/store/canvas";
import { useUIStore } from "@/store/ui";

export default function SelectionBar() {
  const {
    selectedElementIds,
    elements,
    groups,
    clearSelection,
    removeElement,
    removeUserAnnotation,
    groupSelected,
    ungroupElements,
  } = useCanvasStore();
  const { openDoubtPopup } = useUIStore();

  if (selectedElementIds.length < 1) return null;

  const selectedEls = elements.filter((e) => selectedElementIds.includes(e.id));
  const groupIds = [...new Set(selectedEls.map((e) => e.groupId).filter(Boolean))] as string[];
  const groupNames = groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean) as string[];

  // Can group when 2+ items selected with no existing group mixing
  const canGroup = selectedElementIds.length >= 2;
  // Can ungroup when all selected items share a single group
  const allSameGroup = groupIds.length === 1 && selectedEls.every((e) => e.groupId === groupIds[0]);
  const canUngroup = allSameGroup;

  const labels = groupNames.length > 0 ? groupNames : selectedEls.map((e) => e.type);
  const subtitle = labels.slice(0, 3).join(" · ") + (labels.length > 3 ? ` +${labels.length - 3}` : "");

  const handleAskAboutSelection = () => {
    const aboutText = groupNames.length > 0
      ? groupNames.map((n) => `"${n}"`).join(", ")
      : `${selectedElementIds.length} selected element${selectedElementIds.length === 1 ? "" : "s"}`;
    const prompt = selectedElementIds.length === 1
      ? `Explain "${aboutText}" in more detail`
      : `Explain the relationship and connection between: ${aboutText}`;
    // Anchor the doubt to the first selected element's group, if any
    const originGroupId = groupIds[0];
    openDoubtPopup(400, 300, prompt, originGroupId);
  };

  const handleGroup = () => {
    groupSelected("Group");
  };

  const handleUngroup = () => {
    if (groupIds[0]) ungroupElements(groupIds[0]);
    clearSelection();
  };

  const handleDelete = () => {
    // Route user-annotation deletes through `removeUserAnnotation` so each
    // one lands on the annotation undo stack. Other element types (AI
    // artifacts) don't participate in undo and use the plain remove path.
    selectedElementIds.forEach((id) => {
      const el = elements.find((e) => e.id === id);
      if (el && isUserAnnotation(el)) removeUserAnnotation(id);
      else removeElement(id);
    });
    clearSelection();
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
        className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#7c3aed]/40 shadow-lg"
        style={{ backgroundColor: "rgba(124,58,237,0.85)", backdropFilter: "blur(12px)" }}
      >
        <span className="text-[12px] font-semibold text-white/90 px-1.5">
          {selectedElementIds.length} selected
        </span>

        <div className="w-px h-4 bg-white/20 mx-1" />

        {canGroup && (
          <button
            onClick={handleGroup}
            className="flex items-center gap-1.5 text-[11px] font-medium text-white/80 hover:text-white transition-colors px-2 py-1 rounded-full hover:bg-white/10"
            title="Group selected"
          >
            <Group className="w-3.5 h-3.5" />
            Group
          </button>
        )}

        {canUngroup && (
          <button
            onClick={handleUngroup}
            className="flex items-center gap-1.5 text-[11px] font-medium text-white/80 hover:text-white transition-colors px-2 py-1 rounded-full hover:bg-white/10"
            title="Ungroup"
          >
            <Ungroup className="w-3.5 h-3.5" />
            Ungroup
          </button>
        )}

        <button
          onClick={handleAskAboutSelection}
          className="flex items-center gap-1.5 text-[11px] font-medium text-white/80 hover:text-white transition-colors px-2 py-1 rounded-full hover:bg-white/10"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Ask AI
        </button>

        <div className="w-px h-4 bg-white/20 mx-1" />

        <button
          onClick={handleDelete}
          className="text-white/50 hover:text-red-300 transition-colors p-1 rounded-full hover:bg-white/10"
          title="Delete selected"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={clearSelection}
          className="text-white/50 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
          title="Deselect"
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
