"use client";

import { knownElevenLabsUnavailable } from "./elevenlabs";

/**
 * Small per-event sound effects, generated on-demand by ElevenLabs Sound
 * Generation and cached in localStorage so we only pay once per event type.
 *
 * Falls back to a simple WebAudio synthesised tone if ElevenLabs isn't
 * available — so the UX still feels alive even without an API key.
 */

const CACHE_KEY = "synapse:sfx:v1";
const MAX_CACHE = 16;
const SFX_VOLUME = 0.18;
let muted = false;

interface CacheEntry {
  prompt: string;
  dataUrl: string;
  ts: number;
}

function readCache(): Record<string, CacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    // Evict oldest if over cap
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE) {
      entries.sort((a, b) => a[1].ts - b[1].ts);
      const trimmed = Object.fromEntries(entries.slice(-MAX_CACHE));
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    /* quota exceeded — silently ignore */
  }
}

async function fetchSfx(prompt: string, durationSeconds: number): Promise<string | null> {
  if (knownElevenLabsUnavailable()) return null;
  try {
    const res = await fetch("/api/voice/sfx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, durationSeconds, promptInfluence: 0.4 }),
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

function playDataUrl(dataUrl: string): void {
  if (muted) return;
  const audio = new Audio(dataUrl);
  audio.volume = SFX_VOLUME;
  audio.play().catch(() => { /* ignore autoplay rejection */ });
}

/** Fallback: tiny WebAudio "tick" — pitch encodes intent (good vs bad). */
function synthFallback(kind: SfxKind): void {
  if (muted) return;
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const presets: Record<SfxKind, { freq: number; type: OscillatorType; dur: number }> = {
      "artifact-added":   { freq: 880, type: "sine",     dur: 0.10 },
      "mode-picked":      { freq: 660, type: "triangle", dur: 0.18 },
      "module-complete":  { freq: 988, type: "sine",     dur: 0.22 },
      "voice-listen-on":  { freq: 540, type: "sine",     dur: 0.08 },
      "voice-listen-off": { freq: 380, type: "sine",     dur: 0.10 },
      "error":            { freq: 220, type: "sawtooth", dur: 0.18 },
      "success":          { freq: 1175, type: "sine",    dur: 0.20 },
    };
    const p = presets[kind];
    osc.type = p.type;
    osc.frequency.value = p.freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(SFX_VOLUME, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + p.dur);
    osc.start();
    osc.stop(ctx.currentTime + p.dur + 0.05);
    setTimeout(() => ctx.close().catch(() => {}), (p.dur + 0.1) * 1000);
  } catch {
    /* ignore */
  }
}

export type SfxKind =
  | "artifact-added"
  | "mode-picked"
  | "module-complete"
  | "voice-listen-on"
  | "voice-listen-off"
  | "error"
  | "success";

const PROMPTS: Record<SfxKind, { prompt: string; duration: number }> = {
  "artifact-added":   { prompt: "soft, magical UI chime — glassy ping, very short", duration: 0.6 },
  "mode-picked":      { prompt: "warm confirmation tone — soft synth pluck", duration: 0.8 },
  "module-complete":  { prompt: "gentle achievement bell — short, sparkly", duration: 1.2 },
  "voice-listen-on":  { prompt: "subtle attention chirp — soft mid-tone blip", duration: 0.4 },
  "voice-listen-off": { prompt: "soft tap-off click — woody muted percussion", duration: 0.3 },
  "error":            { prompt: "polite low-tone bonk — soft warning, not harsh", duration: 0.5 },
  "success":          { prompt: "delicate success shimmer — three-note ascending sparkle", duration: 1.0 },
};

const inflight = new Map<SfxKind, Promise<string | null>>();

export function setSfxMuted(v: boolean): void { muted = v; }
export function isSfxMuted(): boolean { return muted; }

/**
 * Play a sound effect by event kind. First call generates + caches; subsequent
 * calls play instantly from cache. If no API key, uses a synthesised tone.
 */
export function playSfx(kind: SfxKind): void {
  if (muted) return;

  // Cached?
  const cache = readCache();
  const hit = cache[kind];
  if (hit?.dataUrl) {
    playDataUrl(hit.dataUrl);
    return;
  }

  // Fallback synth tone immediately so the user gets feedback now
  synthFallback(kind);

  // Already fetching this kind?
  if (inflight.has(kind)) return;

  // Try to generate + cache for next time
  const { prompt, duration } = PROMPTS[kind];
  const promise = fetchSfx(prompt, duration);
  inflight.set(kind, promise);
  promise.then((dataUrl) => {
    inflight.delete(kind);
    if (!dataUrl) return;
    const next = readCache();
    next[kind] = { prompt, dataUrl, ts: Date.now() };
    writeCache(next);
  });
}

/** Eagerly generate a few common sfx so the first plays are instant. */
export function preloadSfx(kinds: SfxKind[] = ["artifact-added", "mode-picked"]): void {
  if (typeof window === "undefined") return;
  if (knownElevenLabsUnavailable()) return;
  const cache = readCache();
  for (const k of kinds) {
    if (cache[k] || inflight.has(k)) continue;
    const { prompt, duration } = PROMPTS[k];
    const promise = fetchSfx(prompt, duration);
    inflight.set(k, promise);
    promise.then((dataUrl) => {
      inflight.delete(k);
      if (!dataUrl) return;
      const next = readCache();
      next[k] = { prompt, dataUrl, ts: Date.now() };
      writeCache(next);
    });
  }
}
