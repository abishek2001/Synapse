// Sketchfab integration — server-side resolution of real, embeddable 3D models.
//
// LLMs hallucinate Sketchfab UIDs. To stop that, the tutor never supplies a
// raw embed URL; it supplies a search query (e.g. "human respiratory system")
// and this module hits the public Sketchfab v3 API to find a real, public,
// viewable model and returns the canonical embed URL.
//
// API docs: https://docs.sketchfab.com/data-api/v3/index.html#/search

const SEARCH_API = "https://api.sketchfab.com/v3/search";
const MODEL_API = "https://api.sketchfab.com/v3/models";

// Sketchfab UIDs are 32-char lowercase hex strings.
const UID_RE = /\b([0-9a-f]{32})\b/i;

export interface SketchfabHit {
  uid: string;
  name: string;
  embedUrl: string;     // canonical embed URL (no query string)
  viewerUrl: string;    // public model page
  likeCount: number;
  viewCount: number;
}

interface RawSketchfabResult {
  uid?: string;
  name?: string;
  embedUrl?: string;
  viewerUrl?: string;
  likeCount?: number;
  viewCount?: number;
  isProtected?: boolean;
  isAgeRestricted?: boolean;
}

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "and", "or", "to", "for", "with", "human",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Search Sketchfab for the best-matching public model.
 *
 * Strategy:
 * - Use Sketchfab's default relevance sort (NOT -likeCount) — popularity-only sort
 *   over-weights generic models and surfaces unrelated hits (e.g. "ear cross section"
 *   for "human heart cross section").
 * - Re-rank locally: 5 × (count of query tokens that appear in model name) + log(1 + likes).
 *   Lexical overlap is the strongest signal that the model is actually about the topic;
 *   likes is a quality tiebreaker.
 * - Filter out protected / age-restricted models.
 *
 * Returns null if nothing usable is found (so the caller can fall back to TIER 2/3).
 */
export async function searchSketchfab(
  query: string,
  opts: { count?: number; staffPickedOnly?: boolean } = {},
): Promise<SketchfabHit | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({
    type: "models",
    q: trimmed,
    count: String(opts.count ?? 24),
  });
  if (opts.staffPickedOnly) params.set("staffpicked", "true");

  let raw: { results?: RawSketchfabResult[] } | null = null;
  try {
    const res = await fetch(`${SEARCH_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      // Sketchfab is occasionally slow; bail before the LLM round times out.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    raw = (await res.json()) as { results?: RawSketchfabResult[] };
  } catch {
    return null;
  }

  const candidates = (Array.isArray(raw?.results) ? raw.results : [])
    .filter((r): r is RawSketchfabResult & { uid: string; embedUrl: string } =>
      Boolean(r.uid && r.embedUrl && !r.isProtected && !r.isAgeRestricted),
    );

  if (candidates.length === 0) return null;

  const queryTokens = tokenize(trimmed);
  const scored = candidates
    .map((c) => {
      const nameTokens = tokenize(c.name ?? "");
      const overlap = queryTokens.reduce(
        (acc, t) => acc + (nameTokens.includes(t) ? 1 : 0),
        0,
      );
      const popularity = Math.log(1 + (c.likeCount ?? 0));
      return { hit: c, score: overlap * 5 + popularity };
    })
    .sort((a, b) => b.score - a.score);

  // Require at least one query word to appear in the name OR the popularity floor —
  // otherwise we'd surface random Trending-Now models for unmatched queries.
  const top = scored[0];
  if (!top) return null;
  if (top.score <= 0) return null;

  const r = top.hit;
  return {
    uid: r.uid,
    name: r.name ?? "Sketchfab model",
    embedUrl: r.embedUrl,
    viewerUrl: r.viewerUrl ?? `https://sketchfab.com/3d-models/${r.uid}`,
    likeCount: r.likeCount ?? 0,
    viewCount: r.viewCount ?? 0,
  };
}

/** Pull a 32-char hex UID out of any sketchfab.com URL. */
export function extractSketchfabUid(input: string): string | null {
  const match = input.match(UID_RE);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Confirm a model UID actually exists on Sketchfab and is embeddable.
 * Uses the v3 model endpoint (returns 200 + JSON when real, 404 when not).
 */
export async function validateSketchfabUid(uid: string): Promise<SketchfabHit | null> {
  if (!UID_RE.test(uid)) return null;

  try {
    const res = await fetch(`${MODEL_API}/${uid}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const r = (await res.json()) as RawSketchfabResult;
    if (!r.uid || !r.embedUrl) return null;
    if (r.isProtected || r.isAgeRestricted) return null;
    return {
      uid: r.uid,
      name: r.name ?? "Sketchfab model",
      embedUrl: r.embedUrl,
      viewerUrl: r.viewerUrl ?? `https://sketchfab.com/3d-models/${r.uid}`,
      likeCount: r.likeCount ?? 0,
      viewCount: r.viewCount ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Build the final iframe URL with the UI flags Synapse prefers
 * (autoplay, dark theme, hide watermarks/info).
 */
export function buildEmbedUrl(embedUrl: string): string {
  const sep = embedUrl.includes("?") ? "&" : "?";
  return `${embedUrl}${sep}autostart=1&ui_theme=dark&ui_infos=0&ui_controls=1&ui_watermark=0&ui_hint=0`;
}

/** Best-effort resolver — try `query` first, then any embed_url the model passed. */
export async function resolveSketchfabModel(input: {
  query?: string;
  embedUrl?: string;
}): Promise<SketchfabHit | null> {
  if (input.query) {
    const hit = await searchSketchfab(input.query);
    if (hit) return hit;
  }
  if (input.embedUrl) {
    const uid = extractSketchfabUid(input.embedUrl);
    if (uid) {
      const hit = await validateSketchfabUid(uid);
      if (hit) return hit;
    }
  }
  return null;
}
