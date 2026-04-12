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
      <h3 className="font-[family-name:var(--font-caveat)] text-xl text-black/70 font-semibold tracking-wide">
        {artifact.title}
      </h3>
      <div className="bg-white rounded-xl overflow-hidden border border-black/[0.06] shadow-sm">
        <div
          dangerouslySetInnerHTML={{ __html: artifact.svgContent }}
          className="[&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-[320px] p-3"
        />
      </div>
    </div>
  );
}
