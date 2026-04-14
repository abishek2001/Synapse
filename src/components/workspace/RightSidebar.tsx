"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useCanvasStore } from "@/store/canvas";
import { useUIStore } from "@/store/ui";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

const UPDATE_DOT: Record<string, string> = {
  module_added:    "bg-emerald-400",
  doubt_answered:  "bg-violet-400",
  selection_asked: "bg-blue-400",
  ai_note:         "bg-cyan-400",
};

interface RightSidebarProps {
  open: boolean;
  onToggle: () => void;
}

export default function RightSidebar({ open }: RightSidebarProps) {
  const { messages, isStreaming } = useSessionStore();
  const { updates } = useCanvasStore();
  const { darkMode, transcriptExpanded, updatesExpanded, setTranscriptExpanded, setUpdatesExpanded } = useUIStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const surface = darkMode ? "#0a0a18" : "#ffffff";
  const border = darkMode ? "border-white/[0.05]" : "border-black/[0.06]";
  const sectionBorder = darkMode ? "border-white/[0.05]" : "border-black/[0.05]";
  const headerText = darkMode ? "text-white/30" : "text-black/30";
  const headerHover = darkMode ? "hover:bg-white/[0.02]" : "hover:bg-black/[0.02]";
  const mutedText = darkMode ? "text-white/20" : "text-black/20";
  const userBubble = darkMode ? "bg-white/[0.07] text-white/65" : "bg-black/[0.06] text-black/65";
  const aiBubble = darkMode ? "text-white/45" : "text-black/45";

  const displayMessages = messages.filter((m) => m.role !== "system");

  return (
    <motion.div
      animate={{ width: open ? 256 : 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className={`flex-shrink-0 relative z-40 overflow-hidden border-l ${border}`}
      style={{ backgroundColor: surface }}
    >
      <div className="w-[256px] h-full flex flex-col overflow-hidden">

        {/* Transcript */}
        <div className="flex-1 flex flex-col min-h-0">
          <button
            onClick={() => setTranscriptExpanded(!transcriptExpanded)}
            className={`flex items-center justify-between px-4 py-2.5 border-b ${sectionBorder} flex-shrink-0 ${headerHover} transition-colors`}
          >
            <span className={`text-[10px] font-semibold tracking-widest uppercase ${headerText}`}>
              Transcript
            </span>
            {transcriptExpanded
              ? <ChevronUp className={`w-3 h-3 ${mutedText}`} />
              : <ChevronDown className={`w-3 h-3 ${mutedText}`} />}
          </button>

          {transcriptExpanded && (
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
            >
              {displayMessages.length === 0 && (
                <p className={`text-[11px] italic text-center py-6 ${mutedText}`}>
                  Conversation will appear here
                </p>
              )}

              {displayMessages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start gap-1.5"}`}>
                    {!isUser && (
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${darkMode ? "bg-white/[0.06]" : "bg-black/[0.05]"}`}>
                        <Sparkles className={`w-2 h-2 ${darkMode ? "text-white/30" : "text-black/30"}`} />
                      </div>
                    )}
                    <div className={`text-[11.5px] leading-relaxed rounded-xl px-2.5 py-1.5 max-w-[88%] ${isUser ? userBubble : aiBubble}`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}

              {isStreaming && (
                <div className="flex items-center gap-1.5 px-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`w-1 h-1 rounded-full animate-pulse ${darkMode ? "bg-white/25" : "bg-black/20"}`}
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Updates */}
        <div className={`flex-shrink-0 border-t ${sectionBorder}`}>
          <button
            onClick={() => setUpdatesExpanded(!updatesExpanded)}
            className={`w-full flex items-center justify-between px-4 py-2.5 ${headerHover} transition-colors`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold tracking-widest uppercase ${headerText}`}>
                Activity
              </span>
              {updates.length > 0 && (
                <span className={`text-[9px] rounded px-1.5 py-0.5 ${darkMode ? "bg-white/[0.07] text-white/30" : "bg-black/[0.05] text-black/30"}`}>
                  {updates.length}
                </span>
              )}
            </div>
            {updatesExpanded
              ? <ChevronUp className={`w-3 h-3 ${mutedText}`} />
              : <ChevronDown className={`w-3 h-3 ${mutedText}`} />}
          </button>

          {updatesExpanded && (
            <div className="max-h-[220px] overflow-y-auto px-3 pb-3 space-y-1.5">
              {updates.length === 0 && (
                <p className={`text-[11px] italic text-center py-3 ${mutedText}`}>No activity yet</p>
              )}
              {[...updates].reverse().slice(0, 12).map((upd) => (
                <div key={upd.id} className="flex items-start gap-2 py-1">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${UPDATE_DOT[upd.type] ?? "bg-gray-400"}`} />
                  <div className="min-w-0">
                    <p className={`text-[11.5px] font-medium truncate ${darkMode ? "text-white/55" : "text-black/55"}`}>{upd.title}</p>
                    <p className={`text-[10px] ${mutedText}`}>{relativeTime(upd.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
