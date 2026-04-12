import { create } from "zustand";
import type { CanvasArtifact } from "@/lib/tools/types";

const MODULE_W = 340;
const MODULE_GAP = 48;
const START_X = 80;
const START_Y = 180;
const COLS = 3;

const INNER_CARD_W = 300;
const INNER_CARD_GAP = 50;
const INNER_START_X = 60;
const INNER_START_Y = 60;
const INNER_COLS = 2;

export interface CanvasModule {
  id: string;
  title: string;
  artifacts: CanvasArtifact[];
  position: { x: number; y: number };
  createdAt: number;
}

export interface CanvasAnnotation {
  id: string;
  type: "text" | "sticky";
  content: string;
  position: { x: number; y: number };
  color: string;
}

export interface ArtifactToast {
  id: string;
  artifactType: string;
  title: string;
  status: "preparing" | "adding" | "done";
}

interface CanvasState {
  modules: CanvasModule[];
  annotations: CanvasAnnotation[];
  toasts: ArtifactToast[];
  autoExpandModuleId: string | null;

  addModule: (title: string, artifacts: CanvasArtifact[]) => void;
  addArtifactToModule: (moduleId: string, artifact: CanvasArtifact) => void;
  moveModule: (id: string, x: number, y: number) => void;
  moveArtifactInModule: (moduleId: string, artifactId: string, x: number, y: number) => void;
  removeModule: (id: string) => void;
  clearModules: () => void;

  addAnnotation: (annotation: CanvasAnnotation) => void;
  moveAnnotation: (id: string, x: number, y: number) => void;
  updateAnnotation: (id: string, content: string) => void;
  removeAnnotation: (id: string) => void;

  addToast: (toast: ArtifactToast) => void;
  updateToast: (id: string, status: ArtifactToast["status"]) => void;
  removeToast: (id: string) => void;

  setAutoExpandModuleId: (id: string | null) => void;
}

function assignInnerPositions(artifacts: CanvasArtifact[]): CanvasArtifact[] {
  return artifacts.map((a, i) => {
    if (a.position) return a;
    const col = i % INNER_COLS;
    const row = Math.floor(i / INNER_COLS);
    return {
      ...a,
      position: {
        x: INNER_START_X + col * (INNER_CARD_W + INNER_CARD_GAP),
        y: INNER_START_Y + row * (260 + INNER_CARD_GAP),
      },
    };
  });
}

export const useCanvasStore = create<CanvasState>((set) => ({
  modules: [],
  annotations: [],
  toasts: [],
  autoExpandModuleId: null,

  addModule: (title, artifacts) =>
    set((s) => {
      const idx = s.modules.length;
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);

      const mod: CanvasModule = {
        id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        artifacts: assignInnerPositions(artifacts),
        position: {
          x: START_X + col * (MODULE_W + MODULE_GAP),
          y: START_Y + row * (MODULE_W * 0.65 + MODULE_GAP),
        },
        createdAt: Date.now(),
      };

      return {
        modules: [...s.modules, mod],
        autoExpandModuleId: mod.id,
      };
    }),

  addArtifactToModule: (moduleId, artifact) =>
    set((s) => ({
      modules: s.modules.map((m) => {
        if (m.id !== moduleId) return m;
        const newArtifacts = [...m.artifacts, artifact];
        return { ...m, artifacts: assignInnerPositions(newArtifacts) };
      }),
    })),

  moveModule: (id, x, y) =>
    set((s) => ({
      modules: s.modules.map((m) =>
        m.id === id ? { ...m, position: { x, y } } : m,
      ),
    })),

  moveArtifactInModule: (moduleId, artifactId, x, y) =>
    set((s) => ({
      modules: s.modules.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              artifacts: m.artifacts.map((a) =>
                a.id === artifactId ? { ...a, position: { x, y } } : a,
              ),
            }
          : m,
      ),
    })),

  removeModule: (id) =>
    set((s) => ({
      modules: s.modules.filter((m) => m.id !== id),
    })),

  clearModules: () => set({ modules: [] }),

  addAnnotation: (annotation) =>
    set((s) => ({ annotations: [...s.annotations, annotation] })),

  moveAnnotation: (id, x, y) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, position: { x, y } } : a,
      ),
    })),

  updateAnnotation: (id, content) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, content } : a,
      ),
    })),

  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    })),

  addToast: (toast) =>
    set((s) => ({ toasts: [...s.toasts, toast] })),

  updateToast: (id, status) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, status } : t)),
    })),

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setAutoExpandModuleId: (autoExpandModuleId) => set({ autoExpandModuleId }),
}));
