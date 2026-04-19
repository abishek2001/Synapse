import { NextRequest } from "next/server";
import {
  ELEVENLABS_API_KEY,
  ELEVENLABS_BASE,
  DEFAULT_TTS_MODEL,
  voiceForPersona,
  isElevenLabsConfigured,
} from "@/lib/voice/elevenlabs-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stream TTS audio from ElevenLabs.
 *
 * POST { text: string, persona?: string, voiceId?: string }
 *  → 200 audio/mpeg (chunked) on success
 *  → 503 if no API key (client should fall back to kokoro/Web Speech)
 *  → upstream status on ElevenLabs error
 */
export async function POST(req: NextRequest) {
  if (!isElevenLabsConfigured()) {
    return new Response(
      JSON.stringify({ error: "ElevenLabs not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { text?: string; persona?: string; voiceId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return new Response(JSON.stringify({ error: "text is required" }), { status: 400 });
  }
  // Hard cap so a runaway response can't burn quota
  const safeText = text.slice(0, 4000);

  const voiceId = body.voiceId ?? voiceForPersona(body.persona);

  const upstream = await fetch(
    `${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: safeText,
        model_id: DEFAULT_TTS_MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "upstream error");
    console.error("[elevenlabs/tts] upstream error", upstream.status, errText.slice(0, 300));
    return new Response(
      JSON.stringify({ error: "ElevenLabs TTS failed", status: upstream.status }),
      { status: upstream.status === 401 ? 401 : 502, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
