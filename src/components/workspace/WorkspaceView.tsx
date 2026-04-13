"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import WorkspaceNavbar from "./WorkspaceNavbar";
import ArtifactCanvas from "./ArtifactCanvas";
import SourcesPanel from "./SourcesPanel";
import CallFriendModal from "./CallFriendModal";
import CanvasInputBar from "./CanvasInputBar";
import LeftSidebar from "./LeftSidebar";
import RightSidebar from "./RightSidebar";
import MockButton from "./MockButton";
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

export default function WorkspaceView() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "Untitled Session";
  const urlPersona = searchParams.get("persona") || "professor";
  const parsedRef = useRef(false);

  const {
    query,
    persona,
    files,
    documents,
    documentContext,
    canvasTitle,
    showSources,
    showCallFriend,
    setShowSources,
    setShowCallFriend,
    setDocuments,
    setCanvasTitle,
    initSession,
  } = useSessionStore();

  const { setStudyPlan, setSessionContext, setRetrievalIndexed } = useGroundingStore();
  const { darkMode, leftSidebarOpen, setLeftSidebarOpen, rightSidebarOpen, setRightSidebarOpen } = useUIStore();
  const { addUpdate } = useCanvasStore();

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
    if (!query) initSession(urlQuery, urlPersona, []);
  }, [query, urlQuery, urlPersona, initSession]);

  useEffect(() => {
    if (bridgeInitRef.current) return;
    bridgeInitRef.current = true;

    const displayQ = query || urlQuery;
    const displayP = persona || urlPersona;
    const hasFiles = files.length > 0;
    const initial = buildStages(hasFiles);
    setStages(initial);

    setContextCard({
      title: displayQ.length > 55 ? displayQ.slice(0, 55) + "..." : displayQ,
      description: hasFiles
        ? `Synapse is parsing ${files.length} source${files.length > 1 ? "s" : ""} and building a grounded workspace.`
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
      id: `upd-session-start`,
      type: "ai_note",
      title: `Started: ${displayQ.length > 40 ? displayQ.slice(0, 40) + "…" : displayQ}`,
      detail: `Persona: ${displayP}${hasFiles ? ` · ${files.length} file(s)` : ""}`,
      timestamp: Date.now(),
    });

    runBridgeSequence(initial, hasFiles, displayQ, displayP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBridgeSequence(
    initial: BridgeStage[],
    hasFiles: boolean,
    displayQ: string,
    displayP: string,
  ) {
    const stageIds = initial.map((s) => s.id);

    for (const id of stageIds) {
      updateStage(id, "active");

      if (id === "source" && hasFiles) {
        parsedRef.current = true;
        for (const f of files) {
          updateStage(id, "active", `Parsing ${f.name}...`);
          addLog(`Extracting text from ${f.name}`, "info");
        }
        const t0 = performance.now();
        try {
          const res = await fetch("/api/parse-doc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: files.map((f) => ({ name: f.name, type: f.type, dataUrl: f.dataUrl })) }),
          });
          const elapsed = Math.round(performance.now() - t0);
          setLatencyMs(elapsed);
          if (res.ok) {
            const data = await res.json();
            if (data.documents) {
              setDocuments(data.documents);
              const totalWords = data.documents.reduce((sum: number, d: { text: string }) => sum + d.text.split(/\s+/).length, 0);
              addLog(`Extracted ${totalWords.toLocaleString()} words in ${elapsed}ms`, "success");
              for (const doc of data.documents as { name: string; text: string }[]) {
                addLog(`${doc.name} → ${doc.text.split(/\s+/).length.toLocaleString()} words`, "data");
              }
              setContextCard((prev) => ({ ...prev, description: `Grounded in ${data.documents.length} source${data.documents.length > 1 ? "s" : ""} (${totalWords.toLocaleString()} words).`, status: "Grounded" }));

              const firstDocText = data.documents[0]?.text || "";
              const hasRealContent = firstDocText.length > 50 && !firstDocText.startsWith("[Failed");
              if (hasRealContent) try {
                addLog("Extracting topic title from content...", "info");
                const docPreview = firstDocText.slice(0, 1500);
                const titleRes = await fetch("/api/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ query: `Based on the following document content, extract a short, clear topic title (3-8 words max). Reply with ONLY the title, nothing else.\n\nContent preview: "${docPreview}"`, persona: "professor", history: [], mode: "tutor" }),
                });
                if (titleRes.ok) {
                  const titleData = await titleRes.json();
                  const extracted = (titleData.tutor?.explanation || titleData.rawResponse || "").trim().replace(/^["']|["']$/g, "");
                  if (extracted && extracted.length < 80) {
                    setCanvasTitle(extracted);
                    addLog(`Topic: "${extracted}"`, "success");
                  }
                }
              } catch { /* title extraction is best-effort */ }
            }
          }
        } catch { addLog("Document parsing failed", "info"); }
        updateStage(id, "done", `${files.length} source${files.length > 1 ? "s" : ""} indexed`);

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

        const tutorWarmup = fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: `Briefly summarize the key concepts in "${displayQ}" in one sentence. Reply in under 20 words.`, persona: displayP, history: [], mode: "tutor" }),
        });

        const [, , tutorRes] = await Promise.all([studyPlanPromise, embedPromise, tutorWarmup]);
        const elapsed = Math.round(performance.now() - t0);
        setLatencyMs(elapsed);

        try {
          if (tutorRes.ok) {
            const data = await tutorRes.json();
            const preview = data.tutor?.explanation || data.rawResponse || "";
            if (preview) addLog(`AI ready — "${preview.slice(0, 80)}${preview.length > 80 ? "..." : ""}"`, "success");
            else addLog(`AI connected in ${elapsed}ms`, "success");
            setContextCard((prev) => ({
              ...prev,
              tags: [{ label: displayP, color: "#7c3aed" }, { label: `${elapsed}ms`, color: "#06b6d4" }, { label: "Ready", color: "#10b981" }],
              status: "AI Ready",
            }));
          }
        } catch { addLog("AI warmup skipped", "info"); }
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

  const displayQuery = query || urlQuery;
  const displayTitle = canvasTitle || displayQuery;

  return (
    <>
      <AnimatePresence>
        {showBridge && (
          <BridgeScreen
            query={displayQuery}
            persona={persona || urlPersona}
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
              title={displayQuery}
              onCallFriend={() => setShowCallFriend(true)}
              hasFiles={files.length > 0}
              showSources={showSources}
              onToggleSources={() => setShowSources(!showSources)}
              onToggleSidebar={() => setLeftSidebarOpen(!leftSidebarOpen)}
              sidebarOpen={leftSidebarOpen}
            />

            {/* Main area: sidebar + canvas */}
            <div className="flex-1 flex min-h-0 relative">
              {/* Left sidebar — Table of Contents */}
              <LeftSidebar
                open={leftSidebarOpen}
                onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
              />

              {/* Canvas area */}
              <div className="flex-1 min-w-0 relative">
                <ArtifactCanvas topic={displayTitle} />

                {/* Sources panel (floating, top-right) */}
                {showSources && files.length > 0 && (
                  <div className="absolute top-3 right-3 z-30 pointer-events-auto">
                    <SourcesPanel files={files} onClose={() => setShowSources(false)} />
                  </div>
                )}

                {/* Mock button */}
                <MockButton />

                {/* Canvas input bar */}
                <CanvasInputBar />
              </div>

              {/* Right sidebar — Transcript & Updates */}
              <RightSidebar
                open={rightSidebarOpen}
                onToggle={() => setRightSidebarOpen(!rightSidebarOpen)}
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
