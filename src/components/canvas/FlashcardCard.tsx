"use client";

import type { FlashcardArtifact } from "@/lib/tools/types";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

export default function FlashcardCard({
  artifact,
  dark = false,
}: {
  artifact: FlashcardArtifact;
  dark?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [review, setReview] = useState<Set<number>>(new Set());

  const total = artifact.cards.length;
  const card = artifact.cards[current];
  if (!card) return null;

  const progress = known.size / total;
  const isKnown = known.has(current);
  const needsReview = review.has(current);

  const goNext = () => {
    setFlipped(false);
    setTimeout(() => setCurrent((c) => Math.min(c + 1, total - 1)), flipped ? 120 : 0);
  };
  const goPrev = () => {
    setFlipped(false);
    setTimeout(() => setCurrent((c) => Math.max(c - 1, 0)), flipped ? 120 : 0);
  };

  const markKnown = () => {
    setKnown((s) => new Set([...s, current]));
    setReview((s) => { const n = new Set(s); n.delete(current); return n; });
    if (current < total - 1) goNext();
  };
  const markReview = () => {
    setReview((s) => new Set([...s, current]));
    setKnown((s) => { const n = new Set(s); n.delete(current); return n; });
    if (current < total - 1) goNext();
  };

  // Card-face palette. In dark mode we shift to deeper, lower-luminance tints
  // so the floating cards don't act as glare lamps against the dark canvas.
  // Hue family is preserved (violet/amber/emerald) so semantic state still
  // reads at a glance.
  const faceFront = isKnown
    ? dark
      ? { bg: "linear-gradient(135deg, #0e3328, #0a2820)", border: "1px solid rgba(52,211,153,0.35)", text: "rgba(229,255,244,0.92)", corner: "#34d399" }
      : { bg: "linear-gradient(135deg, #d1fae5, #ecfdf5)", border: "1px solid rgba(52,211,153,0.3)",  text: "rgba(0,0,0,0.75)",   corner: "#059669" }
    : needsReview
    ? dark
      ? { bg: "linear-gradient(135deg, #3a2c0a, #2c2008)", border: "1px solid rgba(251,191,36,0.35)", text: "rgba(255,247,224,0.92)", corner: "#fbbf24" }
      : { bg: "linear-gradient(135deg, #fef3c7, #fffbeb)", border: "1px solid rgba(251,191,36,0.3)",  text: "rgba(0,0,0,0.75)",   corner: "#d97706" }
    : dark
      ? { bg: "linear-gradient(135deg, #1f1633, #181028)", border: "1px solid rgba(139,92,246,0.32)", text: "rgba(238,232,255,0.92)", corner: "#a78bfa" }
      : { bg: "linear-gradient(135deg, #f5f3ff, #ede9fe)", border: "1px solid rgba(139,92,246,0.18)", text: "rgba(0,0,0,0.75)",   corner: "#7c3aed" };

  const faceBack = dark
    ? { bg: "linear-gradient(135deg, #0e2a23, #082019)", border: "1px solid rgba(52,211,153,0.32)", text: "rgba(220,255,240,0.85)" }
    : { bg: "linear-gradient(135deg, #f0fdf4, #ecfdf5)", border: "1px solid rgba(52,211,153,0.25)", text: "rgba(0,0,0,0.65)" };

  const tapHintColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.25)";
  const progressTrackBg = dark ? "bg-white/[0.08]" : "bg-black/[0.06]";
  const progressLabel = dark ? "text-white/55" : "text-black/30";
  const navBtnCls = dark
    ? "text-white/30 hover:text-white/80 hover:bg-white/[0.06] disabled:opacity-25"
    : "text-black/25 hover:text-black/60 hover:bg-black/[0.04] disabled:opacity-20";
  const dotInactive = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
  const overflowLabel = dark ? "text-white/45" : "text-black/30";
  const reviewBtnReview = dark
    ? { bg: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }
    : { bg: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)", color: "#d97706" };
  const reviewBtnKnown = dark
    ? { bg: "rgba(52,211,153,0.18)", border: "1px solid rgba(52,211,153,0.35)", color: "#34d399" }
    : { bg: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "#059669" };
  const resetBtn = dark
    ? { bg: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.32)", color: "#a78bfa" }
    : { bg: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.15)", color: "#7c3aed" };

  return (
    <div className="w-full select-none" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex-1 h-1 rounded-full overflow-hidden ${progressTrackBg}`}>
          <motion.div
            className="h-full rounded-full bg-emerald-400"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <span className={`text-[10px] font-medium tabular-nums ${progressLabel}`}>{known.size}/{total}</span>
      </div>

      {/* Card flip area */}
      <div
        className="relative cursor-pointer"
        style={{ height: 180, perspective: 900 }}
        onClick={() => setFlipped((f) => !f)}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center p-5 overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              background: faceFront.bg,
              border: faceFront.border,
            }}
          >
            {/* Corner indicator */}
            <div className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-wider opacity-60"
              style={{ color: faceFront.corner }}>
              Q
            </div>
            <p className="text-center text-[15px] font-medium leading-relaxed" style={{ color: faceFront.text }}>
              {card.front}
            </p>
            <p className="mt-3 text-[10px]" style={{ color: tapHintColor }}>tap to flip</p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center p-5 overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background: faceBack.bg,
              border: faceBack.border,
            }}
          >
            <div
              className="absolute top-3 right-3 text-[9px] font-semibold uppercase tracking-wider opacity-60"
              style={{ color: dark ? "#34d399" : "#10b981" }}
            >
              A
            </div>
            <p className="text-center text-[14px] leading-relaxed" style={{ color: faceBack.text }}>
              {card.back}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Action buttons — show after flip */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="flex gap-2 mt-3"
          >
            <button
              onClick={(e) => { e.stopPropagation(); markReview(); }}
              className="flex-1 py-1.5 rounded-xl text-[11px] font-semibold transition-all active:scale-95"
              style={{ background: reviewBtnReview.bg, border: reviewBtnReview.border, color: reviewBtnReview.color }}
            >
              Review again
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); markKnown(); }}
              className="flex-1 py-1.5 rounded-xl text-[11px] font-semibold transition-all active:scale-95"
              style={{ background: reviewBtnKnown.bg, border: reviewBtnKnown.border, color: reviewBtnKnown.color }}
            >
              Got it ✓
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-3 px-1">
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          disabled={current === 0}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${navBtnCls}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Dot navigation */}
        <div className="flex items-center gap-1">
          {artifact.cards.slice(0, Math.min(total, 8)).map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setFlipped(false); setCurrent(i); }}
              className="rounded-full transition-all"
              style={{
                width: i === current ? 16 : 6,
                height: 6,
                backgroundColor: known.has(i)
                  ? "rgba(52,211,153,0.7)"
                  : review.has(i)
                    ? "rgba(251,191,36,0.6)"
                    : i === current
                      ? "rgba(124,58,237,0.7)"
                      : dotInactive,
              }}
            />
          ))}
          {total > 8 && <span className={`text-[9px] ml-0.5 ${overflowLabel}`}>+{total - 8}</span>}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          disabled={current === total - 1}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${navBtnCls}`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Reset button when all done */}
      {known.size === total && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={(e) => { e.stopPropagation(); setKnown(new Set()); setReview(new Set()); setCurrent(0); setFlipped(false); }}
          className="w-full mt-2 py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all"
          style={{ background: resetBtn.bg, border: resetBtn.border, color: resetBtn.color }}
        >
          <RotateCcw className="w-3 h-3" />
          Review all again
        </motion.button>
      )}
    </div>
  );
}
