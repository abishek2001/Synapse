"use client";

import { motion } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeOff, Square } from "lucide-react";
import { useSessionStore } from "@/store/session";
import {
  startListening,
  stopListening,
  stopSpeaking,
  isRecognitionSupported,
} from "@/lib/voice/speech";
import { playSfx } from "@/lib/voice/sfx";
import { useCallback, useRef } from "react";

const GLOW: Record<string, string> = {
  listening: "rgba(239,68,68,0.35)",
  streaming: "rgba(251,191,36,0.3)",
  speaking: "rgba(52,211,153,0.3)",
  idle: "rgba(0,0,0,0)",
};

const BORDER: Record<string, string> = {
  listening: "rgba(239,68,68,0.5)",
  streaming: "rgba(251,191,36,0.4)",
  speaking: "rgba(52,211,153,0.45)",
  idle: "rgba(0,0,0,0.12)",
};

export default function VoiceIsland() {
  const {
    isSpeaking,
    isListening,
    isMuted,
    isStreaming,
    setSpeaking,
    setListening,
    setMuted,
    setPendingVoiceText,
  } = useSessionStore();

  const listeningRef = useRef(isListening);
  listeningRef.current = isListening;

  const active = isSpeaking || isListening || isStreaming;
  const mode = isListening
    ? "listening"
    : isStreaming
      ? "streaming"
      : isSpeaking
        ? "speaking"
        : "idle";

  const handleStartMic = useCallback(() => {
    if (listeningRef.current) return;
    if (!isRecognitionSupported()) return;

    if (isSpeaking) {
      stopSpeaking();
      setSpeaking(false);
    }

    setListening(true);
    playSfx("voice-listen-on");
    startListening(
      (text) => setPendingVoiceText(text),
      () => setListening(false),
    );
  }, [isSpeaking, setListening, setPendingVoiceText, setSpeaking]);

  const handleStopMic = useCallback(() => {
    stopListening();
    setListening(false);
    playSfx("voice-listen-off");
  }, [setListening]);

  const toggleMute = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
      setSpeaking(false);
    }
    setMuted(!isMuted);
  }, [isSpeaking, isMuted, setSpeaking, setMuted]);

  return (
    <div className="relative flex justify-center">
      {/* Glow behind the notch */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-[28px] pointer-events-none"
        animate={{
          width: active ? 280 : 140,
          height: active ? 56 : 36,
          opacity: active ? 1 : 0,
        }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${GLOW[mode]}, transparent 70%)`,
          filter: "blur(12px)",
        }}
      />

      {/* The notch */}
      <motion.div
        className="relative z-10 flex items-center overflow-hidden"
        animate={{
          width: active ? 280 : 126,
          height: active ? 48 : 30,
        }}
        transition={{ type: "spring", damping: 28, stiffness: 400 }}
        style={{
          background: "#1a1a1e",
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          boxShadow: `0 0 0 1.5px ${BORDER[mode]}, 0 4px 20px rgba(0,0,0,0.15)`,
        }}
      >
        {!active ? (
          <div
            className="flex items-center gap-3 cursor-pointer px-3 w-full justify-center h-full"
            onClick={handleStartMic}
          >
            <Mic className="w-3 h-3 text-white/30" />
            <div className="w-[5px] h-[5px] rounded-full bg-white/15" />
            <div className="w-4 h-[3px] rounded-full bg-white/10" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-4 w-full h-full">
            <motion.div
              className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${
                isListening
                  ? "bg-red-500"
                  : isStreaming
                    ? "bg-amber-400"
                    : "bg-green-400"
              }`}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [1, 0.6, 1],
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="flex items-center gap-[3px] flex-1 min-w-0 h-5 justify-center">
              {isStreaming ? (
                // Thinking: traveling shimmer across small dots — distinct from audio waveform
                [...Array(9)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] h-[3px] rounded-full bg-amber-400"
                    animate={{
                      opacity: [0.2, 1, 0.2],
                      scale: [0.8, 1.4, 0.8],
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.12,
                      ease: "easeInOut",
                    }}
                  />
                ))
              ) : (
                // Listening / Speaking: audio waveform bars
                [...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className={`w-[2px] rounded-full ${
                      isListening ? "bg-red-400" : "bg-green-400/70"
                    }`}
                    animate={{
                      height: [2, 4 + Math.random() * 14, 2],
                    }}
                    transition={{
                      duration: 0.35 + Math.random() * 0.35,
                      repeat: Infinity,
                      delay: i * 0.04,
                      ease: "easeInOut",
                    }}
                  />
                ))
              )}
            </div>

            <span className="text-[9px] text-white/40 font-medium whitespace-nowrap tracking-wide">
              {isListening
                ? "Listening..."
                : isStreaming
                  ? "Thinking..."
                  : isSpeaking
                    ? "Tap mic to interrupt"
                    : "Speaking"}
            </span>

            <div className="flex items-center gap-1 flex-shrink-0">
              {isListening ? (
                <button
                  onClick={handleStopMic}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500/30 text-red-400 hover:bg-red-500/50 active:bg-red-500/60 transition-all cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              ) : isSpeaking ? (
                <button
                  onClick={handleStartMic}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.12] text-white/70 hover:bg-white/20 active:bg-white/25 transition-all cursor-pointer animate-pulse"
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleStartMic}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.15] active:bg-white/[0.2] transition-all cursor-pointer"
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={toggleMute}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isMuted
                    ? "bg-white/[0.06] text-red-400/60"
                    : "bg-white/[0.06] text-white/35 hover:text-white/70 hover:bg-white/[0.1]"
                }`}
              >
                {isMuted ? <VolumeOff className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
