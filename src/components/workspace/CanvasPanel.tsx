"use client";

import dynamic from "next/dynamic";

const TldrawCanvas = dynamic(() => import("./TldrawCanvas"), { ssr: false });

export default function CanvasPanel() {
  return (
    <div className="w-full h-full relative bg-white">
      <TldrawCanvas />
    </div>
  );
}
