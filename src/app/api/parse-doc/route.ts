import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";

const MAX_TEXT_LENGTH = 12000;

export async function POST(req: NextRequest) {
  try {
    const { files } = (await req.json()) as {
      files: { name: string; type: string; dataUrl: string }[];
    };

    if (!files?.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: { name: string; text: string }[] = [];

    for (const file of files) {
      try {
        const base64 = file.dataUrl.split(",")[1];
        if (!base64) continue;

        const buffer = Buffer.from(base64, "base64");
        let text = "";

        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
          const data = await pdfParse(buffer);
          text = data.text;
        } else if (
          file.type.startsWith("text/") ||
          file.name.match(/\.(txt|md|csv|json|html)$/i)
        ) {
          text = buffer.toString("utf-8");
        } else {
          text = `[File: ${file.name} — unsupported format for text extraction]`;
        }

        if (text.length > MAX_TEXT_LENGTH) {
          text =
            text.slice(0, MAX_TEXT_LENGTH) +
            "\n\n[... content truncated for context window ...]";
        }

        results.push({ name: file.name, text: text.trim() });
      } catch (err) {
        results.push({
          name: file.name,
          text: `[Failed to parse: ${err instanceof Error ? err.message : "unknown error"}]`,
        });
      }
    }

    return NextResponse.json({ documents: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
