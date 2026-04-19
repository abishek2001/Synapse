"use client";

/**
 * usePlayback — single source of truth for per-message TTS playback.
 *
 * Every speaker button (in `CanvasInputBar`'s bubble + input pill, and per-row
 * inside `RightSidebar`'s transcript) goes through this hook. It wraps
 * `speak()` from `lib/voice/speech.ts` and synchronises three pieces of
 * session-store state:
 *
 *   - `playingMessageId` — which message (if any) is currently being spoken.
 *     Drives every speaker button's play/stop icon swap.
 *   - `isSpeaking`       — global flag still consumed by `VoiceIsland` etc.
 *   - `liveCaption`      — current SENTENCE being spoken (was per-word before;
 *     we standardised on sentence-level captions because ElevenLabs/Kokoro
 *     don't expose real word boundaries).
 *
 * Public API:
 *   - `playMessage(message, opts?)` — start playback. Stops anything currently
 *     playing first. `opts.voiceId` overrides the persona's default voice.
 *   - `stop()`                       — stop whatever is playing.
 *   - `toggleMessage(message, opts?)`— stop if already playing this message,
 *     otherwise start it. (What every speaker button calls.)
 *   - `playingMessageId`             — selector — null when nothing playing.
 */

import { useCallback } from "react";
import { useSessionStore, type Message } from "@/store/session";
import { speak, stopSpeaking } from "@/lib/voice/speech";

export interface PlayMessageOptions {
  /** Explicit ElevenLabs voice ID — overrides the session persona for this play. */
  voiceId?: string;
  /** Override the spoken text (defaults to message.spokenText, then message.content). */
  text?: string;
}

export function usePlayback() {
  const playingMessageId = useSessionStore((s) => s.playingMessageId);

  const stop = useCallback(() => {
    stopSpeaking();
    const s = useSessionStore.getState();
    if (s.isSpeaking) s.setSpeaking(false);
    if (s.playingMessageId) s.setPlayingMessageId(null);
    if (s.liveCaption) s.setLiveCaption("");
  }, []);

  const playMessage = useCallback(
    (message: Pick<Message, "id" | "content" | "spokenText" | "voice">, opts: PlayMessageOptions = {}) => {
      const text = (opts.text ?? message.spokenText ?? message.content ?? "").trim();
      if (!text) return;

      const s = useSessionStore.getState();
      // Honor the global mute toggle from VoiceIsland — clicking a speaker
      // while muted would otherwise silently produce audio because the
      // browser's audio element doesn't know about our mute state.
      if (s.isMuted) return;
      // Hard-stop anything currently playing — `speak()` does this internally
      // too, but we want store state to flip *now* so the UI swaps icons
      // before the next audio request resolves.
      stopSpeaking();
      s.setLiveCaption("");

      const voiceId = opts.voiceId ?? message.voice;

      s.setSpeaking(true);
      s.setPlayingMessageId(message.id);
      s.setSpeakReady(false);

      speak(text, {
        persona: s.persona,
        voiceId,
        onSentence: (sentence) => {
          // Use the freshest setter — the user might have started a different
          // playback in the interim; we still want this play's captions to win
          // until its onEnd fires.
          useSessionStore.getState().setLiveCaption(sentence);
        },
        onEnd: () => {
          const after = useSessionStore.getState();
          // Only clear state if WE are still the active playback. If another
          // playMessage() ran while we were going, it has already updated
          // state to its own message — leave it alone.
          if (after.playingMessageId === message.id) {
            after.setSpeaking(false);
            after.setPlayingMessageId(null);
            after.setLiveCaption("");
          }
        },
      });
    },
    [],
  );

  const toggleMessage = useCallback(
    (message: Pick<Message, "id" | "content" | "spokenText" | "voice">, opts: PlayMessageOptions = {}) => {
      const currentId = useSessionStore.getState().playingMessageId;
      if (currentId === message.id && !opts.voiceId) {
        // Same message, no voice override → user wants to stop.
        stop();
      } else {
        playMessage(message, opts);
      }
    },
    [playMessage, stop],
  );

  return { playingMessageId, playMessage, toggleMessage, stop };
}
