"use client";

import type { SimulationArtifact } from "@/lib/tools/types";
import SimulationFrame from "./SimulationFrame";
import { Box } from "lucide-react";

interface SimulationCardProps {
  artifact: SimulationArtifact;
  expanded: boolean;
}

export default function SimulationCard({ artifact, expanded }: SimulationCardProps) {
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

  return (
    <div
      className={`w-full ${expanded ? "h-[60vh]" : "h-full"} rounded-xl overflow-hidden bg-[#0a0b14]`}
    >
      <SimulationFrame code={artifact.code} />
    </div>
  );
}
