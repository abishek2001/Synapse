"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PhoneOff, Volume2 } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { speak, stopSpeaking } from "@/lib/voice/speech";

interface CallFriendModalProps {
  onClose: () => void;
}

export default function CallFriendModal({ onClose }: CallFriendModalProps) {
  const { query, messages } = useSessionStore();
  const [status, setStatus] = useState<"ringing" | "connected" | "ended">("ringing");
  const [duration, setDuration] = useState(0);
  const [analogy, setAnalogy] = useState("");

  const lastTopic = messages.filter((m) => m.role === "user").at(-1)?.content || query;

  const callFriend = useCallback(async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: lastTopic, persona: "friend", history: [], mode: "friend" }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.friend?.analogy || data.rawResponse || "Think of it like throwing a ball so fast it never comes back down — that's basically what an orbit is.";
        setAnalogy(text);
        setStatus("connected");
        speak(text);
      } else {
        setAnalogy("Think of it like throwing a ball so fast it never comes back down — that's basically what an orbit is.");
        setStatus("connected");
      }
    } catch {
      setAnalogy("Think of it like throwing a ball so fast it never comes back down — that's basically what an orbit is.");
      setStatus("connected");
    }
  }, [lastTopic]);

  useEffect(() => {
    const timer = setTimeout(callFriend, 1500);
    return () => clearTimeout(timer);
  }, [callFriend]);

  useEffect(() => {
    if (status === "connected") {
      const interval = setInterval(() => setDuration((d) => d + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEnd = () => {
    stopSpeaking();
    setStatus("ended");
    setTimeout(onClose, 400);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={handleEnd}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-80 bg-white border border-black/[0.06] rounded-3xl p-8 text-center shadow-2xl"
      >
        <div className="relative mx-auto w-20 h-20 mb-5">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-2xl">
            {String.fromCodePoint(0x1F9E0)}
          </div>
          {status === "ringing" && (
            <>
              <motion.div className="absolute inset-0 rounded-full border-2 border-green-400" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
              <motion.div className="absolute inset-0 rounded-full border-2 border-green-400" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }} />
            </>
          )}
          {status === "connected" && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
              <Volume2 className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        <h3 className="text-lg font-semibold text-black/80 mb-1">
          {status === "ringing" ? "Calling a friend..." : status === "connected" ? "Friend connected" : "Call ended"}
        </h3>
        <p className="text-sm text-black/40 mb-6">
          {status === "ringing" ? "Getting a casual explanation" : status === "connected" ? formatTime(duration) : "Thanks for the chat!"}
        </p>

        {status === "connected" && analogy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/[0.02] rounded-xl p-4 mb-6 text-left border border-black/[0.04]">
            <p className="text-sm text-black/55 italic leading-relaxed">&ldquo;{analogy}&rdquo;</p>
          </motion.div>
        )}

        {status === "connected" && (
          <div className="flex items-center justify-center gap-1 mb-6">
            {[...Array(12)].map((_, i) => (
              <motion.div key={i} className="w-1 bg-green-500 rounded-full" animate={{ height: [4, 8 + Math.random() * 16, 4] }} transition={{ duration: 0.4 + Math.random() * 0.3, repeat: Infinity, delay: i * 0.05 }} />
            ))}
          </div>
        )}

        <button onClick={handleEnd} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center text-white shadow-lg mx-auto">
          <PhoneOff className="w-5 h-5" />
        </button>
      </motion.div>
    </motion.div>
  );
}
