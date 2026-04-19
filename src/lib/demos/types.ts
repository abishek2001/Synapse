import type { CanvasArtifact } from "@/lib/tools/types";

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
  /** Sequence of modules to play back in order. */
  modules: DemoModule[];
}
