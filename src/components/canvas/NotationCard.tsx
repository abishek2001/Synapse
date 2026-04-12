"use client";

import type { NotationArtifact } from "@/lib/tools/types";
import { useEffect, useRef } from "react";
import katex from "katex";

function renderBlock(container: HTMLElement, latex: string) {
  try {
    katex.render(latex, container, {
      displayMode: true,
      throwOnError: false,
      trust: true,
      strict: false,
    });
  } catch {
    container.textContent = latex;
  }
}

export default function NotationCard({ artifact }: { artifact: NotationArtifact }) {
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainRef.current) return;
    renderBlock(mainRef.current, artifact.latex);
  }, [artifact.latex]);

  return (
    <div className="space-y-3">
      {/* Title in handwritten style */}
      <h3 className="font-[family-name:var(--font-caveat)] text-xl text-black/70 font-semibold tracking-wide">
        {artifact.title}
      </h3>

      {/* Main equation */}
      <div className="relative">
        <div className="absolute -left-0 top-0 bottom-0 w-[3px] rounded-full bg-purple-400/30" />
        <div
          ref={mainRef}
          className="bg-white rounded-xl p-6 overflow-x-auto border border-black/[0.06] shadow-sm
            [&_.katex]:text-[#1a1a2e] [&_.katex-html]:text-[#1a1a2e] [&_.katex]:text-lg"
        />
      </div>

      {artifact.annotation && (
        <p className="font-[family-name:var(--font-caveat)] text-base text-black/45 leading-relaxed px-1 italic">
          {artifact.annotation}
        </p>
      )}
    </div>
  );
}
