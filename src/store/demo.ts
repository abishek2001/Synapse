import { create } from "zustand";
import { playDemoModule, type PlayModuleHandle } from "@/lib/demos/playback";
import type { DemoScript } from "@/lib/demos/types";
import { useCanvasStore } from "@/store/canvas";
import { useSessionStore } from "@/store/session";

interface DemoState {
  /** The active script, or null if no demo is running. */
  script: DemoScript | null;
  /** Index of the most recently played module (-1 = nothing yet). */
  currentModuleIdx: number;
  /** True while a module is actively unfolding (skeletons → resolution → TTS). */
  isPlaying: boolean;
  /** Group id of the most recently landed module — used to anchor the next one. */
  prevGroupId: string | null;
  /** Pre-typed prompt sitting in the input bar. The user clicks Send to play
   *  the next module. Cleared while a module is streaming and after advance. */
  queuedPrompt: string | null;
  /** Set by the landing page when a keyword matched a demo. The workspace
   *  consumes this on mount to auto-start the demo (and skip the bridge). */
  pendingScriptId: string | null;

  /** Kick off a demo from scratch. Clears the canvas and plays module 0;
   *  on completion, queues module 1's prompt in the input bar (if any). */
  start: (script: DemoScript) => void;
  /** Play the next module. Called by the input bar when the user submits the
   *  queued prompt. */
  advance: () => void;
  /** Cancel the in-flight playback and reset state. */
  stop: () => void;

  /** Landing-page handoff. */
  queueScript: (scriptId: string) => void;
  consumePending: () => string | null;
}

let handle: PlayModuleHandle | null = null;

export const useDemoStore = create<DemoState>((set, get) => {
  /** Play a single module of the active script and update store state when it
   *  lands. Internal — used by both `start` (module 0) and `advance` (module N). */
  const playModule = (
    script: DemoScript,
    moduleIdx: number,
    prevGroupId: string | null,
  ) => {
    const mod = script.modules[moduleIdx];
    if (!mod) return;
    set({ isPlaying: true, queuedPrompt: null, currentModuleIdx: moduleIdx });

    handle?.abort();
    handle = playDemoModule({
      script,
      module: mod,
      moduleIdx,
      prevGroupId,
      seedUserMessage: moduleIdx === 0,
    });

    handle.done.then((res) => {
      // Bail if the user already started a different demo or stopped this one.
      const cur = get();
      if (cur.script?.id !== script.id || cur.currentModuleIdx !== moduleIdx) {
        return;
      }
      handle = null;
      const isLast = moduleIdx >= script.modules.length - 1;
      const nextPrompt = mod.nextPrompt && !isLast ? mod.nextPrompt : null;
      set({
        isPlaying: false,
        prevGroupId: res.groupId ?? prevGroupId,
        queuedPrompt: nextPrompt,
      });
      if (isLast) {
        // Demo wrapped up — clear active state but leave the canvas alone so
        // the user can keep poking around.
        set({ script: null, currentModuleIdx: -1, queuedPrompt: null });
      }
    });
  };

  return {
    script: null,
    currentModuleIdx: -1,
    isPlaying: false,
    prevGroupId: null,
    queuedPrompt: null,
    pendingScriptId: null,

    start: (script) => {
      handle?.abort();
      handle = null;
      useCanvasStore.getState().clearCanvas();
      // Reset the session so the activity feed / messages feel fresh.
      const sess = useSessionStore.getState();
      sess.setLearningMode("guided");
      set({
        script,
        currentModuleIdx: -1,
        prevGroupId: null,
        queuedPrompt: null,
        pendingScriptId: null,
      });
      playModule(script, 0, null);
    },

    advance: () => {
      const { script, currentModuleIdx, prevGroupId, isPlaying } = get();
      if (!script || isPlaying) return;
      const next = currentModuleIdx + 1;
      if (next >= script.modules.length) return;
      playModule(script, next, prevGroupId);
    },

    stop: () => {
      handle?.abort();
      handle = null;
      set({
        script: null,
        currentModuleIdx: -1,
        isPlaying: false,
        prevGroupId: null,
        queuedPrompt: null,
        pendingScriptId: null,
      });
    },

    queueScript: (scriptId) => set({ pendingScriptId: scriptId }),
    consumePending: () => {
      const id = get().pendingScriptId;
      if (id) set({ pendingScriptId: null });
      return id;
    },
  };
});
