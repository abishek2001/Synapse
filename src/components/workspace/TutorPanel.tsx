"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  ChevronUp,
  ChevronDown,
  Loader2,
  Sparkles,
  Volume2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/session";
import { useCanvasStore, ELEM_WIDTHS } from "@/store/canvas";
import type { CanvasArtifact } from "@/lib/tools/types";
import { speak, stopSpeaking } from "@/lib/voice/speech";
import { useGroundingStore } from "@/store/grounding";

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|"[^"]+"|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="px-1 py-0.5 bg-white/10 rounded text-[12px]">{part.slice(1, -1)}</code>;
    if (part.startsWith('"') && part.endsWith('"'))
      return <span key={i} className="font-medium">{part}</span>;
    return part;
  });
}

const TOAST_LABELS: Record<string, string> = {
  visual: "diagram",
  graph: "graph",
  notation: "notation",
  flashcard: "flashcards",
  lookup: "lookup",
  simulation: "simulation",
};

export default function TutorPanel() {
  const {
    query,
    persona,
    files,
    documentContext,
    messages,
    isStreaming,
    isSpeaking,
    isMuted,
    pendingVoiceText,
    addMessage,
    setStreaming,
    setSpeaking,
    setPendingVoiceText,
  } = useSessionStore();

  const { addModule, addElement, addUpdate, elements } = useCanvasStore();
  const { studyPlan, sessionContext, updateContext } = useGroundingStore();

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [autoSpeak] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, showHistory]);

  useEffect(() => {
    if (initialized.current || !query) return;
    if (files.length > 0 && !documentContext) return;
    initialized.current = true;

    if (files.length > 0) {
      addMessage({
        id: "sys-files",
        role: "system",
        content: `${files.length} document${files.length > 1 ? "s" : ""} loaded`,
        timestamp: Date.now(),
      });
    }

    const greeting = files.length > 0
      ? `Hey! I've loaded your material on "${query}". I've set up the canvas and I'm ready to build an interactive learning space for you. Say "begin" when you're ready, or ask me anything specific!`
      : `Hey! I'm Synapse. Today we're exploring "${query}". I'll create visuals, equations, and diagrams on the canvas as we go. Say "begin" when you're ready, or ask me anything!`;

    addMessage({
      id: "welcome",
      role: "tutor",
      content: greeting,
      timestamp: Date.now(),
    });

    if (autoSpeak && !isMuted) {
      setTimeout(() => {
        setSpeaking(true);
        speak(greeting, { persona, onEnd: () => setSpeaking(false) });
      }, 800);
    }
  }, [query, files, documentContext, addMessage, autoSpeak, isMuted, setSpeaking]);

  const processArtifacts = useCallback(
    async (artifacts: CanvasArtifact[], userQuery: string) => {
      if (artifacts.length === 0) return;

      const types = [...new Set(artifacts.map((a) => a.type))];
      const turnId = `turn-${Date.now()}`;
      const label = types.map((t) => TOAST_LABELS[t] || t).join(" & ");
      addUpdate({
        id: `upd-prep-${turnId}`,
        type: "artifact_generating",
        title: `Preparing ${label}`,
        detail: `${artifacts.length} artifact${artifacts.length !== 1 ? "s" : ""}`,
        timestamp: Date.now(),
      });

      await new Promise((r) => setTimeout(r, 800));

      await new Promise((r) => setTimeout(r, 600));
      const moduleTitle =
        userQuery.length > 50 ? userQuery.slice(0, 50) + "..." : userQuery;
      addModule(moduleTitle, artifacts);
    },
    [addModule, addUpdate],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

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

        let strategyHint: string | undefined;
        if (sessionContext) {
          try {
            const stratRes = await fetch("/api/strategy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "decide",
                userMessage: text.trim(),
                sessionContext,
                studyPlan,
                recentHistory: history.slice(-6),
              }),
            });
            if (stratRes.ok) {
              const stratData = await stratRes.json();
              const d = stratData.decision;
              if (d) {
                strategyHint = `Action: ${d.action}. ${d.reasoning} ${d.suggestedPrompt}`;
                if (d.conceptsToTrack?.length) {
                  updateContext({
                    ...sessionContext,
                    questionsAsked: sessionContext.questionsAsked + 1,
                    lastActivityAt: Date.now(),
                  });
                }
                if (d.shouldAdvanceModule) {
                  updateContext({
                    ...sessionContext,
                    currentModuleIndex: Math.min(
                      sessionContext.currentModuleIndex + 1,
                      sessionContext.totalModules - 1,
                    ),
                  });
                }
              }
            }
          } catch {
            // strategy is best-effort
          }
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: text.trim(),
            persona,
            history,
            documentContext:
              documentContext ||
              (files.length > 0
                ? `Documents: ${files.map((f) => f.name).join(", ")}`
                : undefined),
            mode: "tutor",
            strategyHint,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "API error");
        }

        const data = await res.json();

        if (data.tutor) {
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: data.tutor.explanation,
            timestamp: Date.now(),
          });

          if (autoSpeak && !isMuted) {
            setSpeaking(true);
            speak(data.tutor.explanation, { persona, onEnd: () => setSpeaking(false) });
          }
        }

        if (data.artifacts?.length > 0) {
          processArtifacts(data.artifacts, text.trim());
          if (sessionContext) {
            updateContext({
              ...sessionContext,
              artifactsGenerated: sessionContext.artifactsGenerated + data.artifacts.length,
            });
          }
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
      } catch {
        addMessage({
          id: crypto.randomUUID(),
          role: "tutor",
          content: "Something went wrong. Let me try again...",
          timestamp: Date.now(),
        });
      } finally {
        setStreaming(false);
      }
    },
    [
      isStreaming,
      messages,
      persona,
      files,
      documentContext,
      autoSpeak,
      isMuted,
      addMessage,
      setStreaming,
      setSpeaking,
      processArtifacts,
      sessionContext,
      studyPlan,
      updateContext,
      addElement,
      elements,
    ],
  );

  useEffect(() => {
    if (pendingVoiceText && !isStreaming) {
      if (isSpeaking) {
        stopSpeaking();
        setSpeaking(false);
      }
      sendMessage(pendingVoiceText);
      setPendingVoiceText(null);
    }
  }, [pendingVoiceText, isStreaming, isSpeaking, sendMessage, setPendingVoiceText, setSpeaking]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  const latestTutor = [...messages].reverse().find((m) => m.role === "tutor");
  const latestUser = [...messages].reverse().find((m) => m.role === "user");

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center pointer-events-none pb-5 px-4">
      <div className="pointer-events-auto w-full max-w-2xl flex flex-col items-center">
        {/* Expanded history overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, y: 20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 20, height: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full mb-3 overflow-hidden"
            >
              <div
                ref={scrollRef}
                className="max-h-[45vh] overflow-y-auto bg-white/95 backdrop-blur-2xl rounded-2xl border border-black/[0.06] shadow-xl p-4 space-y-3"
              >
                {messages.map((msg) => {
                  if (msg.role === "system") {
                    return (
                      <div key={msg.id} className="text-center">
                        <span className="text-[10px] text-black/20 font-medium">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }
                  const isUser = msg.role === "user";
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`text-[13px] leading-relaxed rounded-2xl px-4 py-2.5 max-w-[80%] ${
                          isUser
                            ? "bg-black/[0.05] text-black/75"
                            : "bg-black/[0.02] text-black/65"
                        }`}
                      >
                        {renderInlineMarkdown(msg.content)}
                      </div>
                    </motion.div>
                  );
                })}
                {isStreaming && (
                  <div className="flex items-center gap-2 px-2">
                    <Loader2 className="w-3 h-3 animate-spin text-black/20" />
                    <span className="text-[10px] text-black/20">Thinking...</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Latest conversation bubble (tutor message) */}
        <AnimatePresence mode="wait">
          {latestTutor && !showHistory && (
            <motion.div
              key={latestTutor.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="w-full mb-3"
            >
              {/* User's last question (small) */}
              {latestUser && (
                <div className="flex justify-end mb-2">
                  <div className="text-[12px] text-black/50 bg-black/[0.04] rounded-xl px-3 py-1.5 max-w-[60%] truncate">
                    {latestUser.content}
                  </div>
                </div>
              )}

              {/* Tutor response */}
              <div className="relative">
                <div className="bg-[#1c1c1e]/[0.92] backdrop-blur-2xl text-white/90 rounded-2xl px-5 py-4 shadow-2xl">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3 text-white/50" />
                    </div>
                    <p className="text-[14px] leading-relaxed flex-1">
                      {renderInlineMarkdown(latestTutor.content)}
                    </p>
                    {!isSpeaking && (
                      <button
                        onClick={() => {
                          setSpeaking(true);
                          speak(latestTutor.content, { persona, onEnd: () => setSpeaking(false) });
                        }}
                        className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0 text-white/30 hover:text-white/70 hover:bg-white/[0.15] transition-all"
                        title="Listen"
                      >
                        <Volume2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Streaming indicator */}
        <AnimatePresence>
          {isStreaming && !showHistory && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-3 flex items-center gap-2.5 bg-[#1c1c1e]/80 backdrop-blur-xl rounded-full px-4 py-2 shadow-lg"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />
              <span className="text-[12px] text-white/50">Synapse is thinking...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input bar */}
        <div className="w-full bg-white rounded-2xl border border-black/[0.08] shadow-lg flex items-center gap-2 px-2 py-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-black/25 hover:text-black/50 hover:bg-black/[0.04] transition-all flex-shrink-0"
            title={showHistory ? "Hide history" : "Show history"}
          >
            {showHistory ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Synapse anything..."
            className="flex-1 bg-transparent text-[14px] text-black/80 py-2.5 outline-none placeholder:text-black/25"
            disabled={isStreaming}
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center hover:bg-black/80 transition-all disabled:opacity-15 flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
