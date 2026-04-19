import { DEMO_SCRIPTS } from "./index";
import type { DemoScript } from "./types";

/** Case-insensitive keyword match. Picks the demo whose `keywords` first
 *  appear in the user's typed query. Returns null if no demo matches. */
export function matchDemoByQuery(query: string): DemoScript | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  for (const script of DEMO_SCRIPTS) {
    for (const kw of script.keywords) {
      if (q.includes(kw.toLowerCase())) return script;
    }
  }
  return null;
}
