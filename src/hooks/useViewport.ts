"use client";

import { useEffect, useState } from "react";

/**
 * Reactive viewport hook used for responsive layout decisions.
 *
 * Breakpoints are tuned to the workspace UI:
 *  - `isMobile`  → < 640px  (sm). Buttons collapse to icon-only, sidebars
 *                   become full-width drawers, mode picker stacks vertically.
 *  - `isCompact` → < 1100px. The right + left sidebars switch from "docked"
 *                   (push the canvas) to "overlay" (float over the canvas
 *                   with a backdrop). At ≥ 1100px the docked layout returns.
 *
 * Listens to `matchMedia` change events instead of polling `resize` so
 * re-renders only happen when crossing the relevant boundary.
 */
export interface Viewport {
  width: number;
  isMobile: boolean;
  isCompact: boolean;
}

const MOBILE_MAX = 640;
const COMPACT_MAX = 1100;

function readNow(): Viewport {
  if (typeof window === "undefined") {
    return { width: 1440, isMobile: false, isCompact: false };
  }
  const w = window.innerWidth;
  return { width: w, isMobile: w < MOBILE_MAX, isCompact: w < COMPACT_MAX };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => readNow());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mobileMql  = window.matchMedia(`(max-width: ${MOBILE_MAX - 1}px)`);
    const compactMql = window.matchMedia(`(max-width: ${COMPACT_MAX - 1}px)`);

    const update = () => setVp(readNow());

    mobileMql.addEventListener("change", update);
    compactMql.addEventListener("change", update);
    window.addEventListener("orientationchange", update);
    // First mount sync (in case SSR placeholder differed)
    update();

    return () => {
      mobileMql.removeEventListener("change", update);
      compactMql.removeEventListener("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return vp;
}
