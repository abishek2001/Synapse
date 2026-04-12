import type { SessionContext, ConceptState } from "@/lib/grounding/session-context";
import type { TeachingDecision } from "./strategy";
import type { SessionContextPatch } from "./types";

const CONFUSION_PATTERNS = [
  /i don'?t (understand|get it)/i,
  /confused/i,
  /what does that mean/i,
  /huh\??/i,
  /can you explain (again|that)/i,
  /lost me/i,
  /makes no sense/i,
  /i'?m lost/i,
  /what\?+$/i,
  /too (fast|complicated|complex)/i,
  /wait,? what/i,
];

export interface ObserverInput {
  userMessage: string;
  tutorResponse: string;
  toolCallNames: string[];
  toolCallArgs: Record<string, unknown>[];
  decision: TeachingDecision | null;
  currentContext: SessionContext;
}

export function observeTurn(input: ObserverInput): SessionContextPatch {
  const {
    userMessage,
    toolCallNames,
    toolCallArgs,
    decision,
    currentContext,
  } = input;

  const patch: SessionContextPatch = {
    lastActivityAt: Date.now(),
    questionsAsked: currentContext.questionsAsked + 1,
  };

  // --- Confusion detection ---
  const isConfused = CONFUSION_PATTERNS.some((p) => p.test(userMessage));
  if (isConfused) {
    patch.confusionSignals = currentContext.confusionSignals + 1;
  }

  // --- Artifact counting ---
  const artifactToolNames = new Set([
    "canvas_generate_visual",
    "canvas_generate_graph",
    "canvas_generate_notation",
    "flashcard_create",
    "knowledge_lookup",
  ]);
  const newArtifacts = toolCallNames.filter((n) => artifactToolNames.has(n)).length;
  if (newArtifacts > 0) {
    patch.artifactsGenerated = currentContext.artifactsGenerated + newArtifacts;
  }

  // --- Concept tracking ---
  const conceptUpdates: Record<string, ConceptState["level"]> = {};

  // Extract concepts from tool call titles
  for (const args of toolCallArgs) {
    const title = args.title as string | undefined;
    if (title) {
      const existing = currentContext.conceptStates[title];
      conceptUpdates[title] = existing ? "practiced" : "introduced";
    }
  }

  // Add concepts from strategy decision
  if (decision?.conceptsToTrack) {
    for (const concept of decision.conceptsToTrack) {
      if (!conceptUpdates[concept]) {
        const existing = currentContext.conceptStates[concept];
        conceptUpdates[concept] = existing ? "practiced" : "introduced";
      }
    }
  }

  // Update confusion count on per-concept level
  if (isConfused && decision?.conceptsToTrack?.length) {
    // Attribute confusion to the first tracked concept
    const confusedConcept = decision.conceptsToTrack[0];
    const existing = currentContext.conceptStates[confusedConcept];
    if (existing) {
      // We signal confusion via the patch's conceptStates
      patch.conceptStates = {
        ...currentContext.conceptStates,
      };
      patch.conceptStates[confusedConcept] = {
        ...existing,
        confusionCount: existing.confusionCount + 1,
        lastMentioned: Date.now(),
      };
    }
  }

  if (Object.keys(conceptUpdates).length > 0) {
    patch.conceptUpdates = conceptUpdates;
  }

  // --- Module advancement ---
  if (decision?.shouldAdvanceModule) {
    patch.currentModuleIndex = Math.min(
      currentContext.currentModuleIndex + 1,
      currentContext.totalModules - 1,
    );
  }

  return patch;
}
