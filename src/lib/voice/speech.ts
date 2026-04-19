"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadKokoro, getKokoroSync } from "./kokoro";
import {
  speakElevenLabs,
  stopElevenLabs,
  knownElevenLabsUnavailable,
  transcribeElevenLabs,
} from "./elevenlabs";

// ─────────────────────────────────────────────
// MediaRecorder-based STT (ElevenLabs Scribe)
// ─────────────────────────────────────────────

let mediaRecorder: MediaRecorder | null = null;
let micStream: MediaStream | null = null;
let recordedChunks: Blob[] = [];
let elSttUnavailable = false;

/**
 * Begin recording from the user's mic and send to /api/voice/stt on stop.
 * Uses voice activity detection (silence after speech ends → auto-stop).
 * Returns true if recording started, false if mic unavailable / Scribe disabled.
 */
async function startListeningElevenLabs(
  onResult: (text: string) => void,
  onEnd?: () => void,
  onInterim?: (text: string) => void,
): Promise<boolean> {
  if (elSttUnavailable || knownElevenLabsUnavailable()) return false;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  if (typeof window.MediaRecorder === "undefined") return false;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return false;
  }

  // Set up VAD via WebAudio analyser to auto-stop on ~1.5s of silence post-speech
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(micStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  let mimeType = "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
  }

  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined);
  } catch {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    return false;
  }

  let speechSeen = false;
  let silenceStart = 0;
  let stopped = false;
  let vadRaf: number | null = null;

  const stopAll = () => {
    if (stopped) return;
    stopped = true;
    if (vadRaf) cancelAnimationFrame(vadRaf);
    try { mediaRecorder?.stop(); } catch { /* ignore */ }
  };

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    try { ctx.close(); } catch { /* ignore */ }

    const blob = new Blob(recordedChunks, { type: mimeType || "audio/webm" });
    recordedChunks = [];
    mediaRecorder = null;

    if (blob.size > 0 && speechSeen) {
      onInterim?.("...");
      const text = await transcribeElevenLabs(blob);
      if (text) onResult(text);
      else if (knownElevenLabsUnavailable()) elSttUnavailable = true;
    }
    onEnd?.();
  };

  mediaRecorder.start(250);

  // Soft caption ping while recording
  onInterim?.("Listening...");

  const tick = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const isSpeech = rms > 0.02; // empirically reasonable for built-in mics
    const now = performance.now();
    if (isSpeech) {
      speechSeen = true;
      silenceStart = 0;
    } else if (speechSeen) {
      if (silenceStart === 0) silenceStart = now;
      else if (now - silenceStart > 1500) { stopAll(); return; }
    } else if (now - (silenceStart || now) > 8000) {
      // No speech at all after 8s — give up
      stopAll();
      return;
    }
    vadRaf = requestAnimationFrame(tick);
  };
  vadRaf = requestAnimationFrame(tick);

  // Expose stop to outer scope
  (mediaRecorder as MediaRecorder & { _stopAll?: () => void })._stopAll = stopAll;
  return true;
}

function stopListeningElevenLabs(): void {
  const r = mediaRecorder as (MediaRecorder & { _stopAll?: () => void }) | null;
  if (r?._stopAll) r._stopAll();
  else {
    try { mediaRecorder?.stop(); } catch { /* ignore */ }
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    mediaRecorder = null;
  }
}

// ─────────────────────────────────────────────
// Speech-to-Text (Web Speech API)
// ─────────────────────────────────────────────

let recognition: any = null;
let usingElevenLabsSTT = false;

export function startListening(
  onResult: (text: string) => void,
  onEnd?: () => void,
  onInterim?: (text: string) => void,
): boolean {
  stopListening();

  // Prefer ElevenLabs Scribe when configured. The promise resolves async — we
  // optimistically return true if the platform supports MediaRecorder.
  if (!elSttUnavailable && !knownElevenLabsUnavailable()
      && typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined"
      && !!navigator.mediaDevices?.getUserMedia) {
    usingElevenLabsSTT = true;
    startListeningElevenLabs(onResult, () => {
      usingElevenLabsSTT = false;
      onEnd?.();
    }, onInterim).then((ok) => {
      if (!ok) {
        // ElevenLabs path failed — fall back to Web Speech
        usingElevenLabsSTT = false;
        startWebSpeechListening(onResult, onEnd, onInterim);
      }
    });
    return true;
  }

  return startWebSpeechListening(onResult, onEnd, onInterim);
}

function startWebSpeechListening(
  onResult: (text: string) => void,
  onEnd?: () => void,
  onInterim?: (text: string) => void,
): boolean {
  const SR =
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition;

  if (!SR) return false;

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFinal = "";

  recognition.onresult = (event: any) => {
    let finalText = "";
    let interimText = "";

    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalText += event.results[i][0].transcript;
      } else {
        interimText += event.results[i][0].transcript;
      }
    }

    // Surface interim text for live caption
    if (onInterim && interimText) {
      onInterim(interimText.trim());
    }

    if (finalText && finalText !== lastFinal) {
      lastFinal = finalText;
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (finalText.trim()) {
          onResult(finalText.trim());
          lastFinal = "";
        }
      }, 1200);
    }
  };

  recognition.onend = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (lastFinal.trim()) onResult(lastFinal.trim());
    recognition = null;
    onEnd?.();
  };

  recognition.onerror = (e: any) => {
    if (e.error !== "no-speech") {
      if (silenceTimer) clearTimeout(silenceTimer);
      recognition = null;
      onEnd?.();
    }
  };

  recognition.start();
  return true;
}

export function stopListening() {
  if (usingElevenLabsSTT) {
    stopListeningElevenLabs();
    usingElevenLabsSTT = false;
    return;
  }
  try {
    recognition?.stop();
  } catch {
    // already stopped
  }
  recognition = null;
}

export function isCurrentlyListening() {
  return recognition !== null || usingElevenLabsSTT;
}

// ─────────────────────────────────────────────
// Text-to-Speech
// ─────────────────────────────────────────────

function stripForSpeech(text: string): string {
  return text
    .replace(/\\\[[\s\S]*?\\\]/g, "")
    .replace(/\\\([\s\S]*?\\\)/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$]+\$/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_~`\\[\](){}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Active playback state
let activeFlag = false;
let kokoroSource: AudioBufferSourceNode | null = null;
let kokoroCtx: AudioContext | null = null;

// Web Speech fallback state
let sentenceQueue: string[] = [];

// ── Kokoro TTS ────────────────────────────────

async function speakKokoro(
  sentences: string[],
  onEnd: () => void,
  onWordBoundary?: (word: string) => void,
): Promise<void> {
  const tts = await loadKokoro();

  async function playNext(remaining: string[]): Promise<void> {
    if (!activeFlag || remaining.length === 0) {
      onEnd();
      return;
    }

    const sentence = remaining[0];
    let audio: any;
    try {
      audio = await tts.generate(sentence, { voice: "af_heart" });
    } catch {
      // Generation failed — skip sentence, keep going
      return playNext(remaining.slice(1));
    }

    if (!activeFlag) { onEnd(); return; }

    kokoroCtx = new AudioContext();
    const buffer = kokoroCtx.createBuffer(
      1,
      audio.audio.length,
      audio.sampling_rate,
    );
    buffer.getChannelData(0).set(audio.audio);

    kokoroSource = kokoroCtx.createBufferSource();
    kokoroSource.buffer = buffer;
    kokoroSource.connect(kokoroCtx.destination);

    // Simulate word boundaries: spread words evenly over the audio duration
    if (onWordBoundary) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      const msPerWord = (buffer.duration * 1000) / Math.max(words.length, 1);
      words.forEach((word, i) => {
        setTimeout(() => {
          if (activeFlag) onWordBoundary(word);
        }, i * msPerWord);
      });
    }

    kokoroSource.onended = () => {
      kokoroCtx?.close();
      kokoroCtx = null;
      kokoroSource = null;
      playNext(remaining.slice(1));
    };

    kokoroSource.start();
  }

  await playNext(sentences);
}

// ── Web Speech fallback ───────────────────────

function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  return (
    // Prefer neural / enhanced / premium system voices (macOS, Windows 11)
    voices.find((v) => v.lang.startsWith("en") && /neural|enhanced|premium/i.test(v.name)) ??
    voices.find((v) => v.name.includes("Google") && v.lang.startsWith("en")) ??
    voices.find((v) => v.lang.startsWith("en-") && v.localService) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

function speakWebSpeech(
  sentences: string[],
  onEnd: () => void,
  onWordBoundary?: (word: string) => void,
): void {
  const synth = window.speechSynthesis;
  sentenceQueue = [...sentences];

  function speakNext() {
    if (!activeFlag || sentenceQueue.length === 0) {
      activeFlag = false;
      onEnd();
      return;
    }

    const sentence = sentenceQueue.shift()!;
    const utt = new SpeechSynthesisUtterance(sentence);
    utt.lang = "en-US";
    utt.rate = 1;
    utt.pitch = 1;
    utt.volume = 1;

    const voice = pickVoice(synth);
    if (voice) utt.voice = voice;

    if (onWordBoundary) {
      utt.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name !== "word") return;
        const word = sentence.slice(event.charIndex).match(/^\S+/)?.[0] ?? "";
        if (word) onWordBoundary(word);
      };
    }

    utt.onend = () => speakNext();
    utt.onerror = () => speakNext();
    synth.speak(utt);
  }

  let started = false;
  function tryStart() {
    if (started) return;
    started = true;
    speakNext();
  }

  if (synth.getVoices().length > 0) {
    tryStart();
  } else {
    synth.onvoiceschanged = () => {
      synth.onvoiceschanged = null;
      tryStart();
    };
    setTimeout(tryStart, 500);
  }
}

// ── Public API ────────────────────────────────

export interface SpeakOptions {
  persona?: string;        // ElevenLabs voice mapping
  onEnd?: () => void;
  onWordBoundary?: (word: string) => void;
}

/**
 * Speak text using the best available TTS. Order of preference:
 *   1. ElevenLabs (high quality, persona-mapped)
 *   2. Kokoro    (local ONNX, neural)
 *   3. Web Speech API (built-in browser fallback)
 */
export function speak(
  text: string,
  onEndOrOpts?: (() => void) | SpeakOptions,
  onWordBoundary?: (word: string) => void,
): void {
  // Back-compat: previous signature was speak(text, onEnd, onWordBoundary)
  const opts: SpeakOptions =
    typeof onEndOrOpts === "function"
      ? { onEnd: onEndOrOpts, onWordBoundary }
      : { ...(onEndOrOpts ?? {}), onWordBoundary: onEndOrOpts?.onWordBoundary ?? onWordBoundary };

  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!synth && !getKokoroSync() && knownElevenLabsUnavailable()) {
    opts.onEnd?.();
    return;
  }

  stopSpeaking();
  activeFlag = true;

  const clean = stripForSpeech(text);
  if (!clean) {
    activeFlag = false;
    opts.onEnd?.();
    return;
  }

  const sentences = (clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean])
    .map((s) => s.trim())
    .filter(Boolean);

  const handleEnd = () => {
    activeFlag = false;
    opts.onEnd?.();
  };

  const fallbackChain = () => {
    if (!activeFlag) { handleEnd(); return; }
    const kokoro = getKokoroSync();
    if (kokoro) {
      speakKokoro(sentences, handleEnd, opts.onWordBoundary).catch(() => {
        speakWebSpeech(sentences, handleEnd, opts.onWordBoundary);
      });
    } else {
      speakWebSpeech(sentences, handleEnd, opts.onWordBoundary);
      loadKokoro().catch(() => {});
    }
  };

  // Try ElevenLabs first. If it fails (no key, network, etc.), fall back.
  if (!knownElevenLabsUnavailable()) {
    speakElevenLabs(clean, {
      persona: opts.persona,
      onWordBoundary: opts.onWordBoundary,
      onEnd: handleEnd,
    }).then((ok) => {
      if (!ok && activeFlag) fallbackChain();
    });
  } else {
    fallbackChain();
  }
}

export function stopSpeaking(): void {
  activeFlag = false;
  sentenceQueue = [];
  // Stop ElevenLabs
  stopElevenLabs();
  // Stop Kokoro
  try { kokoroSource?.stop(); } catch { /* already stopped */ }
  kokoroSource = null;
  kokoroCtx?.close();
  kokoroCtx = null;
  // Stop Web Speech
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  // ElevenLabs Scribe path requires MediaRecorder + getUserMedia
  const hasMediaRecorder = typeof window.MediaRecorder !== "undefined"
    && !!navigator.mediaDevices?.getUserMedia;
  const hasWebSpeech = !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);
  return hasMediaRecorder || hasWebSpeech;
}
