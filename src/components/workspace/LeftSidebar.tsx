"use client";

import { motion } from "framer-motion";
import { LayoutList } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import { useSessionStore } from "@/store/session";
import { useEffect, useMemo, useRef } from "react";

const ARTIFACT_ICONS: Record<string, string> = {
  visual: "🎨",
  graph: "📈",
  notation: "∑",
  flashcard: "🃏",
  lookup: "🔎",
  simulation: "🌌",
  text: "T",
  sticky: "📌",
};

interface LeftSidebarProps {
  open: boolean;
  onToggle: () => void;
  onZoomToGroup?: (groupId: string) => void;
}

export default function LeftSidebar({ open, onZoomToGroup }: LeftSidebarProps) {
  const { groups, elements } = useCanvasStore();
  const { darkMode, highlightedSource, highlightedSourceTs, clearHighlightedSource } = useUIStore();
  const { docHeadings } = useSessionStore();

  // Find which heading best matches the highlighted source string. We compare
  // case-insensitively, looking for headings whose text appears in the source
  // (or vice-versa) — so "doc.pdf, p.3" can map to a "Section 3" heading.
  const matchedHeadingIndex = useMemo<number>(() => {
    if (!highlightedSource) return -1;
    const src = highlightedSource.toLowerCase();
    let best = -1;
    let bestScore = 0;
    docHeadings.forEach((h, i) => {
      const hLower = h.toLowerCase();
      // Direct substring match (either way)
      if (src.includes(hLower) || hLower.includes(src)) {
        const score = Math.min(hLower.length, src.length);
        if (score > bestScore) { best = i; bestScore = score; }
      }
      // Page-number heuristic: source has "p.5" or "page 5" → match if heading has "5"
      const pageMatch = src.match(/p\.?\s*(\d+)|page\s+(\d+)|§\s*([\d.]+)/i);
      if (pageMatch) {
        const num = pageMatch[1] || pageMatch[2] || pageMatch[3];
        if (num && hLower.includes(num)) {
          if (3 > bestScore) { best = i; bestScore = 3; }
        }
      }
    });
    return best;
  }, [highlightedSource, docHeadings]);

  // Auto-clear the highlight after 3 seconds
  const headingRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (matchedHeadingIndex >= 0) {
      const node = headingRefs.current[matchedHeadingIndex];
      if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (highlightedSource) {
      const id = setTimeout(() => clearHighlightedSource(), 3000);
      return () => clearTimeout(id);
    }
  }, [highlightedSourceTs, matchedHeadingIndex, highlightedSource, clearHighlightedSource]);

  const surface = darkMode ? "#0a0a18" : "#ffffff";
  const border = darkMode ? "border-white/[0.05]" : "border-black/[0.06]";
  const headerText = darkMode ? "text-white/30" : "text-black/30";
  const mutedText = darkMode ? "text-white/20" : "text-black/20";
  const itemHover = darkMode ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.03]";
  const titleText = darkMode ? "text-white/70" : "text-black/70";
  const numberChip = darkMode ? "bg-white/[0.06] text-white/30" : "bg-black/[0.05] text-black/30";

  // Sort groups by orderIndex
  const sortedGroups = [...groups].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <motion.div
      animate={{ width: open ? 240 : 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className={`flex-shrink-0 relative z-40 overflow-hidden border-r ${border}`}
      style={{ backgroundColor: surface }}
    >
      <div className="w-[240px] h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`flex items-center gap-2 px-4 py-3 border-b ${border} flex-shrink-0`}>
          <LayoutList className={`w-3.5 h-3.5 ${mutedText}`} />
          <span className={`text-[10px] font-semibold tracking-widest uppercase ${headerText}`}>
            Canvas
          </span>
          {groups.length > 0 && (
            <span className={`ml-auto text-[9px] rounded px-1.5 py-0.5 ${numberChip}`}>
              {groups.length}
            </span>
          )}
        </div>

        {/* Group list */}
        <div className="flex-1 overflow-y-auto py-2 px-2">

          {/* Document heading outline — shown when docs are loaded */}
          {docHeadings.length > 0 && (
            <div className="mb-2">
              <p className={`px-2 py-1 text-[9px] font-semibold tracking-widest uppercase ${headerText}`}>
                Document
              </p>
              {docHeadings.slice(0, 20).map((heading, i) => {
                const isMatch = i === matchedHeadingIndex;
                return (
                  <motion.div
                    key={i}
                    ref={(el) => { headingRefs.current[i] = el; }}
                    animate={isMatch ? {
                      backgroundColor: darkMode
                        ? ["rgba(139,92,246,0)", "rgba(139,92,246,0.18)", "rgba(139,92,246,0)"]
                        : ["rgba(139,92,246,0)", "rgba(139,92,246,0.13)", "rgba(139,92,246,0)"],
                    } : { backgroundColor: "rgba(0,0,0,0)" }}
                    transition={{ duration: 1.6, repeat: isMatch ? 1 : 0, ease: "easeInOut" }}
                    className={`px-2 py-1.5 flex items-center gap-2 rounded-md`}
                  >
                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${isMatch ? "bg-violet-500" : darkMode ? "bg-white/20" : "bg-black/20"}`} />
                    <p className={`text-[11px] leading-tight truncate ${isMatch ? (darkMode ? "text-violet-300 font-semibold" : "text-violet-700 font-semibold") : mutedText}`}>{heading}</p>
                  </motion.div>
                );
              })}
              {groups.length > 0 && (
                <div className={`mx-2 mt-2 mb-1 border-t ${border}`} />
              )}
            </div>
          )}

          {groups.length === 0 && docHeadings.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className={`text-[11px] text-center ${mutedText}`}>
                Ask something to add groups to the canvas
              </p>
            </div>
          )}

          {groups.length > 0 && docHeadings.length > 0 && (
            <p className={`px-2 py-1 text-[9px] font-semibold tracking-widest uppercase ${headerText}`}>
              Canvas
            </p>
          )}

          {sortedGroups.map((group, idx) => {
            const members = elements.filter((e) => e.groupId === group.id);
            const elementTypes = [...new Set(members.map((e) => e.type))];
            return (
              <div
                key={group.id}
                role="button"
                tabIndex={0}
                onClick={() => onZoomToGroup?.(group.id)}
                onKeyDown={(e) => e.key === "Enter" && onZoomToGroup?.(group.id)}
                className={`flex items-start gap-2.5 px-2 py-2 rounded-lg transition-colors ${onZoomToGroup ? "cursor-pointer" : "cursor-default"} ${itemHover}`}
              >
                {/* Number indicator */}
                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-semibold ${numberChip}`}>
                  {idx + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-medium leading-tight truncate ${titleText}`}>
                    {group.name}
                  </p>
                  {elementTypes.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {elementTypes.map((t) => (
                        <span key={t} className="text-[10px]" title={t}>
                          {ARTIFACT_ICONS[t] ?? "📄"}
                        </span>
                      ))}
                      <span className={`ml-1 text-[9px] ${mutedText}`}>{members.length}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
