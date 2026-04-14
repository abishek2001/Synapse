const URL_REGEX = /https?:\/\/[^\s/$.?#].[^\s]*/gi;

export function detectUrls(text: string): string[] {
  return Array.from(new Set(text.match(URL_REGEX) ?? []));
}

export function isLikelyUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Single token that looks like a URL (no spaces, starts with http/https or www.)
  if (trimmed.includes(" ")) return false;
  return /^https?:\/\//i.test(trimmed) || /^www\.[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed);
}

export function stripUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
