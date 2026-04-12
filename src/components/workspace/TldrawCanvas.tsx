"use client";

import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

export default function TldrawCanvas() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Tldraw autoFocus={false} />
    </div>
  );
}
