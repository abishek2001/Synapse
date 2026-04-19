import { NextRequest } from "next/server";
import {
  ELEVENLABS_API_KEY,
  ELEVENLABS_BASE,
  isElevenLabsConfigured,
} from "@/lib/voice/elevenlabs-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generate a short sound effect via ElevenLabs Text-to-SFX.
 *
 * POST { prompt: string, durationSeconds?: number, promptInfluence?: number }
 *  → 200 audio/mpeg
 */
export async function POST(req: NextRequest) {
  if (!isElevenLabsConfigured()) {
    return new Response(JSON.stringify({ error: "ElevenLabs not configured" }), { status: 503 });
  }

  let body: { prompt?: string; durationSeconds?: number; promptInfluence?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return new Response(JSON.stringify({ error: "prompt is required" }), { status: 400 });

  const durationSeconds = Math.max(0.5, Math.min(22, body.durationSeconds ?? 1.5));
  const promptInfluence = Math.max(0, Math.min(1, body.promptInfluence ?? 0.5));

  const res = await fetch(`${ELEVENLABS_BASE}/v1/sound-generation`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: prompt.slice(0, 450),
      duration_seconds: durationSeconds,
      prompt_influence: promptInfluence,
    }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "upstream error");
    console.error("[elevenlabs/sfx] upstream error", res.status, errText.slice(0, 300));
    return new Response(JSON.stringify({ error: "SFX generation failed" }), { status: 502 });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
