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
      <h3 className="font-[family-name:var(--font-caveat)] text-xl text-black/70 font-semibold tracking-wide">
        {artifact.title}
      </h3>
      {artifact.results.map((result, i) => (
        <div
          key={i}
          className="bg-white rounded-xl p-4 border-l-3 border-purple-400/40 shadow-sm"
        >
          <p className="text-[12px] text-black/55 leading-relaxed line-clamp-5 italic">
            &ldquo;{result.text}&rdquo;
          </p>
          <p className="font-[family-name:var(--font-caveat)] text-sm text-black/30 mt-2">
            from {result.source}
          </p>
        </div>
      ))}
    </div>
  );
}
