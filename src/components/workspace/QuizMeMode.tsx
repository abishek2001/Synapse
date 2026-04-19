"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, RotateCcw, Brain, Trophy } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import type { FlashcardArtifact } from "@/lib/tools/types";

type Rating = "again" | "hard" | "good" | "easy";

interface CardItem {
  id: string;
  front: string;
  back: string;
  source: string; // artifact title (so the user knows where it came from)
}

interface QueueState {
  card: CardItem;
  position: number; // current position in queue
  reps: number;     // how many times we've seen it this session
}

/**
 * Spaced-repetition Quiz Me mode — pulls every flashcard on the canvas into
 * one shuffle, then re-queues based on the user's rating (SM-2 inspired).
 *
 * Spacing: again=+1 (next), hard=+3, good=+8, easy=removed.
 */
export default function QuizMeMode() {
  const elements = useCanvasStore((s) => s.elements);
  const darkMode = useUIStore((s) => s.darkMode);
  const [open, setOpen] = useState(false);

  // Collect all flashcards across all flashcard artifacts on the canvas
  const allCards = useMemo(() => {
    const out: CardItem[] = [];
    for (const el of elements) {
      if (el.artifact?.type === "flashcard") {
        const a = el.artifact as FlashcardArtifact;
        a.cards.forEach((c, i) => {
          out.push({
            id: `${el.id}-${i}`,
            front: c.front,
            back: c.back,
            source: a.title,
          });
        });
      }
    }
    return out;
  }, [elements]);

  if (allCards.length === 0) return null;

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen(true)}
        className={`absolute bottom-32 right-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-medium transition-all ${
          darkMode
            ? "bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20"
            : "bg-violet-500/10 border-violet-500/25 text-violet-700 hover:bg-violet-500/15"
        }`}
        style={{ backdropFilter: "blur(8px)" }}
        title={`Spaced-repetition quiz with ${allCards.length} card${allCards.length === 1 ? "" : "s"}`}
      >
        <Brain className="w-3 h-3" />
        Quiz Me · {allCards.length}
      </motion.button>

      <AnimatePresence>
        {open && (
          <QuizModal
            cards={allCards}
            darkMode={darkMode}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function QuizModal({
  cards, darkMode, onClose,
}: {
  cards: CardItem[];
  darkMode: boolean;
  onClose: () => void;
}) {
  // Shuffled initial queue
  const [queue, setQueue] = useState<QueueState[]>(() =>
    [...cards]
      .sort(() => Math.random() - 0.5)
      .map((card, i) => ({ card, position: i, reps: 0 })),
  );
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [done, setDone] = useState(false);

  const current = queue[0];
  const remaining = queue.length;
  const total = cards.length;

  const handleRate = (rating: Rating) => {
    setStats((s) => ({ ...s, [rating]: s[rating] + 1 }));
    setRevealed(false);

    setQueue((prevQueue) => {
      const [head, ...rest] = prevQueue;
      if (!head) return [];
      const updated: QueueState = { ...head, reps: head.reps + 1 };

      if (rating === "easy") {
        // Remove from queue
        if (rest.length === 0) setDone(true);
        return rest;
      }

      // Re-queue with spacing
      const spacing = rating === "again" ? 1 : rating === "hard" ? 3 : 8;
      const insertAt = Math.min(spacing, rest.length);
      const next = [...rest];
      next.splice(insertAt, 0, updated);
      return next;
    });
  };

  const restart = () => {
    setQueue(
      [...cards].sort(() => Math.random() - 0.5).map((card, i) => ({ card, position: i, reps: 0 })),
    );
    setStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setDone(false);
    setRevealed(false);
  };

  const surface = darkMode ? "bg-[#0d0d18]" : "bg-white";
  const text = darkMode ? "text-white" : "text-black";
  const subtle = darkMode ? "text-white/55" : "text-black/55";
  const border = darkMode ? "border-white/[0.08]" : "border-black/[0.06]";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 8 }}
        transition={{ type: "spring", damping: 24, stiffness: 280 }}
        className={`${surface} ${text} rounded-3xl shadow-2xl w-full max-w-md border ${border} overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${border}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <Brain className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold leading-tight">Quiz Me</h3>
              <p className={`text-[11px] ${subtle} leading-tight`}>
                {done ? "All cards mastered" : `${remaining} card${remaining === 1 ? "" : "s"} remaining · ${total} total`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${darkMode ? "hover:bg-white/[0.08] text-white/55" : "hover:bg-black/[0.05] text-black/45"}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {done ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                <Trophy className="w-7 h-7 text-emerald-500" />
              </div>
              <h4 className="text-[16px] font-semibold mb-1">Nice work!</h4>
              <p className={`text-[12px] ${subtle} mb-4`}>
                You've cleared every card. Run it back to lock it in.
              </p>
              <div className={`grid grid-cols-4 gap-2 mb-5 text-[10.5px] ${subtle}`}>
                <Stat label="Again" value={stats.again} color="text-red-500" />
                <Stat label="Hard"  value={stats.hard}  color="text-amber-500" />
                <Stat label="Good"  value={stats.good}  color="text-emerald-500" />
                <Stat label="Easy"  value={stats.easy}  color="text-violet-500" />
              </div>
              <button
                onClick={restart}
                className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-[12.5px] font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restart
              </button>
            </div>
          ) : current ? (
            <>
              <div
                className={`relative rounded-2xl p-5 min-h-[180px] flex flex-col cursor-pointer ${
                  darkMode ? "bg-white/[0.04]" : "bg-violet-50/60"
                }`}
                onClick={() => setRevealed((r) => !r)}
              >
                <span className={`text-[9px] uppercase tracking-wider font-semibold mb-2 ${subtle}`}>
                  From: {current.card.source} · seen {current.reps}×
                </span>
                <p className={`text-[15px] leading-relaxed ${text} font-medium mb-3`}>
                  {current.card.front}
                </p>
                <AnimatePresence>
                  {revealed && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className={`mt-auto pt-3 border-t ${border}`}
                    >
                      <p className={`text-[13px] leading-relaxed ${subtle}`}>{current.card.back}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                {!revealed && (
                  <p className={`mt-auto pt-3 text-[10.5px] text-center ${subtle} italic`}>
                    Tap to reveal
                  </p>
                )}
              </div>

              {/* Rating buttons (only after reveal) */}
              <AnimatePresence>
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-4 gap-2 mt-4"
                  >
                    <RateButton label="Again" color="red"     onClick={() => handleRate("again")} />
                    <RateButton label="Hard"  color="amber"   onClick={() => handleRate("hard")} />
                    <RateButton label="Good"  color="emerald" onClick={() => handleRate("good")} />
                    <RateButton label="Easy"  color="violet"  onClick={() => handleRate("easy")} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Live stats */}
              <div className={`mt-3 flex justify-center gap-3 text-[10px] ${subtle}`}>
                <span className="text-red-500">{stats.again} again</span>
                <span className="text-amber-500">{stats.hard} hard</span>
                <span className="text-emerald-500">{stats.good} good</span>
                <span className="text-violet-500">{stats.easy} easy</span>
              </div>
            </>
          ) : (
            <p className={`text-center py-8 ${subtle} text-[12px]`}>No cards left in queue.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-[18px] font-bold ${color}`}>{value}</span>
      <span className="text-[9.5px] uppercase tracking-wider opacity-60">{label}</span>
    </div>
  );
}

function RateButton({ label, color, onClick }: { label: string; color: "red" | "amber" | "emerald" | "violet"; onClick: () => void }) {
  const styles: Record<string, string> = {
    red:     "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30",
    amber:   "bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/30",
    emerald: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/30",
    violet:  "bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 border-violet-500/30",
  };
  return (
    <button
      onClick={onClick}
      className={`py-2 rounded-lg text-[11px] font-semibold transition-colors border ${styles[color]}`}
    >
      {label}
    </button>
  );
}

// silence unused import
void Sparkles;
