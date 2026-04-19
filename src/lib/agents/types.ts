import type { CanvasArtifact } from "@/lib/tools/types";
import type { DelegatedAnnotation } from "@/lib/tools/handlers";
import type { SessionContext, ConceptState } from "@/lib/grounding/session-context";
import type { StudyPlan } from "@/lib/grounding/study-plan";

export interface AgentMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface FriendResponse {
  analogy: string;
  followUp: string;
}

export interface OrchestratorInput {
  query: string;
  persona: string;
  history: AgentMessage[];
  documentContext?: string;
  canvasContext?: string;
  sessionContext: SessionContext | null;
  studyPlan: StudyPlan | null;
  mode?: "tutor" | "friend";
}

export type SessionContextPatch = Partial<SessionContext> & {
  conceptUpdates?: Record<string, ConceptState["level"]>;
};

export interface OrchestratorResult {
  type: "tutor" | "friend";
  tutor?: {
    writtenText: string;  // transcript + canvas text element
    spokenText: string;   // TTS only
    questionsForUser: string[]; // questions AI is asking the student
  };
  friend?: FriendResponse;
  artifacts: CanvasArtifact[];
  canvasAnnotations: DelegatedAnnotation[];
  decision: {
    action: string;
    reasoning: string;
    suggestedPrompt?: string;
  } | null;
  contextPatch: SessionContextPatch;
  rawResponse: string;
  followUpQuestions?: string[];  // Strategy agent topic suggestions (chips tier 2)
  pauseForInput?: boolean;
}

// ── SSE stream events emitted by the orchestrator ──────────────────────────

export type StreamEvent =
  | { type: "thinking"; message: string }
  | { type: "artifact_pending"; pendingId: string; artifactType: string; title: string }
  | { type: "artifact_done"; pendingId: string; artifact: CanvasArtifact }
  | {
      type: "tutor_response";
      moduleTitle: string;    // 3-6 word topic label for the group heading
      writtenText: string;    // for canvas text element + transcript
      spokenText: string;     // for TTS only
      questionsForUser: string[]; // chips tier 1 — AI asking student
    }
  | { type: "follow_up"; questions: string[] }  // chips tier 2 — strategy suggestions
  | { type: "pause_for_input" }
  | { type: "done"; contextPatch: SessionContextPatch }
  | { type: "error"; message: string };
