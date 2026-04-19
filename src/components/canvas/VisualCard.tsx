"use client";

import type { VisualArtifact } from "@/lib/tools/types";

export default function VisualCard({
  artifact,
  dark = false,
}: {
  artifact: VisualArtifact;
  dark?: boolean;
}) {
  if (!artifact.svgContent) {
    return (
      <div className="h-40 flex items-center justify-center">
        <span
          className="font-[family-name:var(--font-caveat)] text-base"
          style={{ color: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)" }}
        >
          Sketching...
        </span>
      </div>
    );
  }

  // SVG sketches are authored with dark ink on a light surface and we cannot
  // automatically re-stroke them for dark mode. To keep the canvas readable
  // without burning the user's retinas with pure #fff, we mount the sketch
  // inside a soft off-white "paper" panel in dark mode (paper-tone #f5f1e8
  // with a faint border). This visually frames the sketch as an artifact on
  // the page rather than blasting bright white over the dark canvas.
  const sketchWrapper: React.CSSProperties | undefined = dark
    ? {
        background: "#f5f1e8",
        borderRadius: 12,
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
      }
    : undefined;

  return (
    <div className="space-y-2">
      <h3
        className="font-[family-name:var(--font-caveat)] text-xl font-semibold tracking-wide"
        style={{ color: dark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)" }}
      >
        {artifact.title}
      </h3>
      <div
        dangerouslySetInnerHTML={{ __html: artifact.svgContent }}
        className="[&_svg]:w-full [&_svg]:h-auto [&_svg]:max-h-[320px] [&_svg]:block"
        style={sketchWrapper}
      />
    </div>
  );
}
