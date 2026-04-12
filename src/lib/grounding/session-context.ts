export interface ConceptState {
  name: string;
  level: "not_started" | "introduced" | "practiced" | "mastered";
  confusionCount: number;
  lastMentioned: number;
}

export interface SessionContext {
  currentModuleIndex: number;
  totalModules: number;
  conceptStates: Record<string, ConceptState>;
  confusionSignals: number;
  questionsAsked: number;
  artifactsGenerated: number;
  sessionStartedAt: number;
  lastActivityAt: number;
  summaries: string[];
}

export function createSessionContext(totalModules: number): SessionContext {
  return {
    currentModuleIndex: 0,
    totalModules,
    conceptStates: {},
    confusionSignals: 0,
    questionsAsked: 0,
    artifactsGenerated: 0,
    sessionStartedAt: Date.now(),
    lastActivityAt: Date.now(),
    summaries: [],
  };
}

export function trackConcept(
  ctx: SessionContext,
  conceptName: string,
  level: ConceptState["level"],
): SessionContext {
  const existing = ctx.conceptStates[conceptName];
  return {
    ...ctx,
    lastActivityAt: Date.now(),
    conceptStates: {
      ...ctx.conceptStates,
      [conceptName]: {
        name: conceptName,
        level,
        confusionCount: existing?.confusionCount ?? 0,
        lastMentioned: Date.now(),
      },
    },
  };
}

export function trackConfusion(
  ctx: SessionContext,
  conceptName?: string,
): SessionContext {
  const updated = {
    ...ctx,
    confusionSignals: ctx.confusionSignals + 1,
    lastActivityAt: Date.now(),
  };

  if (conceptName && updated.conceptStates[conceptName]) {
    updated.conceptStates = {
      ...updated.conceptStates,
      [conceptName]: {
        ...updated.conceptStates[conceptName],
        confusionCount: updated.conceptStates[conceptName].confusionCount + 1,
      },
    };
  }

  return updated;
}

export function trackQuestion(ctx: SessionContext): SessionContext {
  return {
    ...ctx,
    questionsAsked: ctx.questionsAsked + 1,
    lastActivityAt: Date.now(),
  };
}

export function trackArtifact(ctx: SessionContext): SessionContext {
  return {
    ...ctx,
    artifactsGenerated: ctx.artifactsGenerated + 1,
    lastActivityAt: Date.now(),
  };
}

export function addSummary(ctx: SessionContext, summary: string): SessionContext {
  return {
    ...ctx,
    summaries: [...ctx.summaries, summary],
    lastActivityAt: Date.now(),
  };
}

export function advanceModule(ctx: SessionContext): SessionContext {
  return {
    ...ctx,
    currentModuleIndex: Math.min(ctx.currentModuleIndex + 1, ctx.totalModules - 1),
    lastActivityAt: Date.now(),
  };
}

export function getSessionStats(ctx: SessionContext) {
  const concepts = Object.values(ctx.conceptStates);
  const mastered = concepts.filter((c) => c.level === "mastered").length;
  const confused = concepts.filter((c) => c.confusionCount > 1);
  const elapsedMinutes = Math.round((Date.now() - ctx.sessionStartedAt) / 60000);

  return {
    totalConcepts: concepts.length,
    mastered,
    needsWork: confused.map((c) => c.name),
    elapsedMinutes,
    questionsAsked: ctx.questionsAsked,
    artifactsGenerated: ctx.artifactsGenerated,
    completionPct: ctx.totalModules > 0
      ? Math.round(((ctx.currentModuleIndex + 1) / ctx.totalModules) * 100)
      : 0,
  };
}

export function serializeForPrompt(ctx: SessionContext): string {
  const stats = getSessionStats(ctx);
  const concepts = Object.values(ctx.conceptStates);

  let prompt = `SESSION CONTEXT:
- Module ${ctx.currentModuleIndex + 1} of ${ctx.totalModules} (${stats.completionPct}% progress)
- ${stats.elapsedMinutes} minutes elapsed
- ${stats.questionsAsked} questions asked, ${stats.artifactsGenerated} artifacts generated
- Confusion signals: ${ctx.confusionSignals}`;

  if (concepts.length > 0) {
    const masteredList = concepts.filter((c) => c.level === "mastered").map((c) => c.name);
    const introducedList = concepts.filter((c) => c.level === "introduced").map((c) => c.name);
    const confusedList = concepts.filter((c) => c.confusionCount > 1).map((c) => c.name);

    if (masteredList.length) prompt += `\n- Mastered: ${masteredList.join(", ")}`;
    if (introducedList.length) prompt += `\n- Introduced: ${introducedList.join(", ")}`;
    if (confusedList.length) prompt += `\n- Needs more help with: ${confusedList.join(", ")}`;
  }

  if (ctx.summaries.length > 0) {
    prompt += `\n\nSESSION SUMMARIES:\n${ctx.summaries.slice(-3).map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  }

  return prompt;
}
