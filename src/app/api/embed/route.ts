import { NextRequest, NextResponse } from "next/server";
import { buildRetrievalIndex, getChunkCount } from "@/lib/grounding/retrieval";

export async function POST(req: NextRequest) {
  try {
    const { documentContext } = await req.json();

    if (!documentContext) {
      return NextResponse.json({ error: "documentContext is required" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const count = await buildRetrievalIndex(documentContext);
    return NextResponse.json({ chunks: count, indexed: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Embed API error:", message);
    return NextResponse.json({ error: message, chunks: getChunkCount() }, { status: 500 });
  }
}
