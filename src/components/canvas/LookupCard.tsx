"use client";

import type { LookupArtifact } from "@/lib/tools/types";

export default function LookupCard({ artifact }: { artifact: LookupArtifact }) {
  if (artifact.results.length === 0) {
    return (
      <p className="text-[11px] text-black/25 py-3">
        No relevant excerpts found for &ldquo;{artifact.query}&rdquo;
      </p>
    );
  }

  return (
    <div className="space-y-3 max-w-sm">
      <h3 className="font-[family-name:var(--font-caveat)] text-xl font-semibold tracking-wide" style={{ color: "rgba(0,0,0,0.55)" }}>
        {artifact.title}
      </h3>
      {artifact.results.map((result, i) => (
        <div
          key={i}
          className="pl-3 border-l-2 border-purple-400/35"
        >
          <p className="text-[12px] leading-relaxed line-clamp-5 italic" style={{ color: "rgba(0,0,0,0.5)" }}>
            &ldquo;{result.text}&rdquo;
          </p>
          <p className="font-[family-name:var(--font-caveat)] text-sm mt-1" style={{ color: "rgba(0,0,0,0.28)" }}>
            from {result.source}
          </p>
        </div>
      ))}
    </div>
  );
}
