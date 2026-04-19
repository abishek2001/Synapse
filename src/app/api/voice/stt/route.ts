import { NextRequest } from "next/server";
import {
  ELEVENLABS_API_KEY,
  ELEVENLABS_BASE,
  isElevenLabsConfigured,
} from "@/lib/voice/elevenlabs-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transcribe an audio blob via ElevenLabs Scribe.
 *
 * Accepts multipart/form-data with field `audio` (any common audio MIME).
 * Returns { text: string, language?: string } on success.
 */
export async function POST(req: NextRequest) {
  if (!isElevenLabsConfigured()) {
    return new Response(
      JSON.stringify({ error: "ElevenLabs not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), { status: 400 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return new Response(JSON.stringify({ error: "audio file is required" }), { status: 400 });
  }
  if (audio.size > 25 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "audio too large (max 25MB)" }), { status: 413 });
  }

  // ElevenLabs Scribe expects multipart with `file` + `model_id`
  const upstream = new FormData();
  upstream.append("file", audio, "voice.webm");
  upstream.append("model_id", "scribe_v1");

  const res = await fetch(`${ELEVENLABS_BASE}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
    body: upstream,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "upstream error");
    console.error("[elevenlabs/stt] upstream error", res.status, errText.slice(0, 300));
    return new Response(
      JSON.stringify({ error: "Scribe failed", status: res.status }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const data = await res.json().catch(() => null) as {
    text?: string;
    language_code?: string;
  } | null;

  return new Response(
    JSON.stringify({
      text: data?.text ?? "",
      language: data?.language_code,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
