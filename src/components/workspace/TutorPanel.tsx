"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  ChevronUp,
  ChevronDown,
  Loader2,
  Sparkles,
  Volume2,
  Compass,
  GraduationCap,
  X,
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
    bridgeDone,
    learningMode,
    pendingVoiceText,
    addMessage,
    setStreaming,
    setSpeaking,
    setPendingVoiceText,
    setLearningMode,
  } = useSessionStore();

  const { addModule, addElement, addToast, updateToast, removeToast, elements } = useCanvasStore();
  const { studyPlan, sessionContext, updateContext } = useGroundingStore();

  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [bubbleDismissed, setBubbleDismissed] = useState(false);
  const [autoSpeak] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const autoExploreStarted = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, showHistory]);

  useEffect(() => {
    if (initialized.current || !query || !bridgeDone) return;
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

    const greeting = `Hey! I'm Synapse, and I'm ready to explore "${query}" with you. How would you like to learn?`;

    addMessage({
      id: "welcome",
      role: "tutor",
      content: greeting,
      timestamp: Date.now(),
    });

    // Mode picker is shown as a special "choose" message
    addMessage({
      id: "mode-pick",
      role: "system",
      content: "__MODE_PICKER__",
      timestamp: Date.now(),
    });

    if (autoSpeak && !isMuted) {
      setTimeout(() => {
        setSpeaking(true);
        speak(greeting, () => setSpeaking(false));
      }, 800);
    }
  }, [query, files, documentContext, bridgeDone, addMessage, autoSpeak, isMuted, setSpeaking]);

  const processArtifacts = useCallback(
    async (artifacts: CanvasArtifact[], _userQuery: string, tutorExplanation?: string) => {
      if (artifacts.length === 0) return;

      const types = [...new Set(artifacts.map((a) => a.type))];
      const toastId = `toast-${Date.now()}`;
      const label = types.map((t) => TOAST_LABELS[t] || t).join(" & ");
      addToast({
        id: toastId,
        artifactType: types[0],
        title: `Preparing ${label}`,
        status: "preparing",
      });

      await new Promise((r) => setTimeout(r, 800));
      updateToast(toastId, "adding");

      await new Promise((r) => setTimeout(r, 600));

      // Derive title from artifact titles or tutor explanation, not the raw user query
      let moduleTitle: string;
      const artifactTitles = artifacts.map((a) => a.title).filter(Boolean);
      if (artifactTitles.length > 0) {
        moduleTitle = artifactTitles[0];
        if (artifactTitles.length > 1) moduleTitle += ` + ${artifactTitles.length - 1} more`;
      } else if (tutorExplanation) {
        const firstSentence = tutorExplanation.split(/[.!?]/)[0]?.trim() || "";
        moduleTitle = firstSentence.length > 60 ? firstSentence.slice(0, 57) + "..." : firstSentence;
      } else {
        moduleTitle = label;
      }

      addModule(moduleTitle, artifacts);
      updateToast(toastId, "done");
      setTimeout(() => removeToast(toastId), 1500);
    },
    [addModule, addToast, updateToast, removeToast],
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
          .slice(-12)
          .map((m) => ({
            role: m.role === "tutor" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          }));

        // Strategy agent — only for guided mode with existing session context
        let strategyHint: string | undefined;
        if (sessionContext && learningMode === "guided") {
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
                strategyHint = `${d.action}: ${d.suggestedPrompt}`;
                updateContext({
                  ...sessionContext,
                  questionsAsked: sessionContext.questionsAsked + 1,
                  lastActivityAt: Date.now(),
                  currentModuleIndex: d.shouldAdvanceModule
                    ? Math.min(sessionContext.currentModuleIndex + 1, sessionContext.totalModules - 1)
                    : sessionContext.currentModuleIndex,
                });
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
            learningMode,
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
            speak(data.tutor.explanation, () => setSpeaking(false));
          }
        }

        if (data.artifacts?.length > 0) {
          processArtifacts(data.artifacts, text.trim(), data.tutor?.explanation);
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
      learningMode,
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

  // Auto-explore mode: AI teaches the full topic without user intervention
  useEffect(() => {
    if (learningMode !== "auto" || autoExploreStarted.current || !bridgeDone || isStreaming) return;
    autoExploreStarted.current = true;

    const autoPrompt = files.length > 0
      ? `Teach me everything about "${query}" using my uploaded material. Cover all the key concepts with visuals and equations on the canvas.`
      : `Teach me everything about "${query}". Cover all the key concepts with visuals and equations on the canvas.`;

    sendMessage(autoPrompt);
  }, [learningMode, bridgeDone, isStreaming, query, files, sendMessage]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  const latestTutor = [...messages].reverse().find((m) => m.role === "tutor");
  const latestUser = [...messages].reverse().find(
    (m) => m.role === "user" && m.content !== "Auto Explore",
  );

  const lastShownTutorId = useRef<string | null>(null);
  if (latestTutor && latestTutor.id !== lastShownTutorId.current) {
    lastShownTutorId.current = latestTutor.id;
    if (bubbleDismissed) setBubbleDismissed(false);
  }
  const showModePicker = learningMode === null && messages.some((m) => m.content === "__MODE_PICKER__");

  const handlePickMode = (mode: "guided" | "auto") => {
    setLearningMode(mode);

    const label = mode === "guided" ? "Guided Learning" : "Auto Explore";
    addMessage({
      id: `mode-${Date.now()}`,
      role: "user",
      content: label,
      timestamp: Date.now(),
    });

    if (mode === "guided") {
      const msg = `Great choice! I'll guide you step by step through "${query}". What part are you most curious about? Or just say "start from the basics" and I'll take it from there.`;
      addMessage({ id: `guide-ack-${Date.now()}`, role: "tutor", content: msg, timestamp: Date.now() });
      if (autoSpeak && !isMuted) {
        setSpeaking(true);
        speak(msg, () => setSpeaking(false));
      }
    } else {
      const msg = `Let me build out the complete learning space for "${query}". Sit back — I'll create all the visuals, equations, and notes on the canvas.`;
      addMessage({ id: `auto-ack-${Date.now()}`, role: "tutor", content: msg, timestamp: Date.now() });
      if (autoSpeak && !isMuted) {
        setSpeaking(true);
        speak(msg, () => setSpeaking(false));
      }
    }
  };

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
                    if (msg.content === "__MODE_PICKER__") return null;
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

        {/* Latest conversation bubble (tutor message) — compact, scrollable, dismissible */}
        <AnimatePresence mode="wait">
          {latestTutor && !showHistory && !bubbleDismissed && (
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

              {/* Tutor response — max height with scroll */}
              <div className="relative group">
                <div className="bg-[#1c1c1e]/[0.92] backdrop-blur-2xl text-white/90 rounded-2xl shadow-2xl overflow-hidden">
                  {/* Header with controls */}
                  <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                    <div className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-2.5 h-2.5 text-white/50" />
                    </div>
                    <span className="text-[11px] text-white/30 font-medium flex-1">Synapse</span>
                    {!isSpeaking && (
                      <button
                        onClick={() => {
                          setSpeaking(true);
                          speak(latestTutor.content, () => setSpeaking(false));
                        }}
                        className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-white/25 hover:text-white/60 hover:bg-white/[0.12] transition-all"
                        title="Listen"
                      >
                        <Volume2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setBubbleDismissed(true)}
                      className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-white/25 hover:text-white/60 hover:bg-white/[0.12] transition-all"
                      title="Dismiss"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Scrollable content */}
                  <div className="max-h-[30vh] overflow-y-auto px-4 pb-3 scrollbar-dark">
                    <p className="text-[13px] leading-relaxed">
                      {renderInlineMarkdown(latestTutor.content)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode picker */}
        <AnimatePresence>
          {showModePicker && !showHistory && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ type: "spring", damping: 22, stiffness: 300, delay: 0.15 }}
              className="w-full mb-3 flex gap-3"
            >
              <button
                onClick={() => handlePickMode("guided")}
                className="flex-1 group bg-white border border-black/[0.08] rounded-2xl px-5 py-4 text-left hover:border-indigo-400/40 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                    <GraduationCap className="w-4.5 h-4.5 text-indigo-500" />
                  </div>
                  <span className="text-[14px] font-semibold text-black/80">Guided Learning</span>
                </div>
                <p className="text-[12px] text-black/40 leading-relaxed">
                  I'll guide you step by step, adapting to your questions and pace.
                </p>
              </button>

              <button
                onClick={() => handlePickMode("auto")}
                className="flex-1 group bg-white border border-black/[0.08] rounded-2xl px-5 py-4 text-left hover:border-emerald-400/40 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                    <Compass className="w-4.5 h-4.5 text-emerald-500" />
                  </div>
                  <span className="text-[14px] font-semibold text-black/80">Auto Explore</span>
                </div>
                <p className="text-[12px] text-black/40 leading-relaxed">
                  I'll teach the complete concept end-to-end with all visuals on the canvas.
                </p>
              </button>
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
