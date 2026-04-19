"use client";

import { useUIStore } from "@/store/ui";

interface Props {
  artifactType: string;
  title?: string;
}

const TYPE_HEIGHTS: Record<string, number> = {
  flashcard:  240,
  graph:      220,
  notation:   140,
  visual:     200,
  lookup:     170,
  simulation: 300,
  render3d:   320,
  diagram:    240,
};

export default function SkeletonCard({ artifactType, title }: Props) {
  const { darkMode } = useUIStore();

  const h = TYPE_HEIGHTS[artifactType] ?? 200;
  const shimmerBase = darkMode ? "bg-white/[0.06]" : "bg-black/[0.05]";
  const shimmerHighlight = darkMode ? "bg-white/[0.1]" : "bg-black/[0.09]";
  const labelColor = darkMode ? "text-white/20" : "text-black/20";

  return (
    <div
      className="w-full rounded-xl overflow-hidden"
      style={{ height: h }}
    >
      {/* Header bar */}
      <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${darkMode ? "border-white/[0.05]" : "border-black/[0.05]"}`}>
        <div className={`w-2 h-2 rounded-full ${shimmerBase} animate-pulse`} />
        <div className={`h-2.5 rounded-full ${shimmerBase} animate-pulse`} style={{ width: title ? Math.min(title.length * 7, 160) : 100 }} />
        <span className={`ml-auto text-[10px] font-mono ${labelColor}`}>{artifactType}</span>
      </div>

      {/* Body shimmer lines */}
      <div className="p-3 flex flex-col gap-2.5">
        {artifactType === "graph" && (
          <>
            <div className={`h-[120px] rounded-lg ${shimmerBase} animate-pulse`} />
            <div className={`h-2 w-3/4 rounded-full ${shimmerBase} animate-pulse`} />
            <div className={`h-2 w-1/2 rounded-full ${shimmerBase} animate-pulse`} style={{ animationDelay: "150ms" }} />
          </>
        )}
        {artifactType === "notation" && (
          <>
            <div className={`h-10 w-full rounded-lg ${shimmerBase} animate-pulse`} />
            <div className={`h-2 w-2/3 rounded-full ${shimmerBase} animate-pulse`} style={{ animationDelay: "100ms" }} />
          </>
        )}
        {(artifactType === "visual" || artifactType === "diagram") && (
          <>
            <div className={`h-[100px] rounded-lg ${shimmerBase} animate-pulse`} />
            <div className="flex gap-2">
              <div className={`h-2 flex-1 rounded-full ${shimmerBase} animate-pulse`} />
              <div className={`h-2 flex-1 rounded-full ${shimmerBase} animate-pulse`} style={{ animationDelay: "120ms" }} />
            </div>
            <div className={`h-2 w-3/5 rounded-full ${shimmerBase} animate-pulse`} style={{ animationDelay: "240ms" }} />
          </>
        )}
        {artifactType === "flashcard" && (
          <>
            <div className={`h-[80px] rounded-lg ${shimmerBase} animate-pulse`} />
            <div className={`h-2 w-full rounded-full ${shimmerBase} animate-pulse`} style={{ animationDelay: "80ms" }} />
            <div className={`h-2 w-4/5 rounded-full ${shimmerBase} animate-pulse`} style={{ animationDelay: "160ms" }} />
            <div className={`h-7 w-20 rounded-full ${shimmerHighlight} animate-pulse mt-2`} style={{ animationDelay: "240ms" }} />
          </>
        )}
        {(artifactType === "simulation" || artifactType === "render3d") && (
          <>
            <div className={`rounded-lg ${shimmerBase} animate-pulse`} style={{ height: h - 80 }} />
          </>
        )}
        {artifactType === "lookup" && (
          <>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-10 rounded-lg ${shimmerBase} animate-pulse`} style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </>
        )}
        {!TYPE_HEIGHTS[artifactType] && (
          <>
            <div className={`h-[80px] rounded-lg ${shimmerBase} animate-pulse`} />
            <div className={`h-2 w-full rounded-full ${shimmerBase} animate-pulse`} />
            <div className={`h-2 w-3/5 rounded-full ${shimmerBase} animate-pulse`} style={{ animationDelay: "120ms" }} />
          </>
        )}
      </div>
    </div>
  );
}
