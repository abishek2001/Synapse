"use client";

import type { NotationArtifact } from "@/lib/tools/types";
import { useEffect, useRef } from "react";
import katex from "katex";
// Side-effect import: registers the mhchem extension so chemistry macros like
// \ce{C-C}, \ce{C=C}, \ce{C#C} render correctly. Without this KaTeX falls back
// to its red error display and dumps the raw LaTeX source.
import "katex/contrib/mhchem";

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

export default function NotationCard({
  artifact,
  dark = false,
}: {
  artifact: NotationArtifact;
  dark?: boolean;
}) {
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mainRef.current) return;
    renderBlock(mainRef.current, artifact.latex);
  }, [artifact.latex]);

  return (
    <div className="space-y-2">
      <h3
        className="font-[family-name:var(--font-caveat)] text-[22px] font-semibold tracking-wide"
        style={{ color: dark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)" }}
      >
        {artifact.title}
      </h3>

      {/* Equation rendered directly — no box */}
      <div
        ref={mainRef}
        className="overflow-x-auto py-1
          [&_.katex]:text-[1.45em]
          [&_.katex-html]:leading-relaxed"
        style={{
          color: dark ? "rgba(255,255,255,0.85)" : "rgba(20,20,40,0.9)",
          // KaTeX injects colour via currentColor
          ["--katex-color" as string]: dark ? "rgba(255,255,255,0.85)" : "rgba(20,20,40,0.9)",
        }}
      />

      {artifact.annotation && (
        <p
          className="font-[family-name:var(--font-caveat)] text-[15px] leading-relaxed italic"
          style={{ color: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)" }}
        >
          {artifact.annotation}
        </p>
      )}
    </div>
  );
}
