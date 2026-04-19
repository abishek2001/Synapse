"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Mic, MicOff, Square, Volume2, X, Sparkles, BookOpen, Wand2 } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useUIStore } from "@/store/ui";
import { useGroundingStore } from "@/store/grounding";
import { useAIChat } from "@/hooks/useAIChat";
import { startListening, stopListening, isRecognitionSupported } from "@/lib/voice/speech";

export default function CanvasInputBar() {
  const {
    voiceMode,
    liveCaption,
    isSpeaking,
    speakReady,
    followUpQuestions,
    learningMode,
    messages,
    query,
    setVoiceMode,
    setLiveCaption,
    setFollowUpQuestions,
    setLearningMode,
    setPendingVoiceText,
    setModuleQueue,
    pendingVoiceText,
    moduleQueue,
    shiftModuleQueue,
  } = useSessionStore();

  const { darkMode } = useUIStore();
  const { sendMessage, stop, speakLatest, isStreaming, latestTutor } = useAIChat();
  const [input, setInput] = useState("");
  const [bubbleDismissed, setBubbleDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionOk = useRef(false);
  const lastShownTutorId = useRef<string | null>(null);

  useEffect(() => { recognitionOk.current = isRecognitionSupported(); }, []);

  // Auto-resurface the bubble when a new tutor message arrives
  useEffect(() => {
    if (latestTutor && latestTutor.id !== lastShownTutorId.current) {
      lastShownTutorId.current = latestTutor.id;
      setBubbleDismissed(false);
    }
  }, [latestTutor]);

  // ── Mode picker handler ────────────────────────────────────────────────────
  const handlePickMode = (mode: "guided" | "auto") => {
    setLearningMode(mode);
    const topic = (query || "").trim();
    if (!topic) return;

    if (mode === "auto") {
      // Comprehensive walkthrough — if a multi-module plan exists, queue every module
      const plan = useGroundingStore.getState().studyPlan;
      if (plan && plan.modules.length > 1) {
        const queue = [
          topic,
          ...plan.modules.slice(1).map((m) => `Continue with: ${m.title} — ${m.description}`),
        ];
        setModuleQueue(queue);
      } else {
        // Single-shot comprehensive prompt
        setPendingVoiceText(
          `Give me a comprehensive walkthrough of: ${topic}. Use multiple artifacts (diagrams, equations, graphs, flashcards) so I can see everything at once.`,
        );
      }
    } else {
      // Guided: just kick off with the topic, the agent will go step by step
      setPendingVoiceText(topic);
    }
  };

  // Handle pending voice text (single-shot)
  useEffect(() => {
    if (pendingVoiceText && !isStreaming) {
      sendMessage(pendingVoiceText);
      setPendingVoiceText(null);
    }
  }, [pendingVoiceText, isStreaming, sendMessage, setPendingVoiceText]);

  // Full-workflow queue: fire next module prompt as soon as the previous turn finishes
  useEffect(() => {
    if (moduleQueue.length > 0 && !isStreaming && !pendingVoiceText) {
      const next = moduleQueue[0];
      shiftModuleQueue();
      sendMessage(next);
    }
  }, [moduleQueue, isStreaming, pendingVoiceText, sendMessage, shiftModuleQueue]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    // If user is typing without picking a mode, default to guided
    if (learningMode === null) setLearningMode("guided");
    sendMessage(input.trim());
    setInput("");
  };

  const handleChipClick = (q: string) => {
    if (isStreaming) return;
    if (learningMode === null) setLearningMode("guided");
    setFollowUpQuestions([]); // clear chips immediately on click
    sendMessage(q);
  };

  const toggleVoice = () => {
    if (voiceMode) {
      stopListening();
      setVoiceMode(false);
      setLiveCaption("");
    } else {
      const started = startListening(
        (text) => {
          sendMessage(text);
          setVoiceMode(false);
          setLiveCaption("");
        },
        () => {
          setVoiceMode(false);
          setLiveCaption("");
        },
        (interim) => setLiveCaption(interim),
      );
      if (started) setVoiceMode(true);
    }
  };

  // isSpeaking used for captions below

  const barBg = darkMode
    ? "rgba(15,15,28,0.94)"
    : "rgba(255,255,255,0.95)";
  const barBorder = darkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const inputText = darkMode ? "text-white/80 placeholder:text-white/25" : "text-black/75 placeholder:text-black/25";
  const iconBtn = darkMode
    ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
    : "text-black/25 hover:text-black/60 hover:bg-black/[0.05]";
  const sendActive = darkMode ? "bg-violet-600 hover:bg-violet-700" : "bg-violet-600 hover:bg-violet-700";
  // Tier 1: tutor questions (first 2 in array) — have violet accent
  const chipTier1 = darkMode
    ? "bg-violet-500/[0.12] hover:bg-violet-500/[0.22] text-violet-300/80 hover:text-violet-200 border border-violet-500/25"
    : "bg-violet-500/[0.08] hover:bg-violet-500/[0.16] text-violet-600/80 hover:text-violet-700 border border-violet-400/30";
  // Voice mode: floating pill
  if (voiceMode) {
    return (
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-auto">
        {/* Live caption */}
        <AnimatePresence>
          {liveCaption && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="px-4 py-2 rounded-full text-[12px] max-w-[300px] truncate shadow-sm"
              style={{
                backgroundColor: barBg,
                border: `1px solid ${barBorder}`,
                backdropFilter: "blur(16px)",
                color: darkMode ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
              }}
            >
              {liveCaption}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulsing stop button */}
        <motion.button
          onClick={toggleVoice}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          className="w-12 h-12 rounded-full bg-violet-600 shadow-[0_0_20px_rgba(124,58,237,0.5)] flex items-center justify-center"
        >
          <MicOff className="w-4.5 h-4.5 text-white" />
        </motion.button>
      </div>
    );
  }

  // Show the mode picker when: bridge done (workspace rendered = bridge done), no messages yet,
  // mode hasn't been picked, not currently streaming.
  const showModePicker =
    learningMode === null && messages.length === 0 && !isStreaming;

  return (
    <>
      {/* YouTube-style live captions — fixed bottom center, shown while AI is speaking */}
      <AnimatePresence>
        {isSpeaking && liveCaption && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-6 py-2 rounded-lg max-w-2xl text-center"
            style={{
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(4px)",
            }}
          >
            <span
              className="text-white font-medium leading-relaxed"
              style={{ fontSize: 17 }}
            >
              {liveCaption}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4 pointer-events-none">
        <div className="pointer-events-auto flex flex-col gap-2">

          {/* ── Mode picker (one-time, on session start) ────────────────────── */}
          <AnimatePresence>
            {showModePicker && (
              <motion.div
                key="mode-picker"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                className="rounded-2xl shadow-xl p-4 mb-1"
                style={{
                  backgroundColor: barBg,
                  border: `1px solid ${barBorder}`,
                  backdropFilter: "blur(20px)",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: darkMode ? "rgba(124,58,237,0.18)" : "rgba(124,58,237,0.12)" }}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <div className="flex-1">
                    <div
                      className="text-[13px] font-medium"
                      style={{ color: darkMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)" }}
                    >
                      How would you like to learn{query ? ` "${query.length > 32 ? query.slice(0, 32) + "…" : query}"` : ""}?
                    </div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: darkMode ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)" }}
                    >
                      Pick a mode — you can change later by typing.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePickMode("guided")}
                    className="text-left p-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      backgroundColor: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                      border: `1px solid ${barBorder}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                      <span
                        className="text-[12.5px] font-medium"
                        style={{ color: darkMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)" }}
                      >
                        Guided
                      </span>
                    </div>
                    <p
                      className="text-[11px] leading-snug"
                      style={{ color: darkMode ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.55)" }}
                    >
                      Step-by-step. Synapse asks questions, you steer the journey.
                    </p>
                  </button>

                  <button
                    onClick={() => handlePickMode("auto")}
                    className="text-left p-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      backgroundColor: darkMode ? "rgba(124,58,237,0.12)" : "rgba(124,58,237,0.08)",
                      border: `1px solid ${darkMode ? "rgba(124,58,237,0.3)" : "rgba(124,58,237,0.25)"}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Wand2 className="w-3.5 h-3.5 text-violet-500" />
                      <span
                        className="text-[12.5px] font-medium"
                        style={{ color: darkMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)" }}
                      >
                        Auto Explore
                      </span>
                    </div>
                    <p
                      className="text-[11px] leading-snug"
                      style={{ color: darkMode ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)" }}
                    >
                      The full picture. Synapse fills the canvas with everything at once.
                    </p>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Latest tutor response — compact, scrollable, dismissible ─────── */}
          <AnimatePresence mode="wait">
            {latestTutor && !showModePicker && !bubbleDismissed && (
              <motion.div
                key={latestTutor.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="rounded-2xl shadow-xl overflow-hidden"
                style={{
                  backgroundColor: darkMode ? "rgba(28,28,30,0.92)" : "rgba(28,28,30,0.92)",
                  backdropFilter: "blur(24px)",
                }}
              >
                <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                  <div className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-white/50" />
                  </div>
                  <span className="text-[11px] text-white/30 font-medium flex-1">Synapse</span>
                  {speakReady && !isSpeaking && (
                    <button
                      onClick={speakLatest}
                      className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-white/40 hover:text-white/80 hover:bg-white/[0.12] transition-all"
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

                <div className="max-h-[30vh] overflow-y-auto px-4 pb-3 scrollbar-dark">
                  <p className="text-[13px] leading-relaxed text-white/90 whitespace-pre-wrap">
                    {latestTutor.content}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Follow-up chips — max 2, tier 1 only */}
          <AnimatePresence>
            {followUpQuestions.length > 0 && !isStreaming && !showModePicker && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                className="flex flex-wrap gap-1.5"
              >
                {followUpQuestions.slice(0, 2).map((q, i) => (
                  <motion.button
                    key={q}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05, duration: 0.14 }}
                    onClick={() => handleChipClick(q)}
                    className={`text-[11.5px] px-3 py-1 rounded-full transition-all whitespace-nowrap ${chipTier1}`}
                    style={{ backdropFilter: "blur(12px)" }}
                  >
                    {q}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Single-line input pill */}
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-md"
            style={{
              backgroundColor: barBg,
              border: `1px solid ${barBorder}`,
              backdropFilter: "blur(20px)",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask Synapse anything…"
              className={`flex-1 bg-transparent text-[13.5px] py-1 outline-none ${inputText}`}
              disabled={isStreaming}
            />

            {/* While a turn is in flight: pulsing Stop button (cancels fetch + OpenAI calls) */}
            {isStreaming ? (
              <motion.button
                onClick={stop}
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-red-500/90 hover:bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.45)]"
                title="Stop"
              >
                <Square className="w-3 h-3 fill-current" />
              </motion.button>
            ) : (
              <>
                {/* Speak button — appears when AI response is ready for TTS */}
                <AnimatePresence>
                  {speakReady && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={speakLatest}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 bg-violet-500/20 hover:bg-violet-500/35"
                      title="Speak response"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-violet-400" />
                    </motion.button>
                  )}
                </AnimatePresence>

                {recognitionOk.current && (
                  <button
                    onClick={toggleVoice}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${iconBtn}`}
                    title="Voice input"
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-20 ${sendActive} text-white`}
                >
                  <Send className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
