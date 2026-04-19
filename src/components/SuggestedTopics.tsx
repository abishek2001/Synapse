"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

const suggestions = [
  "Quantum physics deep dive",
  "Neural networks 101",
  "Orbital mechanics",
  "Philosophy of mind",
  "Economic models",
];

export default function SuggestedTopics() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center gap-3 mt-8 px-4">
      <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-text-muted">
        Suggested for you
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((topic) => (
          <button
            key={topic}
            onClick={() =>
              router.push(
                `/workspace?q=${encodeURIComponent(topic)}&persona=professor`
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-text-secondary hover:text-foreground bg-surface hover:bg-surface-hover border border-border-subtle hover:border-border transition-all"
          >
            <Sparkles className="w-3 h-3 text-accent" />
            {topic}
          </button>
        ))}
      </div>
    </div>
  );
}
