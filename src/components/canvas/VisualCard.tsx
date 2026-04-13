"use client";

import type { VisualArtifact } from "@/lib/tools/types";

export default function VisualCard({ artifact }: { artifact: VisualArtifact }) {
  if (!artifact.svgContent) {
    return (
      <div className="h-40 flex items-center justify-center">
        <span className="font-[family-name:var(--font-caveat)] text-base text-black/25">
          Sketching...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="font-[family-name:var(--font-caveat)] text-xl font-semibold tracking-wide" style={{ color: "rgba(0,0,0,0.55)" }}>
        {artifact.title}
      </h3>
      <div
        dangerouslySetInnerHTML={{ __html: artifact.svgContent }}
        className="[&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-[320px]"
      />
    </div>
  );
}
