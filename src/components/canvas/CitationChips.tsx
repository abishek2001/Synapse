"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import type { ArtifactCitation } from "@/lib/tools/types";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/store/ui";

/**
 * Shows a row of small "from <source>" chips below an artifact.
 * Hover/click a chip to peek at the excerpt that grounded this artifact.
 */
export default function CitationChips({
  citations,
  dark = false,
  align = "left",
  max = 3,
}: {
  citations?: ArtifactCitation[];
  dark?: boolean;
  align?: "left" | "right";
  max?: number;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const highlightSource = useUIStore((s) => s.highlightSource);
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen);

  if (!citations || citations.length === 0) return null;

  // Dedupe by source — multiple lookup hits can share the same doc
  const seen = new Set<string>();
  const unique = citations.filter((c) => {
    if (seen.has(c.source)) return false;
    seen.add(c.source);
    return true;
  });
  const visible = unique.slice(0, max);
  const overflow = unique.length - visible.length;

  const baseChip = dark
    ? "bg-white/[0.05] text-white/55 border-white/10 hover:bg-white/[0.10] hover:text-white/85"
    : "bg-black/[0.04] text-black/55 border-black/10 hover:bg-black/[0.07] hover:text-black/80";

  return (
    <div className={`mt-2 flex flex-wrap gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}>
      {visible.map((c, i) => (
        <div key={i} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex((prev) => (prev === i ? null : i));
              // Highlight the source in the left-sidebar TOC
              setLeftSidebarOpen(true);
              highlightSource(c.source);
            }}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9.5px] font-medium leading-none transition-colors max-w-[180px] truncate ${baseChip}`}
            title={c.excerpt ?? c.source}
          >
            <BookOpen className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
            <span className="truncate">{c.source}</span>
          </button>

          {/* Pop-out excerpt */}
          <AnimatePresence>
            {openIndex === i && c.excerpt && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={`absolute z-20 mt-1 p-2 rounded-lg shadow-lg text-[10.5px] leading-snug max-w-[260px] w-max ${dark ? "bg-[#1c1c1e] text-white/85 border border-white/10" : "bg-white text-black/75 border border-black/10"}`}
                style={{ left: align === "right" ? "auto" : 0, right: align === "right" ? 0 : "auto" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`font-semibold mb-1 text-[9.5px] uppercase tracking-wider ${dark ? "text-violet-300" : "text-violet-600"}`}>
                  {c.source}
                </div>
                <p className="italic">"{c.excerpt}"</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
      {overflow > 0 && (
        <span
          className={`text-[9.5px] px-1 py-0.5 rounded-md ${dark ? "text-white/40" : "text-black/40"}`}
        >
          +{overflow} more
        </span>
      )}
    </div>
  );
}
