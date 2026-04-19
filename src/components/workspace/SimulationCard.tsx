"use client";

import type { SimulationArtifact } from "@/lib/tools/types";
import SimulationFrame from "./SimulationFrame";
import { ARTIFACT_DEFAULT_FRAME_H } from "@/store/canvas";
import { Box } from "lucide-react";

const SIM_DEFAULT_H = ARTIFACT_DEFAULT_FRAME_H.simulation ?? 440;

interface SimulationCardProps {
  artifact: SimulationArtifact;
  expanded: boolean;
  /** Per-element height override from CanvasElement.frameH (set by the
   *  user-resize handle). When unset, falls back to the default height
   *  (or 100% when `expanded=false`, matching the legacy collapsed mode). */
  height?: number;
}

export default function SimulationCard({ artifact, expanded, height }: SimulationCardProps) {
  if (!artifact.code) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <Box className="w-5 h-5 text-black/15 mx-auto mb-2" />
          <span className="text-[11px] text-black/25">Generating...</span>
        </div>
      </div>
    );
  }

  const h = height ?? (expanded ? SIM_DEFAULT_H : undefined);

  return (
    <div
      className={`w-full rounded-xl overflow-hidden bg-[#0a0b14]`}
      style={{ height: h ?? "100%" }}
    >
      <SimulationFrame code={artifact.code} />
    </div>
  );
}
