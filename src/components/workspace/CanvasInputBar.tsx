"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Mic, MicOff, Square, Volume2, VolumeX, ChevronUp, ChevronDown, Sparkles, BookOpen, Wand2 } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useUIStore } from "@/store/ui";
import { useGroundingStore } from "@/store/grounding";
import { useDemoStore } from "@/store/demo";
import { useAIChat } from "@/hooks/useAIChat";
import { startListening, stopListening, isRecognitionSupported } from "@/lib/voice/speech";
import { classifyCommand, dispatchCanvasCommand } from "@/lib/voice/commands";
import VoicePickerPopover from "./VoicePickerPopover";

export default function CanvasInputBar() {
  const {
    voiceMode,
    liveCaption,
    isSpeaking,
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
  const { sendMessage, stop, toggleMessage, playingMessageId, isStreaming, latestTutor } = useAIChat();
  // Demo playback hooks — when a hardcoded demo is running, the input bar
  // intercepts Send to advance the next module instead of hitting the API.
  const demoScript = useDemoStore((s) => s.script);
  const demoQueuedPrompt = useDemoStore((s) => s.queuedPrompt);
  const demoIsPlaying = useDemoStore((s) => s.isPlaying);
  const demoAdvance = useDemoStore((s) => s.advance);
  const demoActive = !!demoScript;
  const [input, setInput] = useState("");
  const [bubbleExpanded, setBubbleExpanded] = useState(false);
  const [voicePickerAnchor, setVoicePickerAnchor] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionOk = useRef(false);
  const lastShownTutorId = useRef<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest playable tutor message — derived once, used in multiple places.
  const playableTutor = latestTutor && (latestTutor.spokenText || latestTutor.content)
    ? latestTutor
    : null;
  const isPlayingLatest = !!playableTutor && playingMessageId === playableTutor.id;

  const openVoicePicker = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setVoicePickerAnchor(rect);
  };

  // Long-press support so touch users can also reach the voice picker.
  const startLongPress = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const target = e.currentTarget as HTMLElement;
    longPressTimerRef.current = setTimeout(() => {
      setVoicePickerAnchor(target.getBoundingClientRect());
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSpeakerClick = () => {
    if (!playableTutor) return;
    toggleMessage(playableTutor);
  };

  useEffect(() => { recognitionOk.current = isRecognitionSupported(); }, []);

  // Reset the bubble to its collapsed state whenever a new tutor message
  // arrives — keeps the canvas un-cluttered until the user opts in to read.
  useEffect(() => {
    if (latestTutor && latestTutor.id !== lastShownTutorId.current) {
      lastShownTutorId.current = latestTutor.id;
      setBubbleExpanded(false);
    }
  }, [latestTutor]);

  // ── Mode picker handler ────────────────────────────────────────────────────
  const handlePickMode = (mode: "guided" | "auto") => {
    setLearningMode(mode);
    import("@/lib/voice/sfx").then((m) => m.playSfx("mode-picked")).catch(() => {});
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
  // Intercepts short navigation phrases ("zoom in", "next module", "fit all")
  // and dispatches them as CanvasCommand events instead of sending to the
  // tutor — see lib/voice/commands.ts. Anything that doesn't classify as a
  // command falls through to the chat as a normal question.
  useEffect(() => {
    if (pendingVoiceText && !isStreaming) {
      const cmd = classifyCommand(pendingVoiceText);
      if (cmd) {
        dispatchCanvasCommand(cmd);
        setPendingVoiceText(null);
        return;
      }
      sendMessage(pendingVoiceText);
      setPendingVoiceText(null);
    }
  }, [pendingVoiceText, isStreaming, sendMessage, setPendingVoiceText]);

  // Voice "replay" / "say that again" — replay the last tutor message.
  // Lives here (not in usePlayback) because we need access to `latestTutor`
  // and `toggleMessage`, which are bound to the chat hook.
  useEffect(() => {
    const onReplay = () => { if (playableTutor) toggleMessage(playableTutor); };
    window.addEventListener("synapse:replay", onReplay);
    return () => window.removeEventListener("synapse:replay", onReplay);
  }, [playableTutor, toggleMessage]);

  // Full-workflow queue: fire next module prompt as soon as the previous turn finishes
  useEffect(() => {
    if (moduleQueue.length > 0 && !isStreaming && !pendingVoiceText) {
      const next = moduleQueue[0];
      shiftModuleQueue();
      sendMessage(next);
    }
  }, [moduleQueue, isStreaming, pendingVoiceText, sendMessage, shiftModuleQueue]);

  // Auto-fill the input pill whenever the demo store stages the next prompt.
  // The user just clicks Send to fire the next programmed module.
  useEffect(() => {
    if (demoQueuedPrompt) setInput(demoQueuedPrompt);
  }, [demoQueuedPrompt]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    // Demo interception: when a demo is active, ANY submit advances the next
    // hardcoded module — even if the user edited the queued prompt. Keeps the
    // demo on rails without confusing branches.
    if (demoActive) {
      // Persist the typed prompt to the transcript so the bubble + sidebar
      // light up like a real follow-up question.
      const text = input.trim();
      useSessionStore.getState().addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      });
      setInput("");
      demoAdvance();
      return;
    }
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
              className="px-4 py-2 rounded-full text-[12px] max-w-[min(300px,84vw)] truncate shadow-sm"
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
      {/* YouTube-style live captions — fixed bottom center, shown while AI is
          speaking. Now sentence-level (was per-word) — text wraps to two lines
          and stays put while a sentence is being read. */}
      <AnimatePresence>
        {isSpeaking && liveCaption && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-5 py-2.5 rounded-xl text-center w-[min(640px,92vw)]"
            style={{
              backgroundColor: "rgba(0,0,0,0.78)",
              backdropFilter: "blur(6px)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
            }}
          >
            <p
              className="text-white font-medium leading-snug"
              style={{
                fontSize: 17,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {liveCaption}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice picker popover — anchored to whichever speaker button opened it.
          Picking a voice replays the latest tutor message so the user can
          immediately hear the difference. */}
      <AnimatePresence>
        {voicePickerAnchor && (
          <VoicePickerPopover
            anchor={voicePickerAnchor}
            onClose={() => setVoicePickerAnchor(null)}
            replayMessage={playableTutor ?? undefined}
          />
        )}
      </AnimatePresence>

      {/* Position:
            - <lg (≤1024px): input pill stacks ABOVE the canvas tool palette /
              zoom controls so it never collides with them, and is full-width
              with side padding.
            - ≥lg: classic centered pill at the very bottom.
          The outer container is intentionally wider than the input pill so
          the follow-up question chips can stretch past the pill's edges
          (otherwise long suggestions wrap onto multiple cramped lines). The
          mode-picker / tutor-bubble / input-pill children clamp themselves
          back down to `max-w-xl`. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-30 w-full px-3 sm:px-4 pointer-events-none bottom-16 lg:bottom-4 max-w-3xl"
      >
        <div className="pointer-events-auto flex flex-col items-center gap-2">

          {/* ── Mode picker (one-time, on session start) ────────────────────── */}
          <AnimatePresence>
            {showModePicker && (
              <motion.div
                key="mode-picker"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                className="rounded-2xl shadow-xl p-4 mb-1 w-full max-w-xl"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

          {/* ── Latest tutor response — collapsed by default, expands on click ── */}
          <AnimatePresence mode="wait">
            {latestTutor && !showModePicker && (
              <motion.div
                key={latestTutor.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="rounded-2xl shadow-xl overflow-hidden w-full max-w-xl"
                style={{
                  backgroundColor: "rgba(28,28,30,0.92)",
                  backdropFilter: "blur(24px)",
                }}
              >
                {/* Header — always visible. The whole row is clickable when
                    collapsed (acts as the expand affordance); when expanded,
                    only the chevron toggles, so the collapse target is precise
                    and doesn't compete with the message content for clicks. */}
                <div
                  role={!bubbleExpanded ? "button" : undefined}
                  tabIndex={!bubbleExpanded ? 0 : undefined}
                  onClick={!bubbleExpanded ? () => setBubbleExpanded(true) : undefined}
                  onKeyDown={(e) => {
                    if (!bubbleExpanded && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setBubbleExpanded(true);
                    }
                  }}
                  className={`flex items-center gap-2 px-4 ${bubbleExpanded ? "pt-3 pb-1" : "py-2.5"} ${
                    !bubbleExpanded ? "cursor-pointer hover:bg-white/[0.03] transition-colors" : ""
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-white/50" />
                  </div>
                  {bubbleExpanded ? (
                    <span className="text-[11px] text-white/30 font-medium flex-1">Synapse</span>
                  ) : (
                    /* Collapsed: show one truncated line of the response next
                       to the Synapse mark so the user knows what's hidden. */
                    <p className="text-[12.5px] text-white/75 flex-1 truncate min-w-0">
                      {latestTutor.content.replace(/\s+/g, " ").trim()}
                    </p>
                  )}
                  {playableTutor && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSpeakerClick(); }}
                      onContextMenu={openVoicePicker}
                      onPointerDown={(e) => { e.stopPropagation(); startLongPress(e); }}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isPlayingLatest
                          ? "bg-violet-500/30 text-violet-200 hover:bg-violet-500/45"
                          : "bg-white/[0.06] text-white/40 hover:text-white/80 hover:bg-white/[0.12]"
                      }`}
                      title={isPlayingLatest ? "Stop (right-click for voices)" : "Listen (right-click for voices)"}
                    >
                      {isPlayingLatest
                        ? <VolumeX className="w-2.5 h-2.5" />
                        : <Volume2 className="w-2.5 h-2.5" />}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setBubbleExpanded((v) => !v); }}
                    className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-white/25 hover:text-white/60 hover:bg-white/[0.12] transition-all"
                    title={bubbleExpanded ? "Collapse" : "Expand"}
                    aria-label={bubbleExpanded ? "Collapse response" : "Expand response"}
                    aria-expanded={bubbleExpanded}
                  >
                    {bubbleExpanded
                      ? <ChevronDown className="w-2.5 h-2.5" />
                      : <ChevronUp className="w-2.5 h-2.5" />}
                  </button>
                </div>

                {/* Body — animates open/closed. AnimatePresence lets it tween
                    height + opacity smoothly without stretching the header. */}
                <AnimatePresence initial={false}>
                  {bubbleExpanded && (
                    <motion.div
                      key="bubble-body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="max-h-[30vh] overflow-y-auto px-4 pb-3 scrollbar-dark">
                        <p className="text-[13px] leading-relaxed text-white/90 whitespace-pre-wrap">
                          {latestTutor.content}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Follow-up chips — max 2, tier 1 only.
              Spans the full container width (`max-w-3xl`, wider than the
              input pill above) so long suggestions like "Do you want to
              start with forces or with field lines?" can sit on one line
              instead of wrapping inside the narrow input column. */}
          <AnimatePresence>
            {followUpQuestions.length > 0 && !isStreaming && !showModePicker && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                className="flex flex-wrap gap-1.5 justify-center w-full"
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
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-md w-full max-w-xl"
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
                {/* Speak button — always available while there's a tutor message
                    to play. Toggles between play and stop. Right-click (or
                    long-press on touch) opens the voice picker. */}
                <AnimatePresence>
                  {playableTutor && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={handleSpeakerClick}
                      onContextMenu={openVoicePicker}
                      onPointerDown={startLongPress}
                      onPointerUp={cancelLongPress}
                      onPointerLeave={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                        isPlayingLatest
                          ? "bg-violet-500/40 hover:bg-violet-500/55"
                          : "bg-violet-500/20 hover:bg-violet-500/35"
                      }`}
                      title={isPlayingLatest ? "Stop speaking (right-click for voices)" : "Speak response (right-click for voices)"}
                    >
                      {isPlayingLatest
                        ? <VolumeX className="w-3.5 h-3.5 text-violet-200" />
                        : <Volume2 className="w-3.5 h-3.5 text-violet-400" />}
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
                <motion.button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  animate={demoQueuedPrompt && !demoIsPlaying ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                  transition={demoQueuedPrompt && !demoIsPlaying
                    ? { repeat: Infinity, duration: 1.4, ease: "easeInOut" }
                    : { duration: 0.18 }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-20 ${sendActive} text-white ${
                    demoQueuedPrompt && !demoIsPlaying
                      ? "shadow-[0_0_12px_rgba(124,58,237,0.55)] ring-2 ring-violet-400/60"
                      : ""
                  }`}
                  title={demoQueuedPrompt && !demoIsPlaying ? "Send to play next module" : undefined}
                >
                  <Send className="w-3 h-3" />
                </motion.button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
