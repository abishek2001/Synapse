"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Mic, MicOff, Loader2 } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useUIStore } from "@/store/ui";
import { useAIChat } from "@/hooks/useAIChat";
import { startListening, stopListening, isRecognitionSupported, speak } from "@/lib/voice/speech";

export default function CanvasInputBar() {
  const {
    messages,
    voiceMode,
    liveCaption,
    isSpeaking,
    isMuted,
    setVoiceMode,
    setLiveCaption,
    setSpeaking,
    pendingVoiceText,
    setPendingVoiceText,
    addMessage,
    query,
    files,
    documentContext,
  } = useSessionStore();

  const { darkMode } = useUIStore();
  const { sendMessage, isStreaming, latestTutor } = useAIChat();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionOk = useRef(false);
  const initialized = useRef(false);

  useEffect(() => { recognitionOk.current = isRecognitionSupported(); }, []);

  // Inject welcome message once
  useEffect(() => {
    if (initialized.current || !query) return;
    // Skip if welcome already exists
    if (useSessionStore.getState().messages.some((m) => m.id === "welcome")) {
      initialized.current = true;
      return;
    }
    if (files.length > 0 && !documentContext) return;
    initialized.current = true;

    const greeting = files.length > 0
      ? `Loaded your material on "${query}". Ask me anything!`
      : `Ready to explore "${query}" — ask me anything or just start typing.`;

    addMessage({ id: "welcome", role: "tutor", content: greeting, timestamp: Date.now() });

    if (!isMuted) {
      setTimeout(() => {
        setSpeaking(true);
        speak(greeting, () => setSpeaking(false));
      }, 800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Handle pending voice text
  useEffect(() => {
    if (pendingVoiceText && !isStreaming) {
      sendMessage(pendingVoiceText);
      setPendingVoiceText(null);
    }
  }, [pendingVoiceText, isStreaming, sendMessage, setPendingVoiceText]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput("");
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
      );
      if (started) setVoiceMode(true);
    }
  };

  // Last user message for caption context
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const _ = lastUserMsg; // suppress unused warning
  void _;
  void isSpeaking;

  const barBg = darkMode
    ? "rgba(15,15,28,0.94)"
    : "rgba(255,255,255,0.95)";
  const barBorder = darkMode ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)";
  const inputText = darkMode ? "text-white/80 placeholder:text-white/25" : "text-black/75 placeholder:text-black/25";
  const iconBtn = darkMode
    ? "text-white/25 hover:text-white/60 hover:bg-white/[0.06]"
    : "text-black/25 hover:text-black/60 hover:bg-black/[0.05]";
  const sendActive = darkMode ? "bg-violet-600 hover:bg-violet-700" : "bg-violet-600 hover:bg-violet-700";

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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-lg px-4 pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-1.5">

        {/* AI caption — appears briefly above bar */}
        <AnimatePresence mode="wait">
          {latestTutor && (
            <motion.div
              key={latestTutor.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-[12px] leading-snug line-clamp-2 px-4 py-2 rounded-xl shadow-sm"
              style={{
                backgroundColor: barBg,
                border: `1px solid ${barBorder}`,
                backdropFilter: "blur(16px)",
                color: darkMode ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
              }}
            >
              {latestTutor.content}
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
  );
}
