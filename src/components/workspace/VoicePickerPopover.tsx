"use client";

/**
 * VoicePickerPopover — small popover for picking a TTS voice.
 *
 * Triggered by right-click (or long-press on touch) on any speaker button.
 * Picking a voice:
 *   1. Updates `useSessionStore.persona` so future TTS uses that voice.
 *   2. If a `replayMessage` was passed, immediately replays it with the new
 *      voice — so the user hears the change instantly.
 *
 * Positioning: fixed, anchored to the trigger element's bounding rect. We
 * clamp to viewport so the popover never overflows.
 */

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useSessionStore, type Message } from "@/store/session";
import { useUIStore } from "@/store/ui";
import { VOICE_OPTIONS } from "@/lib/voice/elevenlabs-config";
import { usePlayback } from "@/hooks/usePlayback";

interface VoicePickerPopoverProps {
  /** Element the popover is anchored to. */
  anchor: DOMRect;
  onClose: () => void;
  /** If provided, picking a voice immediately replays this message with the new voice. */
  replayMessage?: Pick<Message, "id" | "content" | "spokenText" | "voice">;
}

export default function VoicePickerPopover({ anchor, onClose, replayMessage }: VoicePickerPopoverProps) {
  const persona = useSessionStore((s) => s.persona);
  const setPersona = useSessionStore((s) => s.setPersona);
  const { darkMode } = useUIStore();
  const { playMessage } = usePlayback();
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // mousedown so we beat the next click; capture to win against stopPropagation
    document.addEventListener("mousedown", handleDown, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Anchor below the trigger when there's room, above otherwise. Width clamped
  // to viewport so a button near the right edge still shows the full popover.
  const POPOVER_W = 220;
  const POPOVER_H_EST = 270;
  const PAD = 8;
  const above = anchor.bottom + POPOVER_H_EST + PAD > window.innerHeight && anchor.top > POPOVER_H_EST + PAD;
  const top = above ? anchor.top - POPOVER_H_EST - PAD : anchor.bottom + PAD;
  let left = anchor.left + anchor.width / 2 - POPOVER_W / 2;
  left = Math.max(PAD, Math.min(left, window.innerWidth - POPOVER_W - PAD));

  const surfaceBg = darkMode ? "rgba(20,20,32,0.96)" : "rgba(255,255,255,0.98)";
  const surfaceBorder = darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const headerText = darkMode ? "text-white/30" : "text-black/35";
  const labelText = darkMode ? "text-white/85" : "text-black/85";
  const blurbText = darkMode ? "text-white/35" : "text-black/40";
  const rowHover = darkMode ? "hover:bg-white/[0.05]" : "hover:bg-black/[0.04]";
  const rowActive = darkMode ? "bg-violet-500/[0.12]" : "bg-violet-500/[0.08]";

  const handlePick = (personaKey: string, voiceId: string) => {
    setPersona(personaKey);
    if (replayMessage) {
      playMessage(replayMessage, { voiceId });
    }
    onClose();
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, y: above ? 4 : -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] rounded-xl shadow-xl overflow-hidden"
      style={{
        top,
        left,
        width: POPOVER_W,
        backgroundColor: surfaceBg,
        border: `1px solid ${surfaceBorder}`,
        backdropFilter: "blur(20px)",
      }}
    >
      <div className={`px-3 pt-2.5 pb-1 text-[10px] font-semibold tracking-widest uppercase ${headerText}`}>
        Voice
      </div>
      <div className="pb-1.5">
        {VOICE_OPTIONS.map((opt) => {
          const selected = opt.personaKey === persona;
          return (
            <button
              key={opt.personaKey}
              onClick={() => handlePick(opt.personaKey, opt.voiceId)}
              className={`w-full text-left px-3 py-2 transition-colors flex items-center gap-2 ${rowHover} ${selected ? rowActive : ""}`}
              role="menuitem"
            >
              <div className="flex-1 min-w-0">
                <div className={`text-[12.5px] font-medium ${labelText} truncate`}>{opt.label}</div>
                <div className={`text-[10.5px] ${blurbText} truncate`}>{opt.blurb}</div>
              </div>
              {selected && <Check className="w-3 h-3 text-violet-500 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      {replayMessage && (
        <div
          className={`px-3 py-1.5 text-[10px] border-t ${darkMode ? "border-white/[0.05] text-white/30" : "border-black/[0.05] text-black/35"}`}
        >
          Picking a voice replays this message.
        </div>
      )}
    </motion.div>
  );
}
