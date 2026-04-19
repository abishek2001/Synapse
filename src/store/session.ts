import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
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
  urls: string[];           // URLs submitted alongside the query
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

  tutorCollapsed: boolean;
  showSources: boolean;
  showCallFriend: boolean;
  voiceMode: boolean;
  liveCaption: string;
  followUpQuestions: string[];
  speakReady: boolean; // explanation is ready but TTS hasn't auto-played — user clicks Speak

  docHeadings: string[];

  initSession: (query: string, persona: string, files: UploadedFile[], urls?: string[]) => void;
  setDocuments: (docs: ParsedDocument[]) => void;
  setDocHeadings: (headings: string[]) => void;
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
  setFollowUpQuestions: (questions: string[]) => void;
  setSpeakReady: (v: boolean) => void;
  moduleQueue: string[];
  setModuleQueue: (queue: string[]) => void;
  shiftModuleQueue: () => void;
  reset: () => void;
}

const initialState = {
  query: "",
  persona: "professor",
  files: [] as UploadedFile[],
  urls: [] as string[],
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
  tutorCollapsed: false,
  showSources: false,
  showCallFriend: false,
  voiceMode: false,
  liveCaption: "",
  followUpQuestions: [] as string[],
  speakReady: false,
  docHeadings: [] as string[],
  moduleQueue: [] as string[],
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
  ...initialState,

  initSession: (query, persona, files, urls = []) =>
    set({
      query,
      persona,
      files,
      urls,
      documents: [],
      documentContext: "",
      sessionId: crypto.randomUUID(),
      canvasTitle: null,
      messages: [],
      sceneConfig: null,
      followUpQuestions: [],
      moduleQueue: [],
      showSources: files.length > 0 || urls.length > 0,
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
  setFollowUpQuestions: (followUpQuestions) => set({ followUpQuestions }),
  setSpeakReady: (speakReady) => set({ speakReady }),
  setDocHeadings: (docHeadings) => set({ docHeadings }),
  setModuleQueue: (moduleQueue) => set({ moduleQueue }),
  shiftModuleQueue: () => set((s) => ({ moduleQueue: s.moduleQueue.slice(1) })),
  reset: () => set(initialState),
    }),
    {
      name: "synapse-session",
      storage: createJSONStorage(() => localStorage),
      // Persist conversation context; exclude large binary/text payloads and transient UI
      partialize: (s) => ({
        query: s.query,
        persona: s.persona,
        sessionId: s.sessionId,
        canvasTitle: s.canvasTitle,
        messages: s.messages,
        urls: s.urls,
        followUpQuestions: s.followUpQuestions,
        docHeadings: s.docHeadings,
      }),
    },
  ),
);
