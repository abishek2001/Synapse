import { create } from "zustand";
import { playDemo, type PlayDemoHandle } from "@/lib/demos/playback";
import type { DemoScript } from "@/lib/demos/types";
import { useCanvasStore } from "@/store/canvas";

interface DemoState {
  /** Id of the currently-playing script, if any. */
  activeScriptId: string | null;
  isPlaying: boolean;

  /** Kick off a script. Clears the canvas first so the demo always starts fresh. */
  start: (script: DemoScript) => void;
  /** Cancel the in-flight playback. Cleanup happens inside `playDemo`. */
  stop: () => void;
}

let handle: PlayDemoHandle | null = null;

export const useDemoStore = create<DemoState>((set, get) => ({
  activeScriptId: null,
  isPlaying: false,

  start: (script) => {
    if (get().isPlaying) {
      handle?.abort();
      handle = null;
    }
    useCanvasStore.getState().clearCanvas();
    set({ activeScriptId: script.id, isPlaying: true });
    handle = playDemo(script, () => {
      handle = null;
      set({ activeScriptId: null, isPlaying: false });
    });
  },

  stop: () => {
    handle?.abort();
    handle = null;
    set({ activeScriptId: null, isPlaying: false });
  },
}));
