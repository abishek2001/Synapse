import { create } from "zustand";
import type { StudyPlan } from "@/lib/grounding/study-plan";
import type { SessionContext, ConceptState } from "@/lib/grounding/session-context";
import type { SessionContextPatch } from "@/lib/agents/types";

interface GroundingState {
  studyPlan: StudyPlan | null;
  sessionContext: SessionContext | null;
  retrievalIndexed: boolean;
  indexedChunks: number;

  setStudyPlan: (plan: StudyPlan) => void;
  setSessionContext: (ctx: SessionContext) => void;
  updateContext: (ctx: SessionContext) => void;
  applyPatch: (patch: SessionContextPatch) => void;
  setRetrievalIndexed: (indexed: boolean, chunks: number) => void;
  reset: () => void;
}

export const useGroundingStore = create<GroundingState>((set) => ({
  studyPlan: null,
  sessionContext: null,
  retrievalIndexed: false,
  indexedChunks: 0,

  setStudyPlan: (studyPlan) => set({ studyPlan }),

  setSessionContext: (sessionContext) => set({ sessionContext }),

  updateContext: (sessionContext) => set({ sessionContext }),

  applyPatch: (patch) =>
    set((state) => {
      if (!state.sessionContext) return state;
      const { conceptUpdates, ...directPatch } = patch;
      const merged: SessionContext = { ...state.sessionContext, ...directPatch };

      if (conceptUpdates && Object.keys(conceptUpdates).length > 0) {
        const nextStates: Record<string, ConceptState> = { ...merged.conceptStates };
        for (const [name, level] of Object.entries(conceptUpdates)) {
          const existing = nextStates[name];
          nextStates[name] = {
            name,
            level,
            confusionCount: existing?.confusionCount ?? 0,
            lastMentioned: Date.now(),
          };
        }
        merged.conceptStates = nextStates;
      }

      return { sessionContext: merged };
    }),

  setRetrievalIndexed: (retrievalIndexed, indexedChunks) =>
    set({ retrievalIndexed, indexedChunks }),

  reset: () =>
    set({
      studyPlan: null,
      sessionContext: null,
      retrievalIndexed: false,
      indexedChunks: 0,
    }),
}));
