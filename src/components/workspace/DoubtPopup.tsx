"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useCanvasStore, estimateElemH } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import { useAIChat } from "@/hooks/useAIChat";
import type { FlashcardArtifact } from "@/lib/tools/types";

interface DoubtPopupProps {
  worldX: number;
  worldY: number;
  screenX: number;
  screenY: number;
  prefill?: string;
  originGroupId?: string;
  onClose: () => void;
}

export default function DoubtPopup({ worldX, worldY, screenX, screenY, prefill, originGroupId, onClose }: DoubtPopupProps) {
  const [question, setQuestion] = useState(prefill || "");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isMockMode, addUpdate, addModule, groups, elements } = useCanvasStore();
  const { darkMode } = useUIStore();
  const { sendMessage } = useAIChat();

  useEffect(() => { setTimeout(() => textRef.current?.focus(), 60); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    setTimeout(() => window.addEventListener("mousedown", handler), 100);
    return () => window.removeEventListener("mousedown", handler);
  }, [onClose]);

  /** Resolve the group this doubt is "about": explicit origin → nearest group → null. */
  const resolveFocusGroupId = useCallback((): string | undefined => {
    if (originGroupId && groups.some((g) => g.id === originGroupId)) {
      return originGroupId;
    }
    if (groups.length === 0) return undefined;
    let best: { id: string; d: number } | null = null;
    for (const g of groups) {
      const inGroup = elements.filter((e) => e.groupId === g.id);
      if (inGroup.length === 0) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of inGroup) {
        const h = el.h ?? estimateElemH(el.type);
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.w);
        maxY = Math.max(maxY, el.y + h);
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const d = Math.hypot(cx - worldX, cy - worldY);
      if (!best || d < best.d) best = { id: g.id, d };
    }
    return best?.id;
  }, [originGroupId, groups, elements, worldX, worldY]);

  const handleSubmit = useCallback(() => {
    if (!question.trim()) return;

    const focusGroupId = resolveFocusGroupId();

    if (isMockMode) {
      const doubtArtifact: FlashcardArtifact = {
        id: `doubt-art-${Date.now()}`,
        type: "flashcard",
        title: question.slice(0, 45),
        status: "rendered",
        cards: [
          { front: "Your question", back: question },
          { front: "In real mode", back: "The AI would generate a full explanation with diagrams and examples." },
          { front: "Next steps", back: "Related groups would appear and connect via arrows on the canvas." },
        ],
      };
      const moduleTitle = `${question.slice(0, 45)}${question.length > 45 ? "..." : ""}`;

      // Anchor mock doubt to the resolved focus group (or nearest as a fallback)
      addModule(moduleTitle, [doubtArtifact], undefined, undefined, {
        anchorGroupId: focusGroupId ?? null,
        isTangent: !!focusGroupId,
      });

      addUpdate({
        id: `upd-${Date.now()}`,
        type: "doubt_answered",
        title: `Doubt: ${question.slice(0, 35)}`,
        detail: "New group created",
        timestamp: Date.now(),
      });
    } else {
      sendMessage(question, { focusGroupId });
    }

    onClose();
  }, [question, isMockMode, resolveFocusGroupId, addModule, addUpdate, sendMessage, onClose]);

  // Clamp to viewport
  const popupW = 340;
  const popupH = 190;
  const left = Math.min(Math.max(screenX - popupW / 2, 10), window.innerWidth - popupW - 10);
  const top = Math.min(Math.max(screenY - 20, 10), window.innerHeight - popupH - 10);

  // Theme vars
  const bg = darkMode ? "#141425" : "#ffffff";
  const border = darkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const textColor = darkMode ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.8)";
  const mutedColor = darkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";
  const inputBg = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const inputBorder = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const inputFocus = "#7c3aed";
  const closeBtnClass = darkMode
    ? "text-white/20 hover:text-white/60 hover:bg-white/[0.06]"
    : "text-black/20 hover:text-black/60 hover:bg-black/[0.05]";
  const cancelClass = darkMode
    ? "text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
    : "text-black/30 hover:text-black/60 hover:bg-black/[0.04]";
  const hintColor = darkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.2)";

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.93, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.93, y: -6 }}
      transition={{ type: "spring", damping: 24, stiffness: 380 }}
      className="fixed z-50 pointer-events-auto"
      style={{ left, top, width: popupW }}
    >
      <div
        className="rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: bg, border: `1px solid ${border}` }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <span
            className="text-[12px] font-semibold"
            style={{ color: textColor }}
          >
            Ask a doubt
          </span>
          <button
            onClick={onClose}
            className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${closeBtnClass}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Textarea */}
        <div className="px-4 pb-3">
          <textarea
            ref={textRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
            placeholder="What would you like to understand?"
            rows={3}
            className="w-full rounded-xl px-3 py-2.5 text-[13px] outline-none resize-none transition-all"
            style={{
              backgroundColor: inputBg,
              border: `1px solid ${inputBorder}`,
              color: textColor,
              caretColor: inputFocus,
            }}
            onFocus={(e) => { e.target.style.borderColor = "rgba(124,58,237,0.4)"; }}
            onBlur={(e) => { e.target.style.borderColor = inputBorder; }}
          />

          <div className="flex items-center justify-between mt-2.5">
            <span className="text-[10px]" style={{ color: hintColor }}>
              Enter to submit · Shift+Enter for newline
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${cancelClass}`}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!question.trim()}
                className="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold bg-violet-600 hover:bg-violet-700 disabled:opacity-25 text-white transition-all"
              >
                Ask
              </button>
            </div>
          </div>
        </div>

        {/* Subtle color accent at top */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
          style={{ background: "linear-gradient(90deg, #7c3aed, #a855f7)" }}
        />
      </div>
    </motion.div>
  );
}
