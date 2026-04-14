"use client";

import { useCallback, useRef } from "react";
import { useSessionStore } from "@/store/session";
import { useCanvasStore, ELEM_WIDTHS } from "@/store/canvas";
import { useGroundingStore } from "@/store/grounding";
import type { CanvasArtifact } from "@/lib/tools/types";
import { speak, stopSpeaking } from "@/lib/voice/speech";

const TOAST_LABELS: Record<string, string> = {
  visual: "diagram",
  graph: "graph",
  notation: "notation",
  flashcard: "flashcards",
  lookup: "lookup",
  simulation: "simulation",
};

export function useAIChat() {
  const {
    query,
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
  } = useSessionStore();

  const { addModule, addElement, addToast, updateToast, removeToast, elements } = useCanvasStore();
  const { sessionContext, studyPlan, applyPatch } = useGroundingStore();

  const autoSpeak = useRef(true);

  const processArtifacts = useCallback(
    async (artifacts: CanvasArtifact[], userQuery: string) => {
      if (artifacts.length === 0) return;

      const types = [...new Set(artifacts.map((a) => a.type))];
      const toastId = `toast-${Date.now()}`;
      const label = types.map((t) => TOAST_LABELS[t] || t).join(" & ");
      addToast({ id: toastId, artifactType: types[0], title: `Preparing ${label}`, status: "preparing" });

      await new Promise((r) => setTimeout(r, 800));
      updateToast(toastId, "adding");

      await new Promise((r) => setTimeout(r, 600));
      const moduleTitle = userQuery.length > 50 ? userQuery.slice(0, 50) + "..." : userQuery;
      addModule(moduleTitle, artifacts);

      updateToast(toastId, "done");
      setTimeout(() => removeToast(toastId), 1500);
    },
    [addModule, addToast, updateToast, removeToast],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      if (isSpeaking) {
        stopSpeaking();
        useSessionStore.getState().setSpeaking(false);
      }

      addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      });
      setStreaming(true);

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
              documentContext || (files.length > 0 ? `Documents: ${files.map((f) => f.name).join(", ")}` : undefined),
            sessionContext,
            studyPlan,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "API error");
        }

        const data = await res.json();

        const explanation: string =
          data.tutor?.explanation || data.friend?.analogy || data.rawResponse || "";

        if (explanation) {
          const isFriend = data.type === "friend";
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: isFriend ? `💡 ${explanation}` : explanation,
            timestamp: Date.now(),
          });

          if (autoSpeak.current && !isMuted) {
            setSpeaking(true);
            speak(explanation, () => setSpeaking(false));
          }
        }

        if (data.artifacts?.length > 0) {
          processArtifacts(data.artifacts, text.trim());
        }

        if (data.canvasAnnotations?.length > 0) {
          for (const ann of data.canvasAnnotations) {
            const isSticky = ann.type === "sticky";
            const pos = ann.position ?? { x: 80, y: 400 };
            addElement({
              id: `el-ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              type: isSticky ? "sticky" : "text",
              x: pos.x, y: pos.y,
              w: isSticky ? ELEM_WIDTHS.sticky : ELEM_WIDTHS.text,
              zIndex: elements.length + 20,
              createdAt: Date.now(),
              ...(isSticky
                ? { sticky: { content: ann.content, color: ann.color ?? "#fef08a" } }
                : { text: { content: ann.content, style: "body" as const, color: ann.color } }),
            });
          }
        }

        if (data.contextPatch && sessionContext) {
          applyPatch(data.contextPatch);
        }
      } catch {
        addMessage({ id: crypto.randomUUID(), role: "tutor", content: "Something went wrong. Let me try again...", timestamp: Date.now() });
      } finally {
        setStreaming(false);
      }
    },
    [
      isStreaming, isSpeaking, isMuted, messages, persona, files, documentContext,
      addMessage, setStreaming, setSpeaking, processArtifacts, sessionContext, studyPlan, applyPatch, addElement, elements,
    ],
  );

  const latestTutor = [...messages].reverse().find((m) => m.role === "tutor");

  return { sendMessage, isStreaming, latestTutor, query };
}
