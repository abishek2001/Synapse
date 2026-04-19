"use client";

/**
 * Client-side ElevenLabs helpers.
 *
 *  - speakElevenLabs(text, persona) — fetches the streaming TTS endpoint and
 *    plays it through a hidden <audio> element. Returns true on success
 *    (audio actually started playing), false on any failure (no key, network,
 *    upstream error). Caller should fall back to kokoro/Web Speech on false.
 *
 *  - transcribeElevenLabs(blob) — uploads recorded audio to /api/voice/stt
 *    and returns the recognized text (empty string on failure).
 */

let activeAudio: HTMLAudioElement | null = null;
let activeAbort: AbortController | null = null;
let elevenLabsAvailable: boolean | null = null;

/** Cached probe result so we don't hammer 503s once we know there's no key. */
function setAvailability(v: boolean) { elevenLabsAvailable = v; }
export function knownElevenLabsUnavailable(): boolean {
  return elevenLabsAvailable === false;
}

export async function speakElevenLabs(
  text: string,
  opts: {
    persona?: string;
    voiceId?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onWordBoundary?: (word: string) => void;
    /** Fires once per sentence at the estimated start of that sentence (used for captions). */
    onSentence?: (sentence: string, index: number) => void;
  } = {},
): Promise<boolean> {
  if (elevenLabsAvailable === false) return false;
  if (typeof window === "undefined") return false;
  if (!text.trim()) { opts.onEnd?.(); return true; }

  stopElevenLabs();
  activeAbort = new AbortController();

  let res: Response;
  try {
    res = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, persona: opts.persona, voiceId: opts.voiceId }),
      signal: activeAbort.signal,
    });
  } catch {
    setAvailability(false);
    return false;
  }

  if (res.status === 503 || res.status === 401) {
    setAvailability(false);
    return false;
  }
  if (!res.ok || !res.body) {
    return false;
  }

  // We have a successful audio stream — confirm availability for future calls
  setAvailability(true);

  // Buffer the streaming response into a Blob and play. (MediaSource streaming
  // is finicky with mp3 across browsers; buffering is short and reliable.)
  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    return false;
  }
  if (blob.size === 0) return false;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeAudio = audio;

  // Approximate word + sentence boundary callbacks by spreading them across the
  // playback duration in proportion to character count once we know it. Real
  // alignment would need ElevenLabs' separate alignment API.
  const wordTimers: number[] = [];
  const sentenceTimers: number[] = [];
  const triggerTimers = () => {
    if (!audio.duration || !isFinite(audio.duration)) return;
    const totalMs = audio.duration * 1000;

    if (opts.onSentence) {
      const sentences = (text.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) ?? [text])
        .map((s) => s.trim())
        .filter(Boolean);
      const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
      let acc = 0;
      sentences.forEach((sentence, idx) => {
        const startMs = (acc / totalChars) * totalMs;
        acc += sentence.length;
        const t = window.setTimeout(() => {
          if (audio.paused || audio.ended) return;
          opts.onSentence?.(sentence, idx);
        }, startMs);
        sentenceTimers.push(t);
      });
    }

    if (opts.onWordBoundary) {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const msPerWord = totalMs / words.length;
        words.forEach((word, i) => {
          const t = window.setTimeout(() => {
            if (audio.paused || audio.ended) return;
            opts.onWordBoundary?.(word);
          }, i * msPerWord);
          wordTimers.push(t);
        });
      }
    }
  };

  audio.addEventListener("playing", () => opts.onStart?.(), { once: true });
  audio.addEventListener("loadedmetadata", triggerTimers, { once: true });

  const cleanup = () => {
    for (const t of wordTimers) clearTimeout(t);
    for (const t of sentenceTimers) clearTimeout(t);
    wordTimers.length = 0;
    sentenceTimers.length = 0;
    URL.revokeObjectURL(url);
    if (activeAudio === audio) activeAudio = null;
  };
  audio.addEventListener("ended", () => { cleanup(); opts.onEnd?.(); }, { once: true });
  audio.addEventListener("error", () => { cleanup(); opts.onEnd?.(); }, { once: true });

  try {
    await audio.play();
  } catch {
    cleanup();
    return false;
  }
  return true;
}

export function stopElevenLabs(): void {
  try { activeAbort?.abort(); } catch { /* ignore */ }
  activeAbort = null;
  if (activeAudio) {
    try { activeAudio.pause(); activeAudio.currentTime = 0; } catch { /* ignore */ }
    activeAudio = null;
  }
}

export function isElevenLabsSpeaking(): boolean {
  return !!activeAudio && !activeAudio.paused && !activeAudio.ended;
}

// ── STT (Scribe) ─────────────────────────────────────────────────────────────

export async function transcribeElevenLabs(blob: Blob): Promise<string> {
  if (elevenLabsAvailable === false) return "";
  const fd = new FormData();
  fd.append("audio", blob, "voice.webm");
  let res: Response;
  try {
    res = await fetch("/api/voice/stt", { method: "POST", body: fd });
  } catch {
    return "";
  }
  if (res.status === 503 || res.status === 401) {
    setAvailability(false);
    return "";
  }
  if (!res.ok) return "";
  const data = await res.json().catch(() => null) as { text?: string } | null;
  return (data?.text ?? "").trim();
}
