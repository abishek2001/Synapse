"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Cpu,
  Box,
  Sparkles,
  MessageSquare,
  Check,
  Loader2,
  FileText,
} from "lucide-react";

export type StageStatus = "waiting" | "active" | "done";

export interface BridgeStage {
  id: string;
  label: string;
  detail: string;
  status: StageStatus;
  icon: React.ReactNode;
}

export interface BridgeLog {
  id: string;
  text: string;
  type: "info" | "success" | "data";
  timestamp: number;
}

interface BridgeScreenProps {
  persona: string;
  stages: BridgeStage[];
  logs: BridgeLog[];
  contextCard: {
    title: string;
    description: string;
    tags: { label: string; color: string }[];
    status: string;
  };
  latencyMs: number | null;
  fileNames: string[];
}

const ACCENT = "#7c3aed";

function deterministicUnit(seed: number) {
  const raw = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

const LATENCY_BAR_CONFIG = Array.from({ length: 14 }, (_, index) => ({
  height: 6 + deterministicUnit(index + 1) * 34,
  bright: deterministicUnit(index + 101) > 0.6,
  duration: 0.8 + deterministicUnit(index + 201) * 0.6,
  delay: index * 0.06,
}));

const PARTICLE_CONFIG = Array.from({ length: 20 }, (_, index) => ({
  left: `${10 + deterministicUnit(index + 301) * 80}%`,
  top: `${10 + deterministicUnit(index + 401) * 80}%`,
  duration: 3 + deterministicUnit(index + 501) * 4,
  delay: deterministicUnit(index + 601) * 3,
}));

function LatencyBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-10">
      {LATENCY_BAR_CONFIG.map((bar, i) => {
        return (
          <motion.div
            key={i}
            className="w-[6px] rounded-sm"
            style={{
              backgroundColor: bar.bright
                ? "rgba(124,58,237,0.7)"
                : "rgba(124,58,237,0.2)",
            }}
            animate={
              active
                ? { height: [bar.height * 0.3, bar.height, bar.height * 0.5] }
                : { height: bar.height * 0.15 }
            }
            transition={{
              duration: bar.duration,
              repeat: active ? Infinity : 0,
              repeatType: "reverse",
              delay: bar.delay,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === "done")
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center"
      >
        <Check className="w-3 h-3 text-emerald-400" />
      </motion.div>
    );
  if (status === "active")
    return (
      <div className="w-5 h-5 flex items-center justify-center">
        <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
      </div>
    );
  return (
    <div className="w-5 h-5 rounded-full border border-white/[0.08] flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
    </div>
  );
}

function ProgressBar({ stages }: { stages: BridgeStage[] }) {
  const done = stages.filter((s) => s.status === "done").length;
  const active = stages.find((s) => s.status === "active") ? 0.5 : 0;
  const pct = ((done + active) / stages.length) * 100;

  return (
    <div className="w-full h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${ACCENT}, #a78bfa)` }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

export default function BridgeScreen({
  persona,
  stages,
  logs,
  contextCard,
  latencyMs,
  fileNames,
}: BridgeScreenProps) {
  const doneCount = stages.filter((s) => s.status === "done").length;
  const seq = String(doneCount + 1).padStart(2, "0");
  const isActive = stages.some((s) => s.status === "active");
  const visibleLogs = logs.slice(-5);

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-[#06060f] flex items-center justify-center overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06060f]/50 to-[#06060f]" />

      {PARTICLE_CONFIG.map((particle, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-purple-400/20"
          style={{
            left: particle.left,
            top: particle.top,
          }}
          animate={{ y: [-20, 20, -20], opacity: [0.1, 0.5, 0.1] }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      <div className="relative z-10 flex gap-16 items-start max-w-4xl w-full px-8">
        {/* Left: Title + Stages + Live Log */}
        <div className="flex-1 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/20">
                System Sequence
              </span>
              <span className="text-[10px] font-mono text-purple-400/60">
                {"// "}
                {seq}
              </span>
            </div>

            <h1 className="text-[42px] font-bold leading-[1.05] tracking-tight mb-6">
              <span className="text-white/90">Synthesizing</span>
              <br />
              <span className="text-white/90">Neural</span>
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${ACCENT}, #a78bfa, #38bdf8)`,
                }}
              >
                Workspace...
              </span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-6"
          >
            <ProgressBar stages={stages} />
          </motion.div>

          {/* Stages */}
          <div className="space-y-1 mb-5">
            {stages.map((stage, i) => (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all ${
                  stage.status === "active" ? "bg-white/[0.03]" : ""
                }`}
              >
                <div className="flex-shrink-0 text-white/20">{stage.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[13px] font-medium ${
                        stage.status === "done"
                          ? "text-white/60"
                          : stage.status === "active"
                            ? "text-white/90"
                            : "text-white/25"
                      }`}
                    >
                      {stage.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${
                        stage.status === "done"
                          ? "text-emerald-400/70"
                          : stage.status === "active"
                            ? "text-purple-400/70"
                            : "text-white/15"
                      }`}
                    >
                      {stage.status === "done"
                        ? stage.detail
                        : stage.status === "active"
                          ? stage.detail
                          : "Queued"}
                    </span>
                  </div>
                </div>
                <StatusIcon status={stage.status} />
              </motion.div>
            ))}
          </div>

          {/* Live log feed */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-1 pl-3 border-l border-white/[0.04]"
          >
            <AnimatePresence mode="popLayout">
              {visibleLogs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, y: 8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <div
                    className={`w-1 h-1 rounded-full flex-shrink-0 ${
                      log.type === "success"
                        ? "bg-emerald-400"
                        : log.type === "data"
                          ? "bg-cyan-400"
                          : "bg-white/20"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-mono ${
                      log.type === "success"
                        ? "text-emerald-400/60"
                        : log.type === "data"
                          ? "text-cyan-400/50"
                          : "text-white/20"
                    }`}
                  >
                    {log.text}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Right: Context card + Latency */}
        <div className="w-[280px] flex-shrink-0 space-y-4">
          {/* Context card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 text-[9px] font-semibold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Context Lock
              </div>
            </div>
            <h3 className="text-[15px] font-semibold text-white/85 mb-2 leading-snug">
              {contextCard.title}
            </h3>
            <p className="text-[11px] text-white/30 leading-relaxed mb-4">
              {contextCard.description}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {contextCard.tags.map((tag, i) => (
                <div
                  key={i}
                  className="px-2 py-1 rounded text-[9px] font-mono"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    color: `${tag.color}cc`,
                  }}
                >
                  {tag.label}
                </div>
              ))}
              <span className="text-[9px] text-white/15 ml-1 uppercase tracking-wider">
                {contextCard.status}
              </span>
            </div>
          </motion.div>

          {/* Files card (if any) */}
          {fileNames.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 backdrop-blur-sm"
            >
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/25 mb-2 block">
                Source Materials
              </span>
              <div className="space-y-1.5">
                {fileNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <FileText className="w-3 h-3 text-purple-400/40 flex-shrink-0" />
                    <span className="text-[10px] text-white/40 truncate">
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Latency */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-white/25">
                Neural Latency
              </span>
              <AnimatePresence mode="wait">
                {latencyMs !== null && (
                  <motion.span
                    key={latencyMs}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="text-[10px] font-mono text-cyan-400/60"
                  >
                    {latencyMs}ms
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <LatencyBars active={isActive} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-2 px-2"
          >
            <MessageSquare className="w-3 h-3 text-white/15" />
            <span className="text-[10px] text-white/20 capitalize">
              {persona} mode
            </span>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

export function buildStages(hasFiles: boolean): BridgeStage[] {
  const stages: BridgeStage[] = [];

  if (hasFiles) {
    stages.push({
      id: "source",
      label: "Source Grounding",
      detail: "Queued",
      status: "waiting",
      icon: <BookOpen className="w-4 h-4" />,
    });
  }

  stages.push({
    id: "tutor",
    label: "Tutor Intelligence",
    detail: "Queued",
    status: "waiting",
    icon: <Cpu className="w-4 h-4" />,
  });

  stages.push({
    id: "canvas",
    label: "Visual Architecture",
    detail: "Queued",
    status: "waiting",
    icon: <Sparkles className="w-4 h-4" />,
  });

  stages.push({
    id: "simulation",
    label: "Simulation Engines",
    detail: "Queued",
    status: "waiting",
    icon: <Box className="w-4 h-4" />,
  });

  return stages;
}
