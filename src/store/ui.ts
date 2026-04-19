import { create } from "zustand";

interface DoubtPopup {
  worldX: number;
  worldY: number;
  prefill?: string;
}

interface ContextMenuState {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  targetModuleId?: string;
}

interface UIState {
  darkMode: boolean;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  transcriptExpanded: boolean;
  updatesExpanded: boolean;
  doubtPopup: DoubtPopup | null;
  contextMenu: ContextMenuState | null;
  /** Current canvas zoom level — synced from InfiniteCanvas.onTransformChange */
  canvasScale: number;
  /** Source string of the citation the user just clicked — drives TOC pulse/scroll. */
  highlightedSource: string | null;
  highlightedSourceTs: number;

  toggleDarkMode: () => void;
  setLeftSidebarOpen: (v: boolean) => void;
  setRightSidebarOpen: (v: boolean) => void;
  setTranscriptExpanded: (v: boolean) => void;
  setUpdatesExpanded: (v: boolean) => void;
  openDoubtPopup: (worldX: number, worldY: number, prefill?: string) => void;
  closeDoubtPopup: () => void;
  openContextMenu: (state: ContextMenuState) => void;
  closeContextMenu: () => void;
  setCanvasScale: (v: number) => void;
  highlightSource: (source: string) => void;
  clearHighlightedSource: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  darkMode: false,
  leftSidebarOpen: false,
  rightSidebarOpen: false,
  transcriptExpanded: true,
  updatesExpanded: true,
  doubtPopup: null,
  contextMenu: null,
  canvasScale: 1,
  highlightedSource: null,
  highlightedSourceTs: 0,

  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setLeftSidebarOpen: (leftSidebarOpen) => set({ leftSidebarOpen }),
  setRightSidebarOpen: (rightSidebarOpen) => set({ rightSidebarOpen }),
  setTranscriptExpanded: (transcriptExpanded) => set({ transcriptExpanded }),
  setUpdatesExpanded: (updatesExpanded) => set({ updatesExpanded }),
  openDoubtPopup: (worldX, worldY, prefill) =>
    set({ doubtPopup: { worldX, worldY, prefill } }),
  closeDoubtPopup: () => set({ doubtPopup: null }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  setCanvasScale: (canvasScale) => set({ canvasScale }),
  highlightSource: (source) => set({ highlightedSource: source, highlightedSourceTs: Date.now() }),
  clearHighlightedSource: () => set({ highlightedSource: null }),
}));
