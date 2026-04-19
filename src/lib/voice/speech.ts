"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { loadKokoro, getKokoroSync } from "./kokoro";

// ─────────────────────────────────────────────
// Speech-to-Text (Web Speech API)
// ─────────────────────────────────────────────

let recognition: any = null;

export function startListening(
  onResult: (text: string) => void,
  onEnd?: () => void,
  onInterim?: (text: string) => void,
): boolean {
  const SR =
    (window as any).SpeechRecognition ??
    (window as any).webkitSpeechRecognition;

  if (!SR) return false;

  stopListening();

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
  try {
    recognition?.stop();
  } catch {
    // already stopped
  }
  recognition = null;
}

export function isCurrentlyListening() {
  return recognition !== null;
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

export function speak(
  text: string,
  onEnd?: () => void,
  onWordBoundary?: (word: string) => void,
): void {
  const synth = window.speechSynthesis;
  if (!synth && !getKokoroSync()) {
    onEnd?.();
    return;
  }

  stopSpeaking();
  activeFlag = true;

  const clean = stripForSpeech(text);
  if (!clean) {
    activeFlag = false;
    onEnd?.();
    return;
  }

  const sentences = (clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean])
    .map((s) => s.trim())
    .filter(Boolean);

  const handleEnd = () => {
    activeFlag = false;
    onEnd?.();
  };

  const kokoro = getKokoroSync();
  if (kokoro) {
    // Kokoro already loaded — use it directly
    speakKokoro(sentences, handleEnd, onWordBoundary).catch(() => {
      speakWebSpeech(sentences, handleEnd, onWordBoundary);
    });
  } else {
    // Kokoro still loading — use Web Speech now, Kokoro on next call
    speakWebSpeech(sentences, handleEnd, onWordBoundary);
    loadKokoro().catch(() => {}); // keep warming up in background
  }
}

export function stopSpeaking(): void {
  activeFlag = false;
  sentenceQueue = [];
  // Stop Kokoro
  try { kokoroSource?.stop(); } catch { /* already stopped */ }
  kokoroSource = null;
  kokoroCtx?.close();
  kokoroCtx = null;
  // Stop Web Speech
  window.speechSynthesis?.cancel();
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);
}
