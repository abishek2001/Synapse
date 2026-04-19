"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useUIStore } from "@/store/ui";
import { useAIChat } from "@/hooks/useAIChat";
import { startListening, stopListening, isRecognitionSupported } from "@/lib/voice/speech";

export default function CanvasInputBar() {
  const {
    voiceMode,
    liveCaption,
    isSpeaking,
    speakReady,
    followUpQuestions,
    setVoiceMode,
    setLiveCaption,
    setFollowUpQuestions,
    pendingVoiceText,
    setPendingVoiceText,
    moduleQueue,
    shiftModuleQueue,
  } = useSessionStore();

  const { darkMode } = useUIStore();
  const { sendMessage, speakLatest, isStreaming } = useAIChat();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionOk = useRef(false);

  useEffect(() => { recognitionOk.current = isRecognitionSupported(); }, []);

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
    sendMessage(input.trim());
    setInput("");
  };

  const handleChipClick = (q: string) => {
    if (isStreaming) return;
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

    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg px-4 pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-1.5">

        {/* Follow-up chips — max 2, tier 1 only */}
        <AnimatePresence>
          {followUpQuestions.length > 0 && !isStreaming && (
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

          {/* Streaming indicator in place of send */}
          {isStreaming ? (
            <div className={`w-7 h-7 flex items-center justify-center flex-shrink-0 ${darkMode ? "text-white/25" : "text-black/25"}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </div>
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
