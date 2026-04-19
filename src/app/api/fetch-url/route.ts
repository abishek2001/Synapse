import { NextRequest, NextResponse } from "next/server";

// Jina Reader: converts any URL to clean markdown (free, no key needed)
const JINA_BASE = "https://r.jina.ai/";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url: string };
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const jinaUrl = `${JINA_BASE}${normalized}`;

    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "markdown",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Jina fetch failed: ${res.status}` }, { status: 502 });
    }

    const text = await res.text();
    const name = new URL(normalized).hostname.replace(/^www\./, "");

    return NextResponse.json({ name, text: text.slice(0, 80_000) }); // cap at 80k chars
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
