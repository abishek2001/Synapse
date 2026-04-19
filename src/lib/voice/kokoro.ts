"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Lazy singleton — loaded once, reused across all speak() calls.
// Prefers a locally-hosted model at /models/kokoro/ (served from public/).
// Falls back to the HuggingFace remote model if the local copy isn't present.
// Run `node scripts/download-kokoro.mjs` once to download the local copy.

let instance: any | null = null;
let loadPromise: Promise<any> | null = null;

async function resolveModelSource(): Promise<string> {
  try {
    const res = await fetch("/models/kokoro/config.json", { method: "HEAD" });
    if (res.ok) return window.location.origin + "/models/kokoro/";
  } catch { /* no local copy */ }
  return "onnx-community/Kokoro-82M-v1.0-ONNX";
}

export async function loadKokoro(): Promise<any> {
  if (instance) return instance;
  if (!loadPromise) {
    loadPromise = (async () => {
      const { KokoroTTS } = await import("kokoro-js");
      const modelSource = await resolveModelSource();
      const tts = await KokoroTTS.from_pretrained(modelSource, { dtype: "q8" });
      instance = tts;
      return tts;
    })();
  }
  return loadPromise;
}

/** Returns the instance only if already loaded — no await, no side-effects. */
export function getKokoroSync(): any | null {
  return instance;
}

/** Call this early (workspace mount) to start loading in the background. */
export function preloadKokoro(): void {
  if (typeof window === "undefined") return;
  loadKokoro().catch(() => {
    loadPromise = null; // allow retry on next speak()
  });
}
