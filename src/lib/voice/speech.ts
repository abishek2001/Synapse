"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
let recognition: any = null;

export function startListening(
  onResult: (text: string) => void,
  onEnd?: () => void,
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
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalText += event.results[i][0].transcript;
      }
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

/* ───────── Text-to-Speech ───────── */

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

let activeFlag = false;
let sentenceQueue: string[] = [];

export function speak(text: string, onEnd?: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) {
    onEnd?.();
    return;
  }

  synth.cancel();
  activeFlag = true;

  const clean = stripForSpeech(text);
  if (!clean) {
    activeFlag = false;
    onEnd?.();
    return;
  }

  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  sentenceQueue = sentences.map((s) => s.trim()).filter(Boolean);

  if (sentenceQueue.length === 0) {
    activeFlag = false;
    onEnd?.();
    return;
  }

  function pickVoice(): SpeechSynthesisVoice | null {
    const voices = synth.getVoices();
    return (
      voices.find((v) => v.name.includes("Google") && v.lang.startsWith("en")) ??
      voices.find((v) => v.lang.startsWith("en-") && v.localService) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null
    );
  }

  function speakNext() {
    if (!activeFlag || sentenceQueue.length === 0) {
      activeFlag = false;
      onEnd?.();
      return;
    }

    const sentence = sentenceQueue.shift()!;
    const utt = new SpeechSynthesisUtterance(sentence);
    utt.lang = "en-US";
    utt.rate = 1;
    utt.pitch = 1;
    utt.volume = 1;

    const voice = pickVoice();
    if (voice) utt.voice = voice;

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

export function stopSpeaking() {
  activeFlag = false;
  sentenceQueue = [];
  window.speechSynthesis?.cancel();
}

export function isSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isRecognitionSupported() {
  if (typeof window === "undefined") return false;
  return !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);
}
