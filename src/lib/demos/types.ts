import type { CanvasArtifact } from "@/lib/tools/types";

/** Anchor a sticky / text annotation relative to the just-landed group bounds. */
export type AnnotationAnchor =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "left"
  | "right"
  | "above"
  | "below";

/** A "student-style" annotation dropped onto the canvas next to a module after
 *  it lands — sticky note or freestanding handwritten text. Positioned relative
 *  to the parent group's bounding box. */
export interface DemoAnnotation {
  kind: "sticky" | "text";
  content: string;
  /** Sticky background color. Ignored for text. */
  color?: string;
  /** Where to anchor relative to the group bounding box. Defaults to "right". */
  anchor?: AnnotationAnchor;
  /** Pixel offset from the anchor point. Positive x is right, positive y is down. */
  offsetX?: number;
  offsetY?: number;
  /** Override width (px). Defaults to ELEM_WIDTHS.sticky / .text. */
  width?: number;
}

/** A single tutor "turn" in a hardcoded demo — equivalent to one streamed
 *  module from `/api/chat`: a title, written + spoken text, and the
 *  artifacts that should resolve into the group. */
export interface DemoModule {
  /** Group heading (handwritten Caveat font on `GroupBoundary`). */
  title: string;
  /** Tutor message body — placed as the group's text element + transcript entry + bubble content. */
  writtenText: string;
  /** TTS-friendly version (no markdown / equations). Played when this module lands. */
  spokenText: string;
  /** Ready-to-resolve artifacts. Each MUST have a stable, unique `id`. */
  artifacts: CanvasArtifact[];
  /** What gets pre-typed in the input bar AFTER this module finishes. The user
   *  taps Send to fire the next module. The LAST module should leave this empty. */
  nextPrompt?: string;
  /** Sticky notes / handwritten text annotations dropped near the group after
   *  it lands. They render as standalone (un-grouped) elements so they feel
   *  like the user / TA scribbled them in the margins. */
  annotations?: DemoAnnotation[];
  /** Optional side-effects fired AFTER the group lands. Used to showcase
   *  product capabilities mid-demo (e.g. flip on hand tracking + open the
   *  gesture cheatsheet during the "voice & hands" module). */
  sideEffects?: DemoSideEffects;
}

/** Declarative side-effects executed by the playback engine once a module
 *  fully lands on the canvas. Kept declarative so module data remains
 *  serialisable. */
export interface DemoSideEffects {
  /** Toggle hand-tracking on (true) or off (false). */
  handTracking?: boolean;
  /** Pop open the gesture / voice cheatsheet. */
  showHelp?: boolean;
}

export interface DemoScript {
  id: string;
  /** Display title for the picker popover. */
  title: string;
  /** Short description (1 line) for the picker. */
  description: string;
  /** Tag chips shown on the picker card (e.g. ["3D", "Tree", "Graphs"]). */
  tags: string[];
  /** The user prompt that "kicked off" this session — added as a `user` message at the top. */
  userPrompt: string;
  /** Keywords that, when typed in the landing-page input, route here.
   *  Case-insensitive substring match. Always include the demo's primary noun. */
  keywords: string[];
  /** Sequence of modules to play back in order. */
  modules: DemoModule[];
}
