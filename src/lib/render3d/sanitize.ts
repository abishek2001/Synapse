// Strip markdown fences and obvious unsafe patterns from generated Three.js scene code.
// Render3DCard's iframe is `sandbox` + srcdoc with no allow-same-origin, so the JS
// runs in a null origin already. Sanitization here is belt-and-suspenders against the
// generator emitting paths that would obviously break (markdown fences, fetch calls
// to non-CORS hosts, module-level network APIs).

const BLOCKED_PATTERNS: RegExp[] = [
  /\bXMLHttpRequest\b/gi,
  /\beval\s*\(/gi,
  /\bnew\s+Function\s*\(/gi,
  /\bdocument\.cookie\b/gi,
  /\blocalStorage\b/gi,
  /\bsessionStorage\b/gi,
  /\bindexedDB\b/gi,
  /\bnavigator\.sendBeacon\b/gi,
  /\bWebSocket\b/gi,
  /\bEventSource\b/gi,
  /\bSharedWorker\b/gi,
  /\bServiceWorker\b/gi,
  /window\.open\s*\(/gi,
  /window\.location\s*=/gi,
];

export function sanitizeRender3DCode(raw: string): { code: string; issues: string[] } {
  const issues: string[] = [];
  let code = raw.trim();

  // Strip markdown fences if the LLM wrapped it.
  code = code
    .replace(/^```(?:javascript|js|html)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  // Strip enclosing <script> tags if the LLM hallucinated full HTML.
  code = code.replace(/^<script[^>]*>/i, "").replace(/<\/script>\s*$/i, "");

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      const match = code.match(pattern);
      if (match) issues.push(`Blocked pattern removed: ${match[0]}`);
      code = code.replace(pattern, "/* BLOCKED */");
    }
    pattern.lastIndex = 0;
  }

  return { code: code.trim(), issues };
}
