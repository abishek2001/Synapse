"use client";

import { useSessionStore } from "@/store/session";
import { Settings2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import SimulationFrame from "./SimulationFrame";

interface SimParam {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export default function SimulationPanel() {
  const { query, documentContext } = useSessionStore();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, SimParam>>({});
  const [showParams, setShowParams] = useState(false);
  const [liveParams, setLiveParams] = useState<Record<string, number>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const generatedTopicRef = useRef<string | null>(null);

  const { files } = useSessionStore();

  const generateSimulation = useCallback(async (topic: string, docCtx?: string) => {
    if (!topic || topic === "Untitled Session") return;
    if (generatedTopicRef.current === topic) return;

    setLoading(true);
    setError(null);
    setCode(null);
    generatedTopicRef.current = topic;

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, context: docCtx || undefined }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate simulation");
      }

      const data = await res.json();

      if (data.issues?.length > 0) {
        console.warn("Simulation sanitization issues:", data.issues);
      }

      setCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate simulation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!query) return;
    if (files.length > 0 && !documentContext) return;
    generateSimulation(query, documentContext);
  }, [query, files.length, documentContext, generateSimulation]);

  const handleRegenerate = () => {
    generatedTopicRef.current = null;
    if (query) generateSimulation(query, documentContext);
  };

  const handleParamsReady = useCallback((p: Record<string, SimParam>) => {
    setParams(p);
    const initial: Record<string, number> = {};
    for (const [key, val] of Object.entries(p)) {
      initial[key] = val.value;
    }
    setLiveParams(initial);
    if (Object.keys(p).length > 0) setShowParams(true);
  }, []);

  const handleParamChange = (key: string, value: number) => {
    const updated = { ...liveParams, [key]: value };
    setLiveParams(updated);
    const iframe = document.querySelector<HTMLIFrameElement>("iframe[title='Synapse Simulation']");
    iframe?.contentWindow?.postMessage({ type: "params", params: updated }, "*");
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#f5f5f7] relative">
      <div className="flex-1 relative overflow-hidden min-h-0 rounded-xl m-1 bg-white border border-black/[0.06]">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white">
            <Loader2 className="w-5 h-5 text-black/30 animate-spin mb-3" />
            <span className="text-[13px] text-black/40">Generating 3D simulation...</span>
            <span className="text-[10px] text-black/20 mt-1">AI is writing Three.js code for &ldquo;{query}&rdquo;</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white">
            <AlertTriangle className="w-5 h-5 text-orange-500/70 mb-3" />
            <span className="text-[13px] text-black/40 mb-1">Simulation error</span>
            <span className="text-[10px] text-black/25 max-w-xs text-center">{error}</span>
            <button onClick={handleRegenerate} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/[0.04] text-black/50 text-[11px] rounded-full hover:bg-black/[0.08] transition-colors">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {code && !loading && (
          <SimulationFrame code={code} onParamsReady={handleParamsReady} />
        )}

        {!code && !loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl mb-3">🌌</span>
            <span className="text-[13px] text-black/25">Waiting for topic...</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-3 left-3 right-3 z-20">
        <AnimatePresence>
          {showParams && Object.keys(params).length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mb-2 bg-white/90 backdrop-blur-2xl border border-black/[0.06] rounded-xl p-3 shadow-lg"
            >
              <div className="space-y-3">
                {Object.entries(params).map(([key, param]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-black/45">{param.label}</span>
                      <span className="text-[10px] font-mono text-black/30">
                        {liveParams[key]?.toFixed(param.step && param.step < 1 ? 2 : 0) ?? param.value}
                        {param.unit ? ` ${param.unit}` : ""}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step ?? 1}
                      value={liveParams[key] ?? param.value}
                      onChange={(e) => handleParamChange(key, Number(e.target.value))}
                      className="w-full h-1 bg-black/[0.06] rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between bg-white/80 backdrop-blur-2xl border border-black/[0.06] rounded-full px-3 py-1.5 shadow-sm">
          <span className="text-[9px] font-mono text-black/25 uppercase tracking-wider">
            {code ? "AI-Generated 3D" : "Waiting"}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={handleRegenerate} disabled={loading} className="p-1.5 rounded-full hover:bg-black/[0.04] transition-colors text-black/30 hover:text-black/60 disabled:opacity-20" title="Regenerate">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>
            {Object.keys(params).length > 0 && (
              <button
                onClick={() => setShowParams(!showParams)}
                className={`p-1.5 rounded-full transition-colors ${showParams ? "bg-black/[0.06] text-black/60" : "text-black/30 hover:text-black/60 hover:bg-black/[0.04]"}`}
              >
                <Settings2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
