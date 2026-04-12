const BLOCKED_PATTERNS = [
  /\bfetch\s*\(/gi,
  /\bXMLHttpRequest\b/gi,
  /\bimport\s*\(/gi,
  /\bimport\s+/gi,
  /\brequire\s*\(/gi,
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
  /document\.write\s*\(/gi,
];

const ALLOWED_SCRIPT_SRCS = [
  "cdnjs.cloudflare.com/ajax/libs/three.js",
  "unpkg.com/three",
  "cdn.jsdelivr.net/npm/three",
];

export function sanitizeSimulationCode(html: string): { safe: boolean; code: string; issues: string[] } {
  const issues: string[] = [];
  let code = html.trim();

  // Strip markdown fences if LLM wrapped it
  code = code.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      const match = code.match(pattern);
      issues.push(`Blocked pattern: ${match?.[0]}`);
      code = code.replace(pattern, "/* BLOCKED */");
    }
    pattern.lastIndex = 0;
  }

  // Validate it looks like HTML
  if (!code.includes("<html") && !code.includes("<!DOCTYPE")) {
    // Try wrapping bare script content
    if (code.includes("THREE.")) {
      code = wrapBareScript(code);
    } else {
      issues.push("Output does not appear to be valid HTML");
      return { safe: false, code, issues };
    }
  }

  // Validate Three.js script source
  const scriptSrcs = [...code.matchAll(/src=["']([^"']+)["']/gi)].map((m) => m[1]);
  for (const src of scriptSrcs) {
    const isAllowed = ALLOWED_SCRIPT_SRCS.some((allowed) => src.includes(allowed));
    if (!isAllowed && !src.startsWith("data:")) {
      issues.push(`External script source not allowed: ${src}`);
      code = code.replace(src, "/* BLOCKED_SRC */");
    }
  }

  // Force sandbox-safe postMessage origin
  code = code.replace(/postMessage\([^)]+,\s*['"][^'"]+['"]\)/g, (match) => {
    return match.replace(/,\s*['"][^'"]+['"]/, ", '*'");
  });

  return { safe: issues.length === 0, code, issues };
}

function wrapBareScript(script: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0b14; overflow: hidden; }
  canvas { display: block; }
</style>
</head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<script>
${script}
<\/script>
</body>
</html>`;
}
