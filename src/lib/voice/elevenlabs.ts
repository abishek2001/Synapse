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

  // Approximate word-boundary callbacks by splitting words evenly across the
  // playback duration once we know it. Real word timestamps would need
  // ElevenLabs' alignment API which adds a separate request.
  let wordTimer: number | null = null;
  const triggerWordTimers = () => {
    if (!opts.onWordBoundary || !audio.duration || !isFinite(audio.duration)) return;
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    const msPerWord = (audio.duration * 1000) / words.length;
    let i = 0;
    const fire = () => {
      if (audio.paused || audio.ended || i >= words.length) return;
      opts.onWordBoundary?.(words[i]);
      i += 1;
      wordTimer = window.setTimeout(fire, msPerWord);
    };
    wordTimer = window.setTimeout(fire, 0);
  };

  audio.addEventListener("playing", () => opts.onStart?.(), { once: true });
  audio.addEventListener("loadedmetadata", triggerWordTimers, { once: true });

  const cleanup = () => {
    if (wordTimer) { clearTimeout(wordTimer); wordTimer = null; }
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
