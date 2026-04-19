"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import WorkspaceNavbar from "./WorkspaceNavbar";
import ArtifactCanvas, { type ArtifactCanvasHandle } from "./ArtifactCanvas";
import SourcesPanel from "./SourcesPanel";
import CallFriendModal from "./CallFriendModal";
import CanvasInputBar from "./CanvasInputBar";
import ChatErrorBanner from "./ChatErrorBanner";
import LeftSidebar from "./LeftSidebar";
import RightSidebar from "./RightSidebar";
import MockButton from "./MockButton";
import ModuleTimeline from "./ModuleTimeline";
import QuizMeMode from "./QuizMeMode";
import BridgeScreen, {
  buildStages,
  type BridgeStage,
  type BridgeLog,
} from "./BridgeScreen";
import { useSessionStore } from "@/store/session";
import { useGroundingStore } from "@/store/grounding";
import { useUIStore } from "@/store/ui";
import { useCanvasStore } from "@/store/canvas";
import { createSessionContext } from "@/lib/grounding/session-context";
import { preloadKokoro } from "@/lib/voice/kokoro";
import { useViewport } from "@/hooks/useViewport";

export default function WorkspaceView() {
  const router = useRouter();
  const parsedRef = useRef(false);

  const {
    query,
    persona,
    sessionId,
    files,
    urls,
    documents,
    documentContext,
    canvasTitle,
    showSources,
    showCallFriend,
    setShowSources,
    setShowCallFriend,
    setDocuments,
    setDocHeadings,
    setCanvasTitle,
  } = useSessionStore();

  const { setStudyPlan, setSessionContext, setRetrievalIndexed } = useGroundingStore();
  const studyPlanTopic = useGroundingStore((s) => s.studyPlan?.topic ?? null);
  const { darkMode, leftSidebarOpen, setLeftSidebarOpen, rightSidebarOpen, setRightSidebarOpen } = useUIStore();
  const { addUpdate } = useCanvasStore();
  const { isCompact } = useViewport();
  const compactInitRef = useRef(false);

  // First time we detect a compact viewport, force-collapse both sidebars so
  // the canvas isn't squeezed. We only do this once per mount so the user can
  // re-open them manually after.
  useEffect(() => {
    if (isCompact && !compactInitRef.current) {
      compactInitRef.current = true;
      if (leftSidebarOpen)  setLeftSidebarOpen(false);
      if (rightSidebarOpen) setRightSidebarOpen(false);
    }
  }, [isCompact, leftSidebarOpen, rightSidebarOpen, setLeftSidebarOpen, setRightSidebarOpen]);

  /* ── Canvas intro text (written on board after bridge) ── */
  const [introText] = useState("");

  /* ── Bridge state ── */
  const [showBridge, setShowBridge] = useState(true);
  const [stages, setStages] = useState<BridgeStage[]>([]);
  const [logs, setLogs] = useState<BridgeLog[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [contextCard, setContextCard] = useState({
    title: "",
    description: "Initializing Synapse environment...",
    tags: [] as { label: string; color: string }[],
    status: "Starting",
  });
  const bridgeInitRef = useRef(false);
  const logCounter = useRef(0);
  const artifactCanvasRef = useRef<ArtifactCanvasHandle>(null);

  const addLog = useCallback(
    (text: string, type: BridgeLog["type"] = "info") => {
      logCounter.current += 1;
      const uid = `${Date.now()}-${logCounter.current}-${Math.random().toString(36).slice(2, 6)}`;
      setLogs((prev) => [...prev, { id: uid, text, type, timestamp: Date.now() }]);
    },
    [],
  );

  const updateStage = useCallback(
    (id: string, status: BridgeStage["status"], detail?: string) => {
      setStages((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s)),
      );
    },
    [],
  );

  useEffect(() => {
    // No active session — send user back to landing page
    if (!sessionId || !query) router.replace("/");
  }, [sessionId, query, router]);

  // Start downloading the Kokoro TTS model in the background so it's
  // ready by the time the user clicks Speak for the first time.
  useEffect(() => { preloadKokoro(); }, []);

  // Periodically snapshot the active session into the archive so the
  // /library page reflects the latest progress (every 30s, also on unload).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const { touchActiveSession } = await import("@/lib/session-archive");
        touchActiveSession();
      } catch {}
    };
    const interval = setInterval(tick, 30_000);
    const beforeUnload = () => { void tick(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  useEffect(() => {
    if (bridgeInitRef.current) return;
    bridgeInitRef.current = true;

    const displayQ = query;
    const displayP = persona;
    const hasFiles = files.length > 0;
    const hasUrls  = urls.length > 0;
    const hasSources = hasFiles || hasUrls;
    const initial = buildStages(hasSources);
    setStages(initial);

    setContextCard({
      title: displayQ.length > 55 ? displayQ.slice(0, 55) + "..." : displayQ,
      description: hasSources
        ? `Synapse is parsing ${files.length + urls.length} source${files.length + urls.length > 1 ? "s" : ""} and building a grounded workspace.`
        : `Synapse is analyzing "${displayQ}" and constructing a personalized learning environment.`,
      tags: [
        { label: displayP, color: "#7c3aed" },
        { label: "3D Engine", color: "#06b6d4" },
        { label: "Canvas", color: "#10b981" },
      ],
      status: "Preparing",
    });

    addLog(`Session initialized — ${displayP} mode`, "info");
    if (hasFiles) addLog(`${files.length} file${files.length > 1 ? "s" : ""} queued for parsing`, "info");

    // Seed activity feed with the initial topic
    addUpdate({
      id: `upd-session-start-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "ai_note",
      title: `Started: ${displayQ.length > 40 ? displayQ.slice(0, 40) + "…" : displayQ}`,
      detail: `Persona: ${displayP}${hasSources ? ` · ${files.length + urls.length} source(s)` : ""}`,
      timestamp: Date.now(),
    });

    runBridgeSequence(initial, hasSources, displayQ, displayP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBridgeSequence(
    initial: BridgeStage[],
    hasSources: boolean,
    displayQ: string,
    displayP: string,
  ) {
    const stageIds = initial.map((s) => s.id);

    for (const id of stageIds) {
      updateStage(id, "active");

      if (id === "source" && hasSources) {
        parsedRef.current = true;
        const currentUrls = useSessionStore.getState().urls;
        const currentFiles = useSessionStore.getState().files;

        const collectedDocs: { name: string; text: string }[] = [];

        // ── Parse uploaded files ────────────────────────────────────────────
        if (currentFiles.length > 0) {
          for (const f of currentFiles) {
            updateStage(id, "active", `Parsing ${f.name}...`);
            addLog(`Extracting text from ${f.name}`, "info");
          }
          try {
            const res = await fetch("/api/parse-doc", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ files: currentFiles.map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl })) }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.documents) collectedDocs.push(...(data.documents as { name: string; text: string }[]));
            }
          } catch { addLog("Document parsing failed", "info"); }
        }

        // ── Fetch URLs via Jina Reader ──────────────────────────────────────
        for (const url of currentUrls) {
          updateStage(id, "active", `Fetching ${url.slice(0, 40)}…`);
          addLog(`Fetching ${url}`, "info");
          try {
            const res = await fetch("/api/fetch-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
            if (res.ok) {
              const doc = await res.json() as { name: string; text: string };
              if (doc.text?.length > 50) {
                collectedDocs.push(doc);
                addLog(`${doc.name} → ${doc.text.split(/\s+/).length.toLocaleString()} words`, "data");
              }
            } else {
              addLog(`URL fetch failed: ${url}`, "info");
            }
          } catch { addLog(`URL unreachable: ${url}`, "info"); }
        }

        // ── Commit all documents + title extraction ─────────────────────────
        if (collectedDocs.length > 0) {
          const t0 = performance.now();
          setDocuments(collectedDocs);

          // Extract H1/H2 headings from parsed markdown for LeftSidebar TOC
          const headings: string[] = [];
          for (const doc of collectedDocs) {
            for (const line of doc.text.split("\n")) {
              const m = line.match(/^#{1,2}\s+(.+)/);
              if (m) headings.push(m[1].trim());
            }
          }
          if (headings.length > 0) setDocHeadings(headings);
          const elapsed = Math.round(performance.now() - t0);
          setLatencyMs(elapsed);
          const totalWords = collectedDocs.reduce((sum, d) => sum + d.text.split(/\s+/).length, 0);
          addLog(`${collectedDocs.length} source(s) ready — ${totalWords.toLocaleString()} words`, "success");
          setContextCard((prev) => ({
            ...prev,
            description: `Grounded in ${collectedDocs.length} source${collectedDocs.length > 1 ? "s" : ""} (${totalWords.toLocaleString()} words).`,
            status: "Grounded",
          }));

          const firstDocText = collectedDocs[0]?.text || "";
          if (firstDocText.length > 50 && !firstDocText.startsWith("[Failed")) {
            try {
              addLog("Extracting topic title…", "info");
              const titleRes = await fetch("/api/extract-title", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: firstDocText }),
              });
              if (titleRes.ok) {
                const { title: extracted } = await titleRes.json() as { title: string };
                if (extracted && extracted.length < 80) {
                  setCanvasTitle(extracted);
                  addLog(`Topic: "${extracted}"`, "success");
                }
              }
            } catch { /* best-effort */ }
          }
        }

        updateStage(id, "done", `${collectedDocs.length} source${collectedDocs.length !== 1 ? "s" : ""} indexed`);

      } else if (id === "tutor") {
        updateStage(id, "active", `Warming up ${displayP}...`);
        addLog(`Initializing ${displayP} persona`, "info");
        const t0 = performance.now();
        const docCtx = useSessionStore.getState().documentContext;

        const studyPlanPromise = fetch("/api/study-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: displayQ, documentContext: docCtx || undefined }),
        }).then(async (r) => {
          if (r.ok) {
            const d = await r.json();
            if (d.plan) {
              setStudyPlan(d.plan);
              setSessionContext(createSessionContext(d.plan.totalModules));
              addLog(`Study plan: ${d.plan.totalModules} modules, ~${d.plan.estimatedMinutes} min`, "success");
              // Use the study plan's topic as the canvas title unless one was
              // already extracted from uploaded documents.
              if (d.plan.topic && !useSessionStore.getState().canvasTitle) {
                setCanvasTitle(d.plan.topic);
              }
            }
          }
        }).catch(() => {
          setSessionContext(createSessionContext(1));
          addLog("Study plan generation skipped", "info");
        });

        const embedPromise = docCtx
          ? fetch("/api/embed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentContext: docCtx }),
            }).then(async (r) => {
              if (r.ok) {
                const d = await r.json();
                setRetrievalIndexed(true, d.chunks);
                addLog(`Retrieval index: ${d.chunks} chunks embedded`, "success");
              }
            }).catch(() => addLog("Embedding index skipped (keyword fallback active)", "info"))
          : Promise.resolve();

        const t1 = performance.now();
        await Promise.all([studyPlanPromise, embedPromise]);
        const elapsed = Math.round(performance.now() - t1);
        setLatencyMs(elapsed);

        addLog(`AI connected in ${elapsed}ms`, "success");
        setContextCard((prev) => ({
          ...prev,
          tags: [{ label: displayP, color: "#7c3aed" }, { label: `${elapsed}ms`, color: "#06b6d4" }, { label: "Ready", color: "#10b981" }],
          status: "AI Ready",
        }));
        updateStage(id, "done", `${displayP} online`);

      } else if (id === "canvas") {
        updateStage(id, "active", "Preparing workspace...");
        addLog("Initializing artifact workspace", "info");
        await sleep(400);
        addLog("Artifact grid ready", "success");
        updateStage(id, "done", "Workspace ready");
        setContextCard((prev) => ({ ...prev, status: "Workspace Ready" }));

      } else if (id === "simulation") {
        updateStage(id, "active", "Warming up 3D engine...");
        addLog("3D simulation engine standing by", "info");
        await sleep(600);
        addLog("Engine ready — simulations will generate on demand", "success");
        updateStage(id, "done", "3D engine ready");
        setContextCard((prev) => ({ ...prev, status: "Fully Loaded" }));
      }
    }

    addLog("All systems nominal — launching workspace", "success");
    await sleep(800);

    // Don't auto-fire — let CanvasInputBar show the mode picker first.
    // The picker will queue the topic / module plan based on the user's choice.
    setShowBridge(false);
  }

  useEffect(() => {
    if (!showBridge && !parsedRef.current && files.length > 0 && documents.length === 0) {
      parsedRef.current = true;
      (async () => {
        try {
          const res = await fetch("/api/parse-doc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: files.map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl })) }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.documents) setDocuments(data.documents);
          }
        } catch (err) {
          console.error("Failed to parse documents:", err);
        }
      })();
    }
  }, [showBridge, files, documents, setDocuments]);

  const displayQuery = query;
  const displayTitle = canvasTitle || studyPlanTopic || displayQuery;

  return (
    <>
      <AnimatePresence>
        {showBridge && (
          <BridgeScreen
            query={displayQuery}
            persona={persona}
            stages={stages}
            logs={logs}
            contextCard={contextCard}
            latencyMs={latencyMs}
            fileNames={files.map((f) => f.name)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!showBridge && (
          <motion.div
            key="workspace"
            initial={{ opacity: 0, scale: 1.015 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="h-screen w-screen flex flex-col overflow-hidden"
            style={{ backgroundColor: darkMode ? "#06060f" : "#f4f4f6" }}
          >
            {/* Navbar */}
            <WorkspaceNavbar
              title={displayTitle}
              onCallFriend={() => setShowCallFriend(true)}
              hasFiles={files.length > 0}
              showSources={showSources}
              onToggleSources={() => setShowSources(!showSources)}
              onToggleSidebar={() => setLeftSidebarOpen(!leftSidebarOpen)}
              sidebarOpen={leftSidebarOpen}
            />

            {/* Main area: sidebar + canvas. On compact viewports both sidebars
                render as floating overlay drawers (positioned absolutely
                inside this container) instead of pushing the canvas. */}
            <div className="flex-1 flex min-h-0 relative">
              {/* Left sidebar — Table of Contents */}
              <LeftSidebar
                open={leftSidebarOpen}
                onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
                onZoomToGroup={(groupId) => artifactCanvasRef.current?.zoomToGroup(groupId)}
                overlay={isCompact}
              />

              {/* Canvas area */}
              <div className="flex-1 min-w-0 relative">
                <ArtifactCanvas ref={artifactCanvasRef} topic={displayTitle} intro={introText} />

                {/* Module timeline (floating, top-center) */}
                <ModuleTimeline />

                {/* Sources panel (floating, top-right) */}
                {showSources && files.length > 0 && (
                  <div className="absolute top-3 right-3 z-30 pointer-events-auto max-w-[92vw]">
                    <SourcesPanel files={files} onClose={() => setShowSources(false)} />
                  </div>
                )}

                {/* Mock button */}
                <MockButton />

                {/* Quiz Me — only renders if there are flashcards on the canvas */}
                <QuizMeMode />

                {/* Canvas input bar */}
                <CanvasInputBar />

                {/* Recoverable chat-error banner (rate limit / model timeout)
                    — sits above the canvas tools, replaces the old "something
                    went wrong" tutor message for these specific failures. */}
                <ChatErrorBanner />
              </div>

              {/* Right sidebar — Transcript & Updates */}
              <RightSidebar
                open={rightSidebarOpen}
                onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
                overlay={isCompact}
              />
            </div>

            {showCallFriend && (
              <CallFriendModal onClose={() => setShowCallFriend(false)} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
