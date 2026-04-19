/**
 * Server-side ElevenLabs configuration.
 *
 * Voice IDs are public defaults from ElevenLabs' library — these all work
 * without any custom voice cloning. If `ELEVENLABS_API_KEY` isn't set, the
 * routes return 503 and the client falls back to kokoro / Web Speech.
 */

export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
export const ELEVENLABS_BASE = "https://api.elevenlabs.io";

/** Default model — flash is fastest with good quality, good for streaming. */
export const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";

/**
 * Persona → ElevenLabs voice ID. All IDs are from ElevenLabs' default voice
 * library (no API call needed to list them; they're documented & stable).
 *
 * Sources:
 *   - "Adam"     pNInz6obpgDQGcFmaJgB  → professor (warm, scholarly male)
 *   - "Brian"    nPczCjzI2devNBz1zQrb  → engineer (clear, methodical male)
 *   - "Bella"    EXAVITQu4vr4xnSDxMaL  → friend (casual, relatable female)
 *   - "Antoni"   ErXwobaYiN019PkySvjV  → explorer (curious male)
 *   - "Daniel"   onwK4e9ZLuTAKqWW03F9  → philosopher (deep, contemplative)
 */
export const PERSONA_VOICES: Record<string, string> = {
  professor:   "pNInz6obpgDQGcFmaJgB",
  engineer:    "nPczCjzI2devNBz1zQrb",
  friend:      "EXAVITQu4vr4xnSDxMaL",
  explorer:    "ErXwobaYiN019PkySvjV",
  philosopher: "onwK4e9ZLuTAKqWW03F9",
};

/**
 * Friendly metadata for the voice picker UI. Order here is the order shown
 * in the popover. `personaKey` maps back to `PERSONA_VOICES` and
 * `useSessionStore.persona`.
 */
export interface VoiceOption {
  personaKey: string;
  voiceId: string;
  label: string;
  blurb: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { personaKey: "professor",   voiceId: PERSONA_VOICES.professor,   label: "Professor",   blurb: "Warm & scholarly" },
  { personaKey: "engineer",    voiceId: PERSONA_VOICES.engineer,    label: "Engineer",    blurb: "Clear & methodical" },
  { personaKey: "friend",      voiceId: PERSONA_VOICES.friend,      label: "Friend",      blurb: "Casual & relatable" },
  { personaKey: "explorer",    voiceId: PERSONA_VOICES.explorer,    label: "Explorer",    blurb: "Curious & energetic" },
  { personaKey: "philosopher", voiceId: PERSONA_VOICES.philosopher, label: "Philosopher", blurb: "Deep & contemplative" },
];

export const DEFAULT_VOICE_ID = PERSONA_VOICES.professor;

export function isElevenLabsConfigured(): boolean {
  return ELEVENLABS_API_KEY.length > 0;
}

export function voiceForPersona(personaId?: string | null): string {
  if (!personaId) return DEFAULT_VOICE_ID;
  return PERSONA_VOICES[personaId] ?? DEFAULT_VOICE_ID;
}
