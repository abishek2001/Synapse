import { create } from "zustand";
import type { StudyPlan } from "@/lib/grounding/study-plan";
import type { SessionContext } from "@/lib/grounding/session-context";

interface GroundingState {
  studyPlan: StudyPlan | null;
  sessionContext: SessionContext | null;
  retrievalIndexed: boolean;
  indexedChunks: number;

  setStudyPlan: (plan: StudyPlan) => void;
  setSessionContext: (ctx: SessionContext) => void;
  updateContext: (ctx: SessionContext) => void;
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
