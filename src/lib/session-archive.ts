/**
 * Session archive — stores past sessions as snapshot blobs in localStorage.
 *
 * Architecture:
 *   synapse-session-index   →  array of metadata for the picker UI
 *   synapse-session-{id}    →  full snapshot blob for one session
 *
 * The "active" session continues to use the existing zustand `synapse-session`
 * and `synapse-canvas` keys — archives are created when a new session starts,
 * and restored by hydrating those keys from a chosen snapshot.
 */

import { useCanvasStore, type CanvasElement, type CanvasGroup, type ModuleConnection, type CanvasUpdateEvent } from "@/store/canvas";
import { useSessionStore, type Message } from "@/store/session";

const INDEX_KEY = "synapse-session-index";
const SNAPSHOT_PREFIX = "synapse-session-";

export interface SessionMeta {
  sessionId: string;
  query: string;
  persona: string;
  canvasTitle: string | null;
  createdAt: number;
  lastActive: number;
  messageCount: number;
  artifactCount: number;
  groupCount: number;
  /** Small thumbnail-sized hint of the canvas — array of {type, x, y, w} for first ~20 elements */
  thumbnail: { type: string; x: number; y: number; w: number; h: number }[];
}

export interface SessionSnapshot {
  meta: SessionMeta;
  // Session store fields
  messages: Message[];
  followUpQuestions: string[];
  docHeadings: string[];
  urls: string[];
  // Canvas store fields
  elements: CanvasElement[];
  groups: CanvasGroup[];
  connections: ModuleConnection[];
  updates: CanvasUpdateEvent[];
}

function isBrowser() {
  return typeof window !== "undefined";
}

function readIndex(): SessionMeta[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(idx: SessionMeta[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  } catch (err) {
    console.warn("[archive] failed to write index", err);
  }
}

function buildThumbnail(elements: CanvasElement[]): SessionMeta["thumbnail"] {
  return elements
    .filter((e) => e.type !== "text" && e.type !== "stroke")
    .slice(0, 24)
    .map((e) => ({ type: e.type, x: e.x, y: e.y, w: e.w, h: e.h ?? 200 }));
}

/**
 * Snapshot the currently-active session and add it to the archive.
 * Skips if there are no messages (nothing worth saving).
 */
export function archiveCurrentSession(): SessionSnapshot | null {
  if (!isBrowser()) return null;
  const session = useSessionStore.getState();
  const canvas = useCanvasStore.getState();

  // Nothing meaningful to save
  if (!session.sessionId || (session.messages.length === 0 && canvas.elements.length === 0)) {
    return null;
  }
  // Don't archive mock sessions
  if (canvas.isMockMode) return null;

  const now = Date.now();
  const meta: SessionMeta = {
    sessionId: session.sessionId,
    query: session.query || "Untitled session",
    persona: session.persona || "professor",
    canvasTitle: session.canvasTitle,
    createdAt: now,
    lastActive: now,
    messageCount: session.messages.length,
    artifactCount: canvas.elements.filter((e) => e.artifact).length,
    groupCount: canvas.groups.length,
    thumbnail: buildThumbnail(canvas.elements),
  };

  const snapshot: SessionSnapshot = {
    meta,
    messages: session.messages,
    followUpQuestions: session.followUpQuestions,
    docHeadings: session.docHeadings,
    urls: session.urls,
    elements: canvas.elements,
    groups: canvas.groups,
    connections: canvas.connections,
    updates: canvas.updates,
  };

  try {
    localStorage.setItem(SNAPSHOT_PREFIX + meta.sessionId, JSON.stringify(snapshot));
    const idx = readIndex().filter((m) => m.sessionId !== meta.sessionId);
    idx.unshift(meta);
    // Cap to most recent 50 sessions
    const trimmed = idx.slice(0, 50);
    // Delete dropped snapshots
    idx.slice(50).forEach((m) => {
      try { localStorage.removeItem(SNAPSHOT_PREFIX + m.sessionId); } catch {}
    });
    writeIndex(trimmed);
    return snapshot;
  } catch (err) {
    console.warn("[archive] failed to save snapshot", err);
    return null;
  }
}

export function listArchivedSessions(): SessionMeta[] {
  return readIndex();
}

export function loadArchivedSession(sessionId: string): SessionSnapshot | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_PREFIX + sessionId);
    if (!raw) return null;
    return JSON.parse(raw) as SessionSnapshot;
  } catch {
    return null;
  }
}

export function deleteArchivedSession(sessionId: string) {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(SNAPSHOT_PREFIX + sessionId);
    writeIndex(readIndex().filter((m) => m.sessionId !== sessionId));
  } catch {}
}

/**
 * Hydrate the active session + canvas stores from an archived snapshot.
 * Use this when the user clicks a session card on /library.
 */
export function restoreArchivedSession(sessionId: string): boolean {
  const snap = loadArchivedSession(sessionId);
  if (!snap) return false;

  // First archive whatever is currently active (so we don't lose it)
  archiveCurrentSession();

  // Hydrate session store
  useSessionStore.setState({
    sessionId: snap.meta.sessionId,
    query: snap.meta.query,
    persona: snap.meta.persona,
    canvasTitle: snap.meta.canvasTitle,
    messages: snap.messages,
    followUpQuestions: snap.followUpQuestions,
    docHeadings: snap.docHeadings,
    urls: snap.urls,
    files: [],
    documents: [],
    documentContext: "",
    isStreaming: false,
    sceneConfig: null,
    isSpeaking: false,
    isListening: false,
    isMuted: false,
    pendingVoiceText: null,
    tutorCollapsed: false,
    showSources: false,
    showCallFriend: false,
    voiceMode: false,
    liveCaption: "",
    speakReady: false,
    moduleQueue: [],
    learningMode: "guided",
  });

  // Hydrate canvas store
  useCanvasStore.setState({
    elements: snap.elements,
    groups: snap.groups,
    connections: snap.connections,
    updates: snap.updates,
    strokes: [],
    toasts: [],
    selectedElementIds: [],
    isMockMode: false,
  });

  // Bump lastActive on the meta
  const idx = readIndex();
  const updated = idx.map((m) =>
    m.sessionId === sessionId ? { ...m, lastActive: Date.now() } : m,
  );
  writeIndex(updated);

  return true;
}

/**
 * Update lastActive + counts for the currently-active session in the index
 * (called periodically so the library stays accurate).
 */
export function touchActiveSession() {
  if (!isBrowser()) return;
  const session = useSessionStore.getState();
  const canvas = useCanvasStore.getState();
  if (!session.sessionId) return;
  if (canvas.isMockMode) return;

  const idx = readIndex();
  const existing = idx.find((m) => m.sessionId === session.sessionId);
  if (!existing) {
    // First touch — create the entry
    archiveCurrentSession();
    return;
  }
  // Update meta in place + refresh snapshot
  archiveCurrentSession();
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(ts).toLocaleDateString();
}
