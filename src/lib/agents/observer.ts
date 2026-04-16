import type { SessionContext, ConceptState } from "@/lib/grounding/session-context";
import type { TeachingDecision } from "./strategy";
import type { SessionContextPatch } from "./types";

const CONFUSION_PATTERNS: RegExp[] = [
  /\bi\s*don'?t\s+(understand|get\s+it|follow)\b/i,
  /\bi'?m\s+confused\b/i,
  /\bconfus(ing|ed)\b/i,
  /\bwhat\s+does\s+(that|this)\s+mean\b/i,
  /\bcan\s+you\s+(explain|clarify)\s+(again|that|this)\b/i,
  /\blost\s+me\b/i,
  /\bi'?m\s+lost\b/i,
  /\bmakes?\s+no\s+sense\b/i,
  /\bhuh\??/i,
  /^\s*what\?+\s*$/i,
  /\btoo\s+(fast|complicated|complex|hard)\b/i,
  /\bwait,?\s+what\b/i,
];

function detectsConfusion(text: string): boolean {
  return CONFUSION_PATTERNS.some((re) => re.test(text));
}

function extractConceptsFromToolArgs(argList: Record<string, unknown>[]): string[] {
  const concepts = new Set<string>();
  for (const args of argList) {
    const title = typeof args.title === "string" ? args.title.trim() : "";
    if (title && title.length < 80) concepts.add(title);
    if (Array.isArray((args as { cards?: unknown }).cards)) {
      for (const c of (args as { cards: { front?: string }[] }).cards) {
        if (c?.front && c.front.length < 80) concepts.add(c.front);
      }
    }
  }
  return [...concepts];
}

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

  const artifactToolCount = toolCallNames.filter(
    (n) => n !== "knowledge_lookup" && n !== "canvas_delegate_task",
  ).length;
  if (artifactToolCount > 0) {
    patch.artifactsGenerated =
      currentContext.artifactsGenerated + artifactToolCount;
  }

  const confusionInMsg = detectsConfusion(userMessage);
  if (confusionInMsg) {
    patch.confusionSignals = currentContext.confusionSignals + 1;
  }

  const conceptNames = new Set<string>(extractConceptsFromToolArgs(toolCallArgs));
  for (const c of decision?.conceptsToTrack ?? []) {
    if (c && c.length < 80) conceptNames.add(c);
  }

  if (conceptNames.size > 0) {
    const conceptUpdates: Record<string, ConceptState["level"]> = {};
    for (const name of conceptNames) {
      const existing = currentContext.conceptStates[name];
      conceptUpdates[name] = existing ? "practiced" : "introduced";
    }
    patch.conceptUpdates = conceptUpdates;
  }

  if (decision?.shouldAdvanceModule && currentContext.totalModules > 0) {
    patch.currentModuleIndex = Math.min(
      currentContext.currentModuleIndex + 1,
      currentContext.totalModules - 1,
    );
  }

  return patch;
}
