import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

export interface RetrievalChunk {
  text: string;
  source: string;
  score: number;
}

export interface EmbeddedChunk {
  text: string;
  source: string;
  embedding: number[];
}

let embeddingCache: EmbeddedChunk[] = [];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

function splitIntoChunks(
  text: string,
  chunkSize: number,
): { text: string; source: string }[] {
  const chunks: { text: string; source: string }[] = [];
  const docSections = text.split(/===\s+(.+?)\s+===/);

  let currentSource = "document";
  for (let i = 0; i < docSections.length; i++) {
    const section = docSections[i].trim();
    if (!section) continue;

    if (i % 2 === 1) {
      currentSource = section;
      continue;
    }

    const sentences = section.split(/(?<=[.!?])\s+/);
    let current = "";
    for (const sentence of sentences) {
      if ((current + " " + sentence).length > chunkSize && current) {
        chunks.push({ text: current.trim(), source: currentSource });
        current = sentence;
      } else {
        current += (current ? " " : "") + sentence;
      }
    }
    if (current.trim()) {
      chunks.push({ text: current.trim(), source: currentSource });
    }
  }

  return chunks;
}

export async function buildRetrievalIndex(
  documentContext: string,
): Promise<number> {
  const rawChunks = splitIntoChunks(documentContext, 400);
  if (rawChunks.length === 0) return 0;

  const texts = rawChunks.map((c) => c.text);

  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });

    embeddingCache = rawChunks.map((chunk, i) => ({
      ...chunk,
      embedding: res.data[i].embedding,
    }));

    return embeddingCache.length;
  } catch {
    embeddingCache = rawChunks.map((chunk) => ({
      ...chunk,
      embedding: [],
    }));
    return embeddingCache.length;
  }
}

export async function semanticSearch(
  query: string,
  maxResults: number = 3,
): Promise<RetrievalChunk[]> {
  if (embeddingCache.length === 0) return [];

  const hasEmbeddings = embeddingCache[0]?.embedding.length > 0;

  if (!hasEmbeddings) {
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return embeddingCache
      .map((chunk) => {
        const lower = chunk.text.toLowerCase();
        const score = keywords.reduce(
          (acc, kw) => acc + (lower.includes(kw) ? 1 : 0),
          0,
        );
        return { text: chunk.text, source: chunk.source, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const queryEmb = res.data[0].embedding;

    return embeddingCache
      .map((chunk) => ({
        text: chunk.text,
        source: chunk.source,
        score: cosineSimilarity(queryEmb, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

export function getChunkCount(): number {
  return embeddingCache.length;
}

export function clearIndex(): void {
  embeddingCache = [];
}
