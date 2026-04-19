import { create } from "zustand";

export type ModuleTimelineDock = "tl" | "tc" | "tr" | "bl" | "bc" | "br";

interface DoubtPopup {
  worldX: number;
  worldY: number;
  prefill?: string;
  /** Group the popup was opened from (selection / context menu / nearest group). */
  originGroupId?: string;
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
  /** Whether the top-center ModuleTimeline pill is currently expanded (hovered). Other
   *  top-anchored overlays (canvas toasts) read this and shift down to avoid overlap. */
  moduleTimelineExpanded: boolean;
  /** Where the ModuleTimeline floats. One of six anchor positions. Persisted to localStorage. */
  moduleTimelineDock: ModuleTimelineDock;
  /** Whether the timeline is collapsed to a small circle (only the progress ring is visible). */
  moduleTimelineMinimized: boolean;

  toggleDarkMode: () => void;
  setLeftSidebarOpen: (v: boolean) => void;
  setRightSidebarOpen: (v: boolean) => void;
  setTranscriptExpanded: (v: boolean) => void;
  setUpdatesExpanded: (v: boolean) => void;
  openDoubtPopup: (
    worldX: number,
    worldY: number,
    prefill?: string,
    originGroupId?: string,
  ) => void;
  closeDoubtPopup: () => void;
  openContextMenu: (state: ContextMenuState) => void;
  closeContextMenu: () => void;
  setCanvasScale: (v: number) => void;
  highlightSource: (source: string) => void;
  clearHighlightedSource: () => void;
  setModuleTimelineExpanded: (v: boolean) => void;
  setModuleTimelineDock: (dock: ModuleTimelineDock) => void;
  setModuleTimelineMinimized: (v: boolean) => void;
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
  moduleTimelineExpanded: false,
  moduleTimelineDock: (typeof window !== "undefined"
    ? (localStorage.getItem("synapse:moduleTimelineDock") as ModuleTimelineDock | null)
    : null) ?? "tc",
  moduleTimelineMinimized: typeof window !== "undefined"
    ? localStorage.getItem("synapse:moduleTimelineMin") === "1"
    : false,

  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setLeftSidebarOpen: (leftSidebarOpen) => set({ leftSidebarOpen }),
  setRightSidebarOpen: (rightSidebarOpen) => set({ rightSidebarOpen }),
  setTranscriptExpanded: (transcriptExpanded) => set({ transcriptExpanded }),
  setUpdatesExpanded: (updatesExpanded) => set({ updatesExpanded }),
  openDoubtPopup: (worldX, worldY, prefill, originGroupId) =>
    set({ doubtPopup: { worldX, worldY, prefill, originGroupId } }),
  closeDoubtPopup: () => set({ doubtPopup: null }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  setCanvasScale: (canvasScale) => set({ canvasScale }),
  highlightSource: (source) => set({ highlightedSource: source, highlightedSourceTs: Date.now() }),
  clearHighlightedSource: () => set({ highlightedSource: null }),
  setModuleTimelineExpanded: (moduleTimelineExpanded) => set({ moduleTimelineExpanded }),
  setModuleTimelineDock: (moduleTimelineDock) => {
    if (typeof window !== "undefined") localStorage.setItem("synapse:moduleTimelineDock", moduleTimelineDock);
    set({ moduleTimelineDock });
  },
  setModuleTimelineMinimized: (moduleTimelineMinimized) => {
    if (typeof window !== "undefined") localStorage.setItem("synapse:moduleTimelineMin", moduleTimelineMinimized ? "1" : "0");
    set({ moduleTimelineMinimized });
  },
}));
