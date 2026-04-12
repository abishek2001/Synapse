"use client";

import type { FlashcardArtifact } from "@/lib/tools/types";
import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function FlashcardCard({ artifact }: { artifact: FlashcardArtifact }) {
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = artifact.cards[current];
  if (!card) return null;

  return (
    <div className="w-[300px] space-y-3">
      <h3 className="font-[family-name:var(--font-caveat)] text-xl text-black/70 font-semibold tracking-wide">
        {artifact.title}
      </h3>
      <div
        className="relative h-40 cursor-pointer"
        onClick={() => setFlipped(!flipped)}
        style={{ perspective: 800 }}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 rounded-2xl bg-white border border-black/[0.06] shadow-sm flex items-center justify-center p-6"
            style={{ backfaceVisibility: "hidden" }}
          >
            <p className="font-[family-name:var(--font-caveat)] text-lg text-black/70 text-center font-medium leading-relaxed">
              {card.front}
            </p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-50 to-white border border-green-500/15 shadow-sm flex items-center justify-center p-6"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="font-[family-name:var(--font-caveat)] text-lg text-black/60 text-center leading-relaxed">
              {card.back}
            </p>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center justify-between px-1">
        <button
          onClick={() => { setFlipped(false); setCurrent((c) => Math.max(c - 1, 0)); }}
          disabled={current === 0}
          className="text-black/25 hover:text-black/60 disabled:opacity-20 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[10px] text-black/25 font-medium">
          {current + 1} / {artifact.cards.length} · tap to flip
        </span>
        <button
          onClick={() => { setFlipped(false); setCurrent((c) => Math.min(c + 1, artifact.cards.length - 1)); }}
          disabled={current === artifact.cards.length - 1}
          className="text-black/25 hover:text-black/60 disabled:opacity-20 transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
