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
  sessionContext: SessionContext | null;
  studyPlan: StudyPlan | null;
  /** When "friend", bypass Strategy and go directly to the Friend agent (manual call-a-friend). */
  mode?: "tutor" | "friend";
}

export interface OrchestratorResult {
  type: "tutor" | "friend";
  explanation: string;
  artifacts: CanvasArtifact[];
  canvasAnnotations: DelegatedAnnotation[];
  decision: { action: string; reasoning: string } | null;
  contextPatch: SessionContextPatch;
  rawResponse: string;
  friend?: FriendResponse;
}

export type SessionContextPatch = Partial<SessionContext> & {
  conceptUpdates?: Record<string, ConceptState["level"]>;
};
