"use client";

import { knownElevenLabsUnavailable } from "./elevenlabs";

/**
 * Looped ambient "focus mode" track. We generate a single 22-second pad via
 * ElevenLabs sound-generation, cache the data URL in localStorage, and loop it
 * via a hidden <audio> element. Cheap, persistent, and works offline once
 * cached.
 */

const CACHE_KEY = "synapse:focus-music:v1";
const VOLUME = 0.12;

let audio: HTMLAudioElement | null = null;
let loading = false;
let cachedUrl: string | null = null;

function readCached(): string | null {
  if (typeof window === "undefined") return null;
  if (cachedUrl) return cachedUrl;
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v) cachedUrl = v;
    return v;
  } catch {
    return null;
  }
}
function writeCached(url: string): void {
  cachedUrl = url;
  try { localStorage.setItem(CACHE_KEY, url); } catch { /* quota */ }
}

async function fetchTrack(): Promise<string | null> {
  if (knownElevenLabsUnavailable()) return null;
  try {
    const res = await fetch("/api/voice/sfx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt:
          "Calm, low-key lo-fi study ambience — soft warm pad, very gentle vinyl crackle, "
          + "no melody, no percussion, designed to loop seamlessly. Spacious and meditative.",
        durationSeconds: 22,
        promptInfluence: 0.3,
      }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function startFocusMusic(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (audio && !audio.paused) return true;

  let url = readCached();
  if (!url) {
    if (loading) return false;
    loading = true;
    url = await fetchTrack();
    loading = false;
    if (!url) return false;
    writeCached(url);
  }

  audio = new Audio(url);
  audio.loop = true;
  audio.volume = VOLUME;
  try {
    await audio.play();
    return true;
  } catch {
    audio = null;
    return false;
  }
}

export function stopFocusMusic(): void {
  if (!audio) return;
  try { audio.pause(); audio.currentTime = 0; } catch { /* ignore */ }
  audio = null;
}

export function isFocusMusicPlaying(): boolean {
  return !!audio && !audio.paused && !audio.ended;
}
