import { create } from "zustand";
import type { SceneConfig } from "@/lib/scene-types";

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
}

export interface ParsedDocument {
  name: string;
  text: string;
}

export interface Message {
  id: string;
  role: "tutor" | "user" | "system";
  content: string;
  timestamp: number;
}

interface SessionState {
  query: string;
  persona: string;
  files: UploadedFile[];
  documents: ParsedDocument[];
  documentContext: string;
  sessionId: string | null;
  canvasTitle: string | null;

  messages: Message[];
  isStreaming: boolean;

  sceneConfig: SceneConfig | null;

  isSpeaking: boolean;
  isListening: boolean;
  isMuted: boolean;
  pendingVoiceText: string | null;

  bridgeDone: boolean;
  tutorCollapsed: boolean;
  showSources: boolean;
  showCallFriend: boolean;
  voiceMode: boolean;
  liveCaption: string;

  setBridgeDone: (v: boolean) => void;
  initSession: (query: string, persona: string, files: UploadedFile[]) => void;
  setDocuments: (docs: ParsedDocument[]) => void;
  setCanvasTitle: (title: string) => void;
  addMessage: (msg: Message) => void;
  setStreaming: (v: boolean) => void;
  setSceneConfig: (config: SceneConfig | null) => void;
  setSpeaking: (v: boolean) => void;
  setListening: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setPendingVoiceText: (text: string | null) => void;
  setTutorCollapsed: (v: boolean) => void;
  setShowSources: (v: boolean) => void;
  setShowCallFriend: (v: boolean) => void;
  setVoiceMode: (v: boolean) => void;
  setLiveCaption: (text: string) => void;
  reset: () => void;
}

const initialState = {
  query: "",
  persona: "professor",
  files: [] as UploadedFile[],
  documents: [] as ParsedDocument[],
  documentContext: "",
  sessionId: null as string | null,
  canvasTitle: null as string | null,
  messages: [] as Message[],
  isStreaming: false,
  sceneConfig: null as SceneConfig | null,
  isSpeaking: false,
  isListening: false,
  isMuted: false,
  pendingVoiceText: null as string | null,
  bridgeDone: false,
  tutorCollapsed: false,
  showSources: false,
  showCallFriend: false,
  voiceMode: false,
  liveCaption: "",
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  initSession: (query, persona, files) =>
    set({
      query,
      persona,
      files,
      documents: [],
      documentContext: "",
      sessionId: crypto.randomUUID(),
      messages: [],
      sceneConfig: null,
      showSources: files.length > 0,
    }),

  setDocuments: (docs) =>
    set({
      documents: docs,
      documentContext: docs
        .map((d) => `=== ${d.name} ===\n${d.text}`)
        .join("\n\n"),
    }),

  setCanvasTitle: (canvasTitle) => set({ canvasTitle }),

  addMessage: (msg) =>
    set((s) => {
      // Don't add if exact same ID already exists
      if (s.messages.some((m) => m.id === msg.id)) return s;
      // Don't add if same role + content as the very last message (retry spam guard)
      const last = s.messages[s.messages.length - 1];
      if (last && last.role === msg.role && last.content === msg.content) return s;
      return { messages: [...s.messages, msg] };
    }),

  setBridgeDone: (bridgeDone) => set({ bridgeDone }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setSceneConfig: (sceneConfig) => set({ sceneConfig }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setListening: (isListening) => set({ isListening }),
  setMuted: (isMuted) => set({ isMuted }),
  setPendingVoiceText: (pendingVoiceText) => set({ pendingVoiceText }),
  setTutorCollapsed: (tutorCollapsed) => set({ tutorCollapsed }),
  setShowSources: (showSources) => set({ showSources }),
  setShowCallFriend: (showCallFriend) => set({ showCallFriend }),
  setVoiceMode: (voiceMode) => set({ voiceMode }),
  setLiveCaption: (liveCaption) => set({ liveCaption }),
  reset: () => set(initialState),
}));
