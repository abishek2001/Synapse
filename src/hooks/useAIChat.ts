"use client";

import { useCallback, useRef } from "react";
import { useSessionStore } from "@/store/session";
import { useCanvasStore, ELEM_WIDTHS, type CanvasElement } from "@/store/canvas";
import { useGroundingStore } from "@/store/grounding";
import type { StreamEvent } from "@/lib/agents/types";
import type { CanvasArtifact } from "@/lib/tools/types";
import { speak, stopSpeaking } from "@/lib/voice/speech";

// ── Canvas context serializer ──────────────────────────────────────────────

function serializeCanvasContext(elements: CanvasElement[]): string {
  const artifacts = elements.filter((e) => e.artifact);
  if (artifacts.length === 0) return "";
  return artifacts
    .map((e) => `- [${e.artifact!.type}] "${e.artifact!.title}"`)
    .join("\n");
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAIChat() {
  const {
    persona,
    files,
    documentContext,
    messages,
    isStreaming,
    isSpeaking,
    isMuted,
    addMessage,
    setStreaming,
    setSpeaking,
    setFollowUpQuestions,
    setSpeakReady,
  } = useSessionStore();

  const {
    addModule,
    addElement,
    addPendingElement,
    resolvePendingElement,
    startPendingModule,
    addToPendingModule,
    setPendingModuleTitle,
    clearPendingModule,
    addToast,
    updateToast,
    removeToast,
    elements,
  } = useCanvasStore();
  const { sessionContext, studyPlan, applyPatch } = useGroundingStore();

  // pendingId → canvas element id for skeleton resolution
  const pendingMap = useRef<Map<string, string>>(new Map());
  /** Per-turn set of element IDs created during this stream. Used at `done` to
   *  reliably gather the turn's elements regardless of how long the turn took
   *  (the old `createdAt > now-30s` filter dropped everything when generation
   *  ran longer than 30 seconds, leaving orphan ungrouped elements behind). */
  const turnElementIdsRef = useRef<Set<string>>(new Set());
  // Accumulated per-turn state
  const moduleTitleRef = useRef<string>("");
  const writtenTextRef = useRef<string>("");
  const spokenTextRef  = useRef<string>("");
  const questionsRef   = useRef<string[]>([]);
  // Aborts the in-flight /api/chat fetch when the user clicks Stop.
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      if (isSpeaking) {
        stopSpeaking();
        useSessionStore.getState().setSpeaking(false);
      }

      setFollowUpQuestions([]);
      setSpeakReady(false);

      addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      });
      setStreaming(true);

      const canvasContext = serializeCanvasContext(elements);

      pendingMap.current.clear();
      turnElementIdsRef.current.clear();
      moduleTitleRef.current = "";
      writtenTextRef.current = "";
      spokenTextRef.current  = "";
      questionsRef.current   = [];
      startPendingModule();

      const toastId = `toast-${Date.now()}`;
      addToast({ id: toastId, artifactType: "visual", title: "Thinking…", status: "preparing" });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = messages
          .filter((m) => m.role !== "system")
          .slice(-10)
          .map((m) => ({
            role: m.role === "tutor" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          }));

        const learningMode = useSessionStore.getState().learningMode;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            query: text.trim(),
            persona,
            history,
            documentContext:
              documentContext ||
              (files.length > 0 ? `Documents: ${files.map((f) => f.name).join(", ")}` : undefined),
            canvasContext: canvasContext || undefined,
            sessionContext,
            studyPlan,
            learningMode,
          }),
        });

        if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

        updateToast(toastId, "adding");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const data = chunk.startsWith("data: ") ? chunk.slice(6) : chunk;
            if (!data.trim()) continue;
            try { handleStreamEvent(JSON.parse(data) as StreamEvent, text.trim(), toastId); }
            catch { /* malformed SSE line */ }
          }
        }

        // flush tail
        if (buffer.trim()) {
          const data = buffer.startsWith("data: ") ? buffer.slice(6) : buffer;
          try { handleStreamEvent(JSON.parse(data) as StreamEvent, text.trim(), toastId); }
          catch { /* ignore */ }
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) {
          for (const [, elId] of pendingMap.current) {
            useCanvasStore.getState().removeElement(elId);
          }
          pendingMap.current.clear();
          removeToast(toastId);
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: "Stopped.",
            timestamp: Date.now(),
          });
        } else {
          console.error("SSE chat error:", err);
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: "Something went wrong. Let me try again…",
            timestamp: Date.now(),
          });
          removeToast(toastId);
        }
        clearPendingModule();
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [
      isStreaming, isSpeaking, isMuted, messages, persona, files, documentContext,
      addMessage, setStreaming, setSpeaking, setFollowUpQuestions, setSpeakReady,
      addModule, addElement, addPendingElement, resolvePendingElement,
      startPendingModule, clearPendingModule,
      addToast, updateToast, removeToast, elements, sessionContext, studyPlan, applyPatch,
    ],
  );

  // ── Event handler ─────────────────────────────────────────────────────────

  const handleStreamEvent = useCallback(
    (event: StreamEvent, userQuery: string, toastId: string) => {
      switch (event.type) {

        case "thinking":
          break;

        case "artifact_pending": {
          const w = ELEM_WIDTHS[event.artifactType] ?? 360;
          const allEls = useCanvasStore.getState().elements;
          const rightEdge = allEls.reduce((max, e) => Math.max(max, e.x + e.w), 80);
          const elId = `el-pending-${event.pendingId}`;
          pendingMap.current.set(event.pendingId, elId);
          turnElementIdsRef.current.add(elId);
          addPendingElement({
            id: elId,
            type: event.artifactType as import("@/store/canvas").ElementType,
            x: rightEdge + 80,
            y: 200,
            w,
            zIndex: allEls.length + 10,
            createdAt: Date.now(),
          });
          addToPendingModule(elId);
          break;
        }

        case "artifact_done": {
          const elId = pendingMap.current.get(event.pendingId);
          if (elId) {
            resolvePendingElement(elId, event.artifact as CanvasArtifact);
            pendingMap.current.delete(event.pendingId);
          }
          break;
        }

        case "tutor_response": {
          // Store for TTS and module building
          moduleTitleRef.current = event.moduleTitle;
          writtenTextRef.current = event.writtenText;
          spokenTextRef.current  = event.spokenText;
          questionsRef.current   = event.questionsForUser;

          // Surface the title on the in-flight pending-module boundary so the
          // user sees what's being generated while artifacts continue to stream.
          if (event.moduleTitle) setPendingModuleTitle(event.moduleTitle);

          // Add to transcript (writtenText)
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: event.writtenText,
            timestamp: Date.now(),
          });

          // Show AI's direct questions as tier-1 chips immediately
          if (event.questionsForUser.length > 0) {
            // Prepend to followUpQuestions so they appear first (tier-1 takes priority)
            const current = useSessionStore.getState().followUpQuestions;
            useSessionStore.getState().setFollowUpQuestions([
              ...event.questionsForUser,
              ...current,
            ]);
          }
          break;
        }

        case "follow_up": {
          // Strategy agent suggestions — tier 2, append after tutor questions
          const current = useSessionStore.getState().followUpQuestions;
          const all = [...current, ...event.questions];
          // Deduplicate
          const seen = new Set<string>();
          const deduped = all.filter((q) => { if (seen.has(q)) return false; seen.add(q); return true; });
          useSessionStore.getState().setFollowUpQuestions(deduped);
          break;
        }

        case "pause_for_input":
          break;

        case "done": {
          const patch = event.contextPatch;
          if (patch && sessionContext) applyPatch(patch);

          // Clean up any unresolved pending elements (stream errored mid-generation
          // for that artifact). Their IDs are still in the turn set, so filter them
          // out below by checking `!pending`.
          for (const [, elId] of pendingMap.current) {
            useCanvasStore.getState().removeElement(elId);
            turnElementIdsRef.current.delete(elId);
          }
          pendingMap.current.clear();

          // Use the per-turn element-id set (NOT a 30-second time window) to find
          // the elements this turn produced. Time-window filtering caused modules
          // that took longer than 30s to lose all their artifacts and end up
          // ungrouped on the canvas.
          const turnIds = turnElementIdsRef.current;
          const freshEls = useCanvasStore.getState().elements.filter(
            (e) => turnIds.has(e.id) && !e.pending && e.artifact,
          );
          const resolvedArtifacts = freshEls.map((e) => e.artifact!);

          // Remove individually-placed pending-resolved elements (they'll be
          // re-created inside the new group with proper layout).
          for (const el of freshEls) {
            useCanvasStore.getState().removeElement(el.id);
          }

          // Build grouped module — prefer AI-generated title, fall back to user query
          const label = moduleTitleRef.current ||
            (userQuery.length > 50 ? userQuery.slice(0, 50) + "…" : userQuery);
          if (resolvedArtifacts.length > 0 || writtenTextRef.current) {
            addModule(
              label,
              resolvedArtifacts,
              undefined,
              writtenTextRef.current || undefined,
            );
          }

          // Annotations (canvas_delegate_task)
          // (handled by addElement calls in the tool call results — no change needed)

          // Delayed speech
          if (spokenTextRef.current && !isMuted) {
            setSpeakReady(true);
          }

          turnElementIdsRef.current.clear();
          clearPendingModule();
          updateToast(toastId, "done");
          setTimeout(() => removeToast(toastId), 1500);
          break;
        }

        case "error": {
          console.error("Stream error:", event.message);
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: "Something went wrong. Let me try again…",
            timestamp: Date.now(),
          });
          removeToast(toastId);
          clearPendingModule();
          break;
        }
      }
    },
    [
      addMessage, addPendingElement, resolvePendingElement, addModule,
      addToPendingModule, setPendingModuleTitle, clearPendingModule,
      removeToast, updateToast, setFollowUpQuestions, setSpeakReady,
      applyPatch, sessionContext, isMuted,
    ],
  );

  // Called when user clicks Speak button
  const speakLatest = useCallback(() => {
    const text = spokenTextRef.current;
    if (!text) return;
    setSpeakReady(false);
    setSpeaking(true);
    const { setLiveCaption } = useSessionStore.getState();
    speak(
      text,
      () => {
        setSpeaking(false);
        setLiveCaption("");
      },
      (word) => setLiveCaption(word),
    );
  }, [setSpeaking, setSpeakReady]);

  // Cancel the in-flight chat request. Server-side OpenAI calls receive the
  // aborted signal and short-circuit; client-side we tear down skeletons +
  // toast in the catch block above.
  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (isSpeaking) {
      stopSpeaking();
      setSpeaking(false);
    }
  }, [isSpeaking, setSpeaking]);

  const latestTutor = [...messages].reverse().find((m) => m.role === "tutor");

  return { sendMessage, stop, speakLatest, isStreaming, latestTutor };
}
