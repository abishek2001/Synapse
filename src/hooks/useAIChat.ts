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
    addToast,
    updateToast,
    removeToast,
    elements,
  } = useCanvasStore();
  const { sessionContext, studyPlan, applyPatch } = useGroundingStore();

  // pendingId → canvas element id for skeleton resolution
  const pendingMap = useRef<Map<string, string>>(new Map());
  // Accumulated per-turn state
  const moduleTitleRef = useRef<string>("");
  const writtenTextRef = useRef<string>("");
  const spokenTextRef  = useRef<string>("");
  const questionsRef   = useRef<string[]>([]);

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
      moduleTitleRef.current = "";
      writtenTextRef.current = "";
      spokenTextRef.current  = "";
      questionsRef.current   = [];

      const toastId = `toast-${Date.now()}`;
      addToast({ id: toastId, artifactType: "visual", title: "Thinking…", status: "preparing" });

      try {
        const history = messages
          .filter((m) => m.role !== "system")
          .slice(-10)
          .map((m) => ({
            role: m.role === "tutor" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        console.error("SSE chat error:", err);
        addMessage({
          id: crypto.randomUUID(),
          role: "tutor",
          content: "Something went wrong. Let me try again…",
          timestamp: Date.now(),
        });
        removeToast(toastId);
      } finally {
        setStreaming(false);
      }
    },
    [
      isStreaming, isSpeaking, isMuted, messages, persona, files, documentContext,
      addMessage, setStreaming, setSpeaking, setFollowUpQuestions, setSpeakReady,
      addModule, addElement, addPendingElement, resolvePendingElement,
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
          addPendingElement({
            id: elId,
            type: event.artifactType as import("@/store/canvas").ElementType,
            x: rightEdge + 80,
            y: 200,
            w,
            zIndex: allEls.length + 10,
            createdAt: Date.now(),
          });
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

          // Clean up any unresolved pending elements
          for (const [, elId] of pendingMap.current) {
            useCanvasStore.getState().removeElement(elId);
          }
          pendingMap.current.clear();

          // Gather all freshly-resolved artifacts from this turn (created in last 30s)
          const turnStart = Date.now() - 30_000;
          const freshEls = useCanvasStore.getState().elements.filter(
            (e) => !e.pending && e.artifact && e.createdAt > turnStart,
          );
          const resolvedArtifacts = freshEls.map((e) => e.artifact!);

          // Remove individually-placed pending-resolved elements
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
          break;
        }
      }
    },
    [
      addMessage, addPendingElement, resolvePendingElement, addModule,
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

  const latestTutor = [...messages].reverse().find((m) => m.role === "tutor");

  return { sendMessage, speakLatest, isStreaming, latestTutor };
}
