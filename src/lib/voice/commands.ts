/**
 * Canvas voice-command classifier.
 *
 * Sits between the speech-to-text result and the chat orchestrator: short
 * navigation phrases ("zoom in", "next module", "fit all") are intercepted
 * and dispatched as `CanvasCommand`s rather than being sent to the LLM.
 * Anything else falls through to a normal tutor question.
 *
 * Patterns are deliberately STRICT — only well-formed navigation phrases
 * count, so the user can still ask things like "Can you zoom in on the
 * Maxwell equation?" and have it routed to the tutor (because it begins
 * with "can you", not the bare "zoom in").
 */

export type CanvasCommand =
  | { type: "zoom_in"; amount?: number }
  | { type: "zoom_out"; amount?: number }
  | { type: "zoom_reset" }
  | { type: "fit_all" }
  | { type: "next_module" }
  | { type: "prev_module" }
  | { type: "goto_module"; index: number } // 1-indexed module position
  | { type: "pan"; dx: number; dy: number } // world-space pan, screen pixels
  | { type: "stop_speaking" }
  | { type: "replay" }
  | { type: "undo" }
  | { type: "clear_selection" }
  | { type: "select_all" }
  | { type: "show_help" }
  | { type: "open_doubt" };

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  next: -1, last: -2,
};

/** Extract a 1-indexed module number from the trailing tokens of `text`. */
function parseModuleIndex(text: string): number | null {
  const m = text.match(/module\s+(?:number\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)/i);
  if (!m) return null;
  const tok = m[1].toLowerCase();
  const n = /^\d+$/.test(tok) ? parseInt(tok, 10) : NUM_WORDS[tok];
  if (typeof n !== "number" || n < 1 || n > 99) return null;
  return n;
}

const PAN_AMT = 280; // screen pixels per pan command

/**
 * Classify a transcript as a navigation command, or null if it should fall
 * through to the tutor as a question.
 *
 * The classifier strips common voice-recognition pleasantries ("please",
 * leading punctuation, trailing fillers) and matches on the cleaned form.
 */
export function classifyCommand(input: string): CanvasCommand | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase().replace(/[.!?,]+$/g, "").replace(/^please\s+/, "");
  // Strip a leading "synapse" wake word if the user used one.
  const text = raw.replace(/^(?:synapse|canvas|hey synapse)\s+/i, "").trim();
  if (!text) return null;

  // ── Stop speaking / replay ───────────────────────────────────────────────
  if (/^(stop|shut up|be quiet|stop talking|stop speaking|silence)$/i.test(text)) {
    return { type: "stop_speaking" };
  }
  if (/^(replay|say (that|it) again|repeat (that|it)?|read (that|it) again)$/i.test(text)) {
    return { type: "replay" };
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────
  if (/^(zoom in( more)?|closer|magnify)$/i.test(text)) return { type: "zoom_in" };
  if (/^(zoom in (a lot|further|more))$/i.test(text)) return { type: "zoom_in", amount: 1.6 };
  if (/^(zoom out( more)?|further out|smaller)$/i.test(text)) return { type: "zoom_out" };
  if (/^(zoom out (a lot|further|more))$/i.test(text)) return { type: "zoom_out", amount: 0.6 };
  if (/^(zoom (?:to )?(reset|100|hundred (?:percent)?|natural))$/i.test(text)) return { type: "zoom_reset" };
  if (/^(reset zoom|reset view|center view|recenter)$/i.test(text)) return { type: "zoom_reset" };
  if (/^(fit (all|to screen|everything|to view)|show (all|everything)|see everything|overview)$/i.test(text)) {
    return { type: "fit_all" };
  }

  // ── Module navigation ────────────────────────────────────────────────────
  if (/^(next( module| group| one)?|forward|continue)$/i.test(text)) return { type: "next_module" };
  if (/^(previous( module| group| one)?|back( one)?|go back|prev)$/i.test(text)) return { type: "prev_module" };
  if (/^(go to|show|jump to|open|navigate to)\s+module\s+/i.test(text)) {
    const n = parseModuleIndex(text);
    if (n !== null) return { type: "goto_module", index: n };
  }
  // Bare "module 3" also counts.
  if (/^module\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)$/i.test(text)) {
    const n = parseModuleIndex(text);
    if (n !== null) return { type: "goto_module", index: n };
  }

  // ── Pan ──────────────────────────────────────────────────────────────────
  if (/^(pan|scroll|move)\s+up$/i.test(text))    return { type: "pan", dx: 0, dy:  PAN_AMT };
  if (/^(pan|scroll|move)\s+down$/i.test(text))  return { type: "pan", dx: 0, dy: -PAN_AMT };
  if (/^(pan|scroll|move)\s+left$/i.test(text))  return { type: "pan", dx:  PAN_AMT, dy: 0 };
  if (/^(pan|scroll|move)\s+right$/i.test(text)) return { type: "pan", dx: -PAN_AMT, dy: 0 };

  // ── Misc canvas actions ──────────────────────────────────────────────────
  if (/^undo( that)?$/i.test(text)) return { type: "undo" };
  if (/^(clear|deselect|unselect)( selection| all)?$/i.test(text)) return { type: "clear_selection" };
  if (/^select all$/i.test(text)) return { type: "select_all" };
  if (/^(help|what can i say|show (gestures?|commands?|cheatsheet)|gesture help)$/i.test(text)) {
    return { type: "show_help" };
  }
  if (/^(ask (a )?(doubt|question)( here)?|i have (a )?(doubt|question))$/i.test(text)) {
    return { type: "open_doubt" };
  }

  return null;
}

/** Browser-wide event used to deliver canvas commands from anywhere
 *  (CanvasInputBar, VoiceIsland, future MCP hooks) to the canvas itself. */
export const CANVAS_COMMAND_EVENT = "synapse:canvas-command";

export function dispatchCanvasCommand(cmd: CanvasCommand): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CANVAS_COMMAND_EVENT, { detail: cmd }));
}
