"use client";

import { useCallback, useRef } from "react";
import { useSessionStore } from "@/store/session";
import { useCanvasStore, ELEM_WIDTHS, estimateElemH, type CanvasElement } from "@/store/canvas";
import { useGroundingStore } from "@/store/grounding";
import type { FocusCandidate, StreamEvent } from "@/lib/agents/types";
import type { CanvasArtifact } from "@/lib/tools/types";
import { usePlayback } from "@/hooks/usePlayback";
import { classifyError } from "@/lib/agents/error-classify";

// ── Focus / anchor candidate derivation ────────────────────────────────────

/**
 * Build the prioritized list of candidate "anchor" groups for this turn:
 * 1. Explicit focus (from DoubtPopup / SelectionBar / context menu)
 * 2. Selection-derived groups (uniqued)
 * 3. Current main module (the one we'll return to after a tangent)
 * Returns up to 3 unique candidates.
 */
function deriveFocusCandidates(focusGroupId?: string): FocusCandidate[] {
  const { groups, elements, selectedElementIds, currentMainGroupId } =
    useCanvasStore.getState();
  if (groups.length === 0) return [];
  const byId = new Map(groups.map((g) => [g.id, g] as const));

  const out: FocusCandidate[] = [];
  const seen = new Set<string>();
  const push = (id: string | null | undefined, tag: Partial<FocusCandidate>) => {
    if (!id || seen.has(id)) return;
    const g = byId.get(id);
    if (!g) return;
    out.push({ groupId: id, title: g.name, ...tag });
    seen.add(id);
  };

  push(focusGroupId, { isExplicitFocus: true });

  if (selectedElementIds.length > 0) {
    const groupIds = new Set<string>();
    for (const id of selectedElementIds) {
      const el = elements.find((e) => e.id === id);
      if (el?.groupId) groupIds.add(el.groupId);
    }
    for (const gid of groupIds) push(gid, { isFromSelection: true });
  }

  push(currentMainGroupId, { isCurrentMain: true });

  return out.slice(0, 3);
}

/** Compute world-space bounds of a group from its elements (no React deps). */
function boundsForGroup(
  groupId: string,
): { x: number; y: number; w: number; h: number } | null {
  const inGroup = useCanvasStore
    .getState()
    .elements.filter((e) => e.groupId === groupId);
  if (inGroup.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of inGroup) {
    const h = el.h ?? estimateElemH(el.type);
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.w);
    maxY = Math.max(maxY, el.y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── Canvas context serializer ──────────────────────────────────────────────

function serializeCanvasContext(elements: CanvasElement[]): string {
  const artifacts = elements.filter((e) => e.artifact);
  if (artifacts.length === 0) return "";
  return artifacts
    .map((e) => `- [${e.artifact!.type}] "${e.artifact!.title}"`)
    .join("\n");
}

// Friendly label for an artifact type — e.g. "render3d" → "3D scene".
// Used by activity-feed entries so the user sees natural names instead of
// raw schema identifiers leaking from the tool layer.
function formatArtifactType(t: string): string {
  switch (t) {
    case "render3d":   return "3D scene";
    case "simulation": return "simulation";
    case "graph":      return "graph";
    case "notation":   return "notation";
    case "flashcard":  return "flashcard";
    case "diagram":    return "diagram";
    case "lookup":     return "lookup";
    case "visual":     return "visual";
    case "hierarchy":  return "hierarchy";
    default:           return t;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAIChat() {
  const {
    persona,
    files,
    documentContext,
    messages,
    isStreaming,
    isSpeaking,
    isMuted,
    addMessage,
    setStreaming,
    setFollowUpQuestions,
    setSpeakReady,
    setChatError,
  } = useSessionStore();

  const {
    addModule,
    addElement,
    addPendingElement,
    resolvePendingElement,
    startPendingModule,
    addToPendingModule,
    setPendingModuleTitle,
    clearPendingModule,
    addUpdate,
    elements,
  } = useCanvasStore();
  const { sessionContext, studyPlan, applyPatch } = useGroundingStore();
  const { playMessage, toggleMessage, stop: stopPlayback, playingMessageId } = usePlayback();

  // pendingId → canvas element id for skeleton resolution
  const pendingMap = useRef<Map<string, string>>(new Map());
  /** Per-turn set of element IDs created during this stream. Used at `done` to
   *  reliably gather the turn's elements regardless of how long the turn took
   *  (the old `createdAt > now-30s` filter dropped everything when generation
   *  ran longer than 30 seconds, leaving orphan ungrouped elements behind). */
  const turnElementIdsRef = useRef<Set<string>>(new Set());
  // Accumulated per-turn state
  const moduleTitleRef = useRef<string>("");
  const writtenTextRef = useRef<string>("");
  const spokenTextRef  = useRef<string>("");
  const questionsRef   = useRef<string[]>([]);
  // Anchor info for the in-flight turn — set in sendMessage, read by the
  // artifact_pending handler (skeleton placement) and the done handler
  // (final addModule call).
  const turnAnchorRef = useRef<{
    candidates: FocusCandidate[];
    optimisticAnchorId: string | null;
    finalAnchorId: string | null;
    isTangent: boolean;
  }>({ candidates: [], optimisticAnchorId: null, finalAnchorId: null, isTangent: false });
  // Aborts the in-flight /api/chat fetch when the user clicks Stop.
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string, opts?: { focusGroupId?: string }) => {
      if (!text.trim() || isStreaming) return;

      if (isSpeaking) stopPlayback();

      setFollowUpQuestions([]);
      setSpeakReady(false);
      // Clear any prior recoverable error — if this turn succeeds the banner
      // simply disappears; if it fails again the catch / error event below
      // will repopulate it with the fresh details.
      setChatError(null);

      addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      });
      setStreaming(true);

      const canvasContext = serializeCanvasContext(elements);

      pendingMap.current.clear();
      turnElementIdsRef.current.clear();
      moduleTitleRef.current = "";
      writtenTextRef.current = "";
      spokenTextRef.current  = "";
      questionsRef.current   = [];
      startPendingModule();

      // Derive candidate anchors once per turn so skeletons can use them too.
      const candidates = deriveFocusCandidates(opts?.focusGroupId);
      // Optimistic anchor: prefer the explicit focus, else the first candidate.
      // The server's strategy decision can override on `done`.
      const optimisticAnchorId =
        opts?.focusGroupId ?? candidates[0]?.groupId ?? null;
      turnAnchorRef.current = {
        candidates,
        optimisticAnchorId,
        finalAnchorId: null,
        isTangent: false,
      };

      // The activity-feed entry replaces what used to be the canvas "thinking"
      // toast. The same id is reused as the per-turn correlator.
      const turnId = `turn-${Date.now()}`;
      addUpdate({
        id: `upd-thinking-${turnId}`,
        type: "thinking",
        title: "Thinking…",
        detail: text.trim().length > 80 ? `${text.trim().slice(0, 80)}…` : text.trim(),
        timestamp: Date.now(),
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = messages
          .filter((m) => m.role !== "system")
          .slice(-10)
          .map((m) => ({
            role: m.role === "tutor" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          }));

        const learningMode = useSessionStore.getState().learningMode;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            query: text.trim(),
            persona,
            history,
            documentContext:
              documentContext ||
              (files.length > 0 ? `Documents: ${files.map((f) => f.name).join(", ")}` : undefined),
            canvasContext: canvasContext || undefined,
            sessionContext,
            studyPlan,
            learningMode,
            focus: candidates.length > 0 ? { candidates } : undefined,
          }),
        });

        if (!res.ok || !res.body) {
          // Try to surface the upstream error message (route emits JSON for
          // pre-stream failures like missing API key) so the banner shows
          // something useful instead of "API error 500".
          let upstream = `API error ${res.status}`;
          try {
            const j = await res.clone().json();
            if (j && typeof j.error === "string") upstream = j.error;
          } catch { /* not JSON */ }
          const httpErr = new Error(upstream) as Error & { status?: number };
          httpErr.status = res.status;
          throw httpErr;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const data = chunk.startsWith("data: ") ? chunk.slice(6) : chunk;
            if (!data.trim()) continue;
            try { handleStreamEvent(JSON.parse(data) as StreamEvent, text.trim()); }
            catch { /* malformed SSE line */ }
          }
        }

        // flush tail
        if (buffer.trim()) {
          const data = buffer.startsWith("data: ") ? buffer.slice(6) : buffer;
          try { handleStreamEvent(JSON.parse(data) as StreamEvent, text.trim()); }
          catch { /* ignore */ }
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) {
          for (const [, elId] of pendingMap.current) {
            useCanvasStore.getState().removeElement(elId);
          }
          pendingMap.current.clear();
          addUpdate({
            id: `upd-stopped-${turnId}`,
            type: "error",
            title: "Stopped",
            detail: "Turn cancelled by user",
            timestamp: Date.now(),
          });
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: "Stopped.",
            timestamp: Date.now(),
          });
        } else {
          console.error("SSE chat error:", err);
          const classified = classifyError(err);
          const recoverable =
            classified.code === "rate_limit" || classified.code === "timeout";
          addUpdate({
            id: `upd-error-${turnId}`,
            type: "error",
            title:
              classified.code === "rate_limit" ? "Rate limit reached"
              : classified.code === "timeout"  ? "Model timed out"
              : "Stream error",
            detail: classified.message,
            timestamp: Date.now(),
          });
          if (recoverable) {
            // Surface as a side banner with Retry. Skip injecting the apology
            // tutor message into the transcript so the latest-tutor bubble
            // doesn't suddenly say "Something went wrong" for a transient blip.
            setChatError({
              code: classified.code,
              message: classified.message,
              retryPrompt: text.trim(),
              retryAfterMs: classified.retryAfterMs,
              timestamp: Date.now(),
            });
          } else {
            addMessage({
              id: crypto.randomUUID(),
              role: "tutor",
              content: "Something went wrong. Let me try again…",
              timestamp: Date.now(),
            });
          }
        }
        clearPendingModule();
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [
      isStreaming, isSpeaking, isMuted, messages, persona, files, documentContext,
      addMessage, setStreaming, setFollowUpQuestions, setSpeakReady, setChatError, stopPlayback,
      addModule, addElement, addPendingElement, resolvePendingElement,
      startPendingModule, clearPendingModule,
      addUpdate, elements, sessionContext, studyPlan, applyPatch,
    ],
  );

  // ── Event handler ─────────────────────────────────────────────────────────

  const handleStreamEvent = useCallback(
    (event: StreamEvent, userQuery: string) => {
      switch (event.type) {

        case "thinking":
          break;

        case "artifact_pending": {
          const w = ELEM_WIDTHS[event.artifactType] ?? 360;
          const allEls = useCanvasStore.getState().elements;
          const elId = `el-pending-${event.pendingId}`;
          pendingMap.current.set(event.pendingId, elId);
          turnElementIdsRef.current.add(elId);

          // Place the skeleton near the optimistic anchor so it doesn't visually
          // jump when the real module lands at done. Falls back to the right edge.
          const anchorId = turnAnchorRef.current.optimisticAnchorId;
          const anchorBounds = anchorId ? boundsForGroup(anchorId) : null;

          let x: number;
          let y: number;
          if (anchorBounds) {
            // Stack skeletons under the anchor; nudge each new one rightward
            // by its width so they tile instead of stacking on top of each other.
            const placedSkeletons = pendingMap.current.size - 1;
            x = anchorBounds.x + placedSkeletons * (w + 24);
            y = anchorBounds.y + anchorBounds.h + 140;
          } else {
            const rightEdge = allEls.reduce((max, e) => Math.max(max, e.x + e.w), 80);
            x = rightEdge + 80;
            y = 200;
          }

          addPendingElement({
            id: elId,
            type: event.artifactType as import("@/store/canvas").ElementType,
            x,
            y,
            w,
            zIndex: allEls.length + 10,
            createdAt: Date.now(),
          });
          addToPendingModule(elId);
          addUpdate({
            id: `upd-pending-${event.pendingId}`,
            type: "artifact_generating",
            title: `Generating ${formatArtifactType(event.artifactType)}`,
            detail: event.title || "preparing artifact…",
            timestamp: Date.now(),
          });
          break;
        }

        case "artifact_done": {
          const elId = pendingMap.current.get(event.pendingId);
          if (elId) {
            resolvePendingElement(elId, event.artifact as CanvasArtifact);
            pendingMap.current.delete(event.pendingId);
            import("@/lib/voice/sfx").then((m) => m.playSfx("artifact-added")).catch(() => {});
          }
          addUpdate({
            id: `upd-done-${event.pendingId}`,
            type: "artifact_added",
            title: `Drew ${formatArtifactType(event.artifact.type)}`,
            detail: event.artifact.title || "added to canvas",
            timestamp: Date.now(),
          });
          break;
        }

        case "artifact_error": {
          // Tool execution failed (timeout, model error, etc.). Drop the skeleton
          // silently — earlier we substituted a fake "lookup" artifact server-side
          // which leaked the raw tool name onto the canvas. The activity feed
          // surfaces the failure with the upstream reason for context.
          const elId = pendingMap.current.get(event.pendingId);
          if (elId) {
            useCanvasStore.getState().removeElement(elId);
            turnElementIdsRef.current.delete(elId);
            pendingMap.current.delete(event.pendingId);
          }
          addUpdate({
            id: `upd-err-${event.pendingId}`,
            type: "error",
            title: `Couldn't render ${formatArtifactType(event.artifactType)}`,
            detail: event.reason || "tool execution failed",
            timestamp: Date.now(),
          });
          break;
        }

        case "tutor_response": {
          // Store for TTS and module building
          moduleTitleRef.current = event.moduleTitle;
          writtenTextRef.current = event.writtenText;
          spokenTextRef.current  = event.spokenText;
          questionsRef.current   = event.questionsForUser;

          // Surface the title on the in-flight pending-module boundary so the
          // user sees what's being generated while artifacts continue to stream.
          if (event.moduleTitle) setPendingModuleTitle(event.moduleTitle);

          // Add to transcript. We persist `spokenText` directly on the message
          // so every speaker button (the bubble's, the input pill's, and the
          // per-row buttons in the transcript sidebar) can replay it later
          // without depending on a transient ref that gets overwritten on the
          // next turn.
          addMessage({
            id: crypto.randomUUID(),
            role: "tutor",
            content: event.writtenText,
            spokenText: event.spokenText || undefined,
            timestamp: Date.now(),
          });

          // Show AI's direct questions as tier-1 chips immediately
          if (event.questionsForUser.length > 0) {
            // Prepend to followUpQuestions so they appear first (tier-1 takes priority)
            const current = useSessionStore.getState().followUpQuestions;
            useSessionStore.getState().setFollowUpQuestions([
              ...event.questionsForUser,
              ...current,
            ]);
          }
          break;
        }

        case "follow_up": {
          // Strategy agent suggestions — tier 2, append after tutor questions
          const current = useSessionStore.getState().followUpQuestions;
          const all = [...current, ...event.questions];
          // Deduplicate
          const seen = new Set<string>();
          const deduped = all.filter((q) => { if (seen.has(q)) return false; seen.add(q); return true; });
          useSessionStore.getState().setFollowUpQuestions(deduped);
          break;
        }

        case "pause_for_input":
          break;

        case "done": {
          const patch = event.contextPatch;
          if (patch && sessionContext) applyPatch(patch);

          // Resolve final anchor: prefer server's strategy decision, fall back
          // to the optimistic anchor we set client-side at sendMessage time.
          const serverAnchor = event.anchorGroupId ?? null;
          const serverIsTangent = !!event.isTangent;
          const optimistic = turnAnchorRef.current.optimisticAnchorId;
          const finalAnchorId = serverAnchor ?? optimistic ?? null;
          const isTangent = serverAnchor != null ? serverIsTangent : false;
          turnAnchorRef.current.finalAnchorId = finalAnchorId;
          turnAnchorRef.current.isTangent = isTangent;

          // Clean up any unresolved pending elements (stream errored mid-generation
          // for that artifact). Their IDs are still in the turn set, so filter them
          // out below by checking `!pending`.
          for (const [, elId] of pendingMap.current) {
            useCanvasStore.getState().removeElement(elId);
            turnElementIdsRef.current.delete(elId);
          }
          pendingMap.current.clear();

          // Use the per-turn element-id set (NOT a 30-second time window) to find
          // the elements this turn produced. Time-window filtering caused modules
          // that took longer than 30s to lose all their artifacts and end up
          // ungrouped on the canvas.
          const turnIds = turnElementIdsRef.current;
          const freshEls = useCanvasStore.getState().elements.filter(
            (e) => turnIds.has(e.id) && !e.pending && e.artifact,
          );
          const resolvedArtifacts = freshEls.map((e) => e.artifact!);

          // Remove individually-placed pending-resolved elements (they'll be
          // re-created inside the new group with proper layout).
          for (const el of freshEls) {
            useCanvasStore.getState().removeElement(el.id);
          }

          // Build grouped module — prefer AI-generated title, fall back to user query
          const label = moduleTitleRef.current ||
            (userQuery.length > 50 ? userQuery.slice(0, 50) + "…" : userQuery);
          let newGroupId: string | null = null;
          if (resolvedArtifacts.length > 0 || writtenTextRef.current) {
            newGroupId = addModule(
              label,
              resolvedArtifacts,
              undefined,
              writtenTextRef.current || undefined,
              { anchorGroupId: finalAnchorId, isTangent },
            );
          }

          // Update main/tangent tracking so the back pill knows where "home" is.
          // addModule already stamps these, but we're explicit here for the case
          // where addModule was skipped (no artifacts + no writtenText).
          // Forward progression (isTangent === false) MUST also clear
          // `lastTangentGroupId` so the back pill disappears once the user has
          // moved past the tangent — see canvas-store comment for rationale.
          if (newGroupId) {
            const store = useCanvasStore.getState();
            if (isTangent) {
              store.setLastTangent(newGroupId);
            } else {
              store.setCurrentMain(newGroupId);
              store.setLastTangent(null);
            }
          }

          // Annotations (canvas_delegate_task)
          // (handled by addElement calls in the tool call results — no change needed)

          // Delayed speech
          if (spokenTextRef.current && !isMuted) {
            setSpeakReady(true);
          }

          turnElementIdsRef.current.clear();
          clearPendingModule();
          // `addModule` already pushes a `module_added` activity-feed entry, so
          // there's nothing extra to log here for the happy path.
          break;
        }

        case "error": {
          console.error("Stream error:", event.message);
          // Re-classify on the client so older payloads (without `code`) still
          // route to the right surface. Server-emitted `code` wins when set.
          const classified = event.code
            ? { code: event.code, message: event.message, retryAfterMs: event.retryAfterMs }
            : classifyError(new Error(event.message || "Unknown"));
          const recoverable =
            classified.code === "rate_limit" || classified.code === "timeout";
          addUpdate({
            id: `upd-stream-error-${Date.now()}`,
            type: "error",
            title:
              classified.code === "rate_limit" ? "Rate limit reached"
              : classified.code === "timeout"  ? "Model timed out"
              : "Stream error",
            detail: event.message || "Unknown",
            timestamp: Date.now(),
          });
          if (recoverable) {
            setChatError({
              code: classified.code,
              message: classified.message || event.message || "Request failed",
              retryPrompt: userQuery,
              retryAfterMs: classified.retryAfterMs,
              timestamp: Date.now(),
            });
          } else {
            addMessage({
              id: crypto.randomUUID(),
              role: "tutor",
              content: "Something went wrong. Let me try again…",
              timestamp: Date.now(),
            });
          }
          clearPendingModule();
          break;
        }
      }
    },
    [
      addMessage, addPendingElement, resolvePendingElement, addModule,
      addToPendingModule, setPendingModuleTitle, clearPendingModule,
      addUpdate, setFollowUpQuestions, setSpeakReady, setChatError,
      applyPatch, sessionContext, isMuted,
    ],
  );

  // Called when user clicks the speaker button on the latest tutor bubble or
  // input pill. Always replays the latest tutor message (looked up at call
  // time so it's in sync with whatever's currently on screen).
  const speakLatest = useCallback(() => {
    const latest = [...useSessionStore.getState().messages]
      .reverse()
      .find((m) => m.role === "tutor" && (m.spokenText || m.content));
    if (!latest) return;
    toggleMessage(latest);
  }, [toggleMessage]);

  // Cancel the in-flight chat request. Server-side OpenAI calls receive the
  // aborted signal and short-circuit; client-side we tear down skeletons +
  // toast in the catch block above.
  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (isSpeaking) {
      stopPlayback();
    }
  }, [isSpeaking, stopPlayback]);

  const latestTutor = [...messages].reverse().find((m) => m.role === "tutor");

  return {
    sendMessage,
    stop,
    speakLatest,
    playMessage,
    toggleMessage,
    playingMessageId,
    isStreaming,
    latestTutor,
  };
}
