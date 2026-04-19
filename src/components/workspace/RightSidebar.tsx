"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronDown, ChevronUp, Volume2, VolumeX } from "lucide-react";
import { useSessionStore, type Message } from "@/store/session";
import { useCanvasStore } from "@/store/canvas";
import { useUIStore } from "@/store/ui";
import { usePlayback } from "@/hooks/usePlayback";
import VoicePickerPopover from "./VoicePickerPopover";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

const UPDATE_DOT: Record<string, string> = {
  module_added:        "bg-emerald-400",
  doubt_answered:      "bg-violet-400",
  selection_asked:     "bg-blue-400",
  ai_note:             "bg-cyan-400",
  thinking:            "bg-amber-400 animate-pulse",
  artifact_generating: "bg-amber-400 animate-pulse",
  artifact_added:      "bg-cyan-400",
  error:               "bg-rose-400",
};

interface RightSidebarProps {
  open: boolean;
  onToggle: () => void;
  /** When true, render as a floating drawer over the canvas instead of a
   *  docked column that pushes the canvas. Used on compact viewports. */
  overlay?: boolean;
}

export default function RightSidebar({ open, onToggle, overlay = false }: RightSidebarProps) {
  const { messages, isStreaming, isSpeaking, liveCaption } = useSessionStore();
  const { updates } = useCanvasStore();
  const { darkMode, transcriptExpanded, updatesExpanded, setTranscriptExpanded, setUpdatesExpanded } = useUIStore();
  const { playingMessageId, toggleMessage } = usePlayback();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [voicePickerCtx, setVoicePickerCtx] = useState<{ anchor: DOMRect; message: Message } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll transcript when messages arrive
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Auto-open sidebar when AI starts speaking — but skip on compact/overlay
  // viewports so we don't slam a drawer over the canvas mid-explanation.
  useEffect(() => {
    if (isSpeaking && !open && !overlay) {
      onToggle();
    }
  }, [isSpeaking, open, onToggle, overlay]);

  const surface = darkMode ? "#0a0a18" : "#ffffff";
  const border = darkMode ? "border-white/[0.05]" : "border-black/[0.06]";
  const sectionBorder = darkMode ? "border-white/[0.05]" : "border-black/[0.05]";
  const headerText = darkMode ? "text-white/30" : "text-black/30";
  const headerHover = darkMode ? "hover:bg-white/[0.02]" : "hover:bg-black/[0.02]";
  const mutedText = darkMode ? "text-white/20" : "text-black/20";
  const userBubble = darkMode ? "bg-white/[0.07] text-white/65" : "bg-black/[0.06] text-black/65";
  const aiBubble = darkMode ? "text-white/45" : "text-black/45";

  const displayMessages = messages.filter((m) => m.role !== "system");

  const body = (
    <>
        {/* Live caption strip — shown while AI is speaking */}
        <AnimatePresence>
          {isSpeaking && liveCaption && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex-shrink-0 overflow-hidden border-b ${sectionBorder}`}
            >
              <div className="px-3 py-2.5 flex items-start gap-2">
                <Volume2 className={`w-3 h-3 mt-0.5 flex-shrink-0 ${darkMode ? "text-violet-400/60" : "text-violet-500/50"}`} />
                <p className={`text-[11px] leading-relaxed ${darkMode ? "text-white/45" : "text-black/45"}`}>
                  {liveCaption}
                </p>
              </div>
            </motion.div>
          )}
          {isSpeaking && !liveCaption && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex-shrink-0 overflow-hidden border-b ${sectionBorder}`}
            >
              <div className="px-3 py-2.5 flex items-center gap-2">
                <Volume2 className={`w-3 h-3 flex-shrink-0 ${darkMode ? "text-violet-400/60" : "text-violet-500/50"}`} />
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`w-1 h-1 rounded-full animate-pulse ${darkMode ? "bg-violet-400/50" : "bg-violet-500/40"}`}
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
                <span className={`text-[10px] ${darkMode ? "text-white/25" : "text-black/25"}`}>speaking…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
                const playable = !isUser && (msg.spokenText || msg.content);
                const isPlayingThis = playingMessageId === msg.id;

                const openVoicePicker = (e: React.MouseEvent | React.PointerEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setVoicePickerCtx({ anchor: rect, message: msg });
                };
                const startLongPress = (e: React.PointerEvent) => {
                  if (e.pointerType !== "touch") return;
                  const target = e.currentTarget as HTMLElement;
                  longPressRef.current = setTimeout(() => {
                    setVoicePickerCtx({ anchor: target.getBoundingClientRect(), message: msg });
                  }, 500);
                };
                const cancelLongPress = () => {
                  if (longPressRef.current) {
                    clearTimeout(longPressRef.current);
                    longPressRef.current = null;
                  }
                };

                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start gap-1.5"}`}>
                    {!isUser && (
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${darkMode ? "bg-white/[0.06]" : "bg-black/[0.05]"}`}>
                        <Sparkles className={`w-2 h-2 ${darkMode ? "text-white/30" : "text-black/30"}`} />
                      </div>
                    )}
                    <div className={`group relative text-[11.5px] leading-relaxed rounded-xl px-2.5 py-1.5 max-w-[88%] ${isUser ? userBubble : aiBubble} ${isPlayingThis ? (darkMode ? "ring-1 ring-violet-400/30" : "ring-1 ring-violet-500/30") : ""}`}>
                      {msg.content}
                      {playable && (
                        <button
                          onClick={() => toggleMessage(msg)}
                          onContextMenu={openVoicePicker}
                          onPointerDown={startLongPress}
                          onPointerUp={cancelLongPress}
                          onPointerLeave={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          title={isPlayingThis ? "Stop (right-click for voices)" : "Play this message (right-click for voices)"}
                          className={`absolute -right-1 -bottom-1 w-5 h-5 rounded-full flex items-center justify-center transition-all shadow-sm ${
                            isPlayingThis
                              ? (darkMode ? "bg-violet-500/45 text-violet-100 opacity-100" : "bg-violet-500/35 text-violet-700 opacity-100")
                              : (darkMode
                                  ? "bg-white/[0.08] text-white/40 opacity-0 group-hover:opacity-100 hover:bg-white/[0.18] hover:text-white/85"
                                  : "bg-black/[0.06] text-black/40 opacity-0 group-hover:opacity-100 hover:bg-black/[0.12] hover:text-black/75")
                          }`}
                        >
                          {isPlayingThis
                            ? <VolumeX className="w-2.5 h-2.5" />
                            : <Volume2 className="w-2.5 h-2.5" />}
                        </button>
                      )}
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
            <div className="max-h-[260px] overflow-y-auto px-3 pb-3 space-y-1.5">
              {updates.length === 0 && (
                <p className={`text-[11px] italic text-center py-3 ${mutedText}`}>No activity yet</p>
              )}
              {[...updates].reverse().slice(0, 30).map((upd) => (
                <div key={upd.id} className="flex items-start gap-2 py-1">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${UPDATE_DOT[upd.type] ?? "bg-gray-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11.5px] font-medium truncate ${darkMode ? "text-white/55" : "text-black/55"}`}>{upd.title}</p>
                    {upd.detail && (
                      <p
                        className={`text-[10.5px] mt-0.5 leading-snug ${darkMode ? "text-white/35" : "text-black/40"}`}
                        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                      >
                        {upd.detail}
                      </p>
                    )}
                    <p className={`text-[9.5px] mt-0.5 ${mutedText}`}>{relativeTime(upd.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </>
  );

  const voicePicker = (
    <AnimatePresence>
      {voicePickerCtx && (
        <VoicePickerPopover
          anchor={voicePickerCtx.anchor}
          onClose={() => setVoicePickerCtx(null)}
          replayMessage={voicePickerCtx.message}
        />
      )}
    </AnimatePresence>
  );

  // ── Layout: docked column vs floating overlay drawer ──────────────────────
  // Overlay mode (compact viewports): absolute-positioned, slides in from the
  // right above the canvas with a tappable backdrop. Docked mode (≥1100px):
  // animates the column width so the canvas resizes alongside.
  if (overlay) {
    return (
      <>
        <AnimatePresence>
          {open && (
            <motion.button
              key="rs-backdrop"
              type="button"
              aria-label="Close transcript"
              onClick={onToggle}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {open && (
            <motion.div
              key="rs-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className={`absolute right-0 top-0 bottom-0 z-50 border-l shadow-2xl ${border}`}
              style={{ backgroundColor: surface, width: "min(320px, 90vw)" }}
            >
              <div className="w-full h-full flex flex-col overflow-hidden">
                {body}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {voicePicker}
      </>
    );
  }

  return (
    <motion.div
      animate={{ width: open ? 256 : 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className={`flex-shrink-0 relative z-40 overflow-hidden border-l ${border}`}
      style={{ backgroundColor: surface }}
    >
      <div className="w-[256px] h-full flex flex-col overflow-hidden">
        {body}
      </div>
      {voicePicker}
    </motion.div>
  );
}
