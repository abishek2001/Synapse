"use client";

import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Clock,
  Plus,
  FolderOpen,
  Search,
  Trash2,
  FileText,
  BarChart3,
  Boxes,
  Layers,
  Calculator,
  BookOpen,
  Activity,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  listArchivedSessions,
  deleteArchivedSession,
  restoreArchivedSession,
  formatRelativeTime,
  type SessionMeta,
} from "@/lib/session-archive";

const PERSONA_COLORS: Record<string, { bg: string; text: string }> = {
  professor:    { bg: "bg-blue-500/15",   text: "text-blue-500" },
  engineer:     { bg: "bg-purple-500/15", text: "text-purple-500" },
  explorer:     { bg: "bg-green-500/15",  text: "text-green-500" },
  philosopher:  { bg: "bg-orange-500/15", text: "text-orange-500" },
  storyteller:  { bg: "bg-pink-500/15",   text: "text-pink-500" },
};

function getPersonaColor(persona: string) {
  return PERSONA_COLORS[persona.toLowerCase()] ?? { bg: "bg-violet-500/15", text: "text-violet-500" };
}

export default function LibraryPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSessions(listArchivedSessions());
    setHydrated(true);
  }, []);

  const filtered = sessions.filter((s) =>
    s.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.canvasTitle ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleOpen = (sessionId: string) => {
    const ok = restoreArchivedSession(sessionId);
    if (ok) {
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (session) {
        router.push(`/workspace?q=${encodeURIComponent(session.query)}&persona=${session.persona}`);
      }
    }
  };

  const handleDelete = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteArchivedSession(sessionId);
    setSessions(listArchivedSessions());
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-50" />

      <main className="relative pt-24 pb-16 px-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold mb-2">Library</h1>
            <p className="text-text-muted text-sm">
              {hydrated && sessions.length > 0
                ? `${sessions.length} saved session${sessions.length === 1 ? "" : "s"} — click to resume`
                : "Your saved learning sessions live here"}
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </motion.div>

        {/* Search */}
        {sessions.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              className="w-full bg-surface border border-border-subtle rounded-xl pl-10 pr-4 py-2.5 text-sm placeholder:text-text-muted outline-none focus:border-accent/40 transition-colors"
            />
          </div>
        )}

        {/* Sessions grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence>
            {filtered.map((session, i) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                index={i}
                onOpen={() => handleOpen(session.sessionId)}
                onDelete={(e) => handleDelete(session.sessionId, e)}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Empty state */}
        {hydrated && sessions.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center py-20"
          >
            <FolderOpen className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
            <p className="text-sm text-text-muted mb-1">No sessions yet</p>
            <p className="text-xs text-text-muted/60">
              Start a new session and it'll appear here automatically
            </p>
          </motion.div>
        )}

        {hydrated && sessions.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-text-muted/30 mx-auto mb-3" />
            <p className="text-sm text-text-muted">No sessions match "{searchQuery}"</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Session card with mini-thumbnail of the canvas ────────────────────── */
function SessionCard({
  session, index, onOpen, onDelete,
}: {
  session: SessionMeta;
  index: number;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const personaColor = getPersonaColor(session.persona);
  const title = session.canvasTitle ?? session.query;

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: Math.min(index * 0.05, 0.5), duration: 0.35 }}
      whileHover={{ y: -2 }}
      onClick={onOpen}
      className="group relative bg-surface border border-border-subtle rounded-2xl p-4 hover:border-accent/30 hover:shadow-lg transition-all text-left overflow-hidden"
    >
      {/* Thumbnail strip — top */}
      <div className="h-20 mb-3 rounded-lg bg-gradient-to-br from-accent/[0.04] to-purple-500/[0.04] border border-border-subtle/40 relative overflow-hidden">
        <CanvasThumbnail thumbnail={session.thumbnail} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium mb-1 group-hover:text-accent transition-colors line-clamp-2 leading-snug">
        {title}
      </h3>

      {/* Meta row */}
      <div className="flex items-center gap-3 mt-2 text-[10.5px] text-text-muted">
        <span className={`px-1.5 py-0.5 rounded ${personaColor.bg} ${personaColor.text} font-medium capitalize`}>
          {session.persona}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" />
          {formatRelativeTime(session.lastActive)}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="w-2.5 h-2.5" />
          {session.artifactCount}
        </span>
      </div>

      {/* Delete (visible on hover) */}
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-background/90 border border-border-subtle opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-500/10"
        title="Delete session"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </motion.button>
  );
}

/* ── Mini-thumbnail of the canvas ─────────────────────────────────────────
   Renders each artifact as a tiny coloured rect in the same spatial layout.
*/
function CanvasThumbnail({ thumbnail }: { thumbnail: SessionMeta["thumbnail"] }) {
  if (!thumbnail || thumbnail.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-text-muted/40">
        <Sparkles className="w-5 h-5" />
      </div>
    );
  }

  // Compute bounding box
  const xs = thumbnail.map((t) => t.x);
  const ys = thumbnail.map((t) => t.y);
  const xrs = thumbnail.map((t) => t.x + t.w);
  const yrs = thumbnail.map((t) => t.y + (t.h ?? 200));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xrs);
  const maxY = Math.max(...yrs);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);

  // Map artifact type → tint
  const TYPE_TINT: Record<string, string> = {
    flashcard:  "rgba(124,58,237,0.55)",
    graph:      "rgba(14,165,233,0.55)",
    notation:   "rgba(236,72,153,0.55)",
    visual:     "rgba(16,185,129,0.55)",
    lookup:     "rgba(249,115,22,0.55)",
    simulation: "rgba(168,85,247,0.55)",
    render3d:   "rgba(139,92,246,0.65)",
    diagram:    "rgba(59,130,246,0.55)",
  };

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {thumbnail.map((t, i) => (
        <rect
          key={i}
          x={t.x}
          y={t.y}
          width={t.w}
          height={t.h ?? 200}
          rx={Math.min(t.w * 0.04, 12)}
          fill={TYPE_TINT[t.type] ?? "rgba(124,58,237,0.4)"}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={Math.max(width * 0.003, 1)}
        />
      ))}
    </svg>
  );
}

// Stripped icon imports we don't end up using
void [BarChart3, Boxes, Calculator, BookOpen, Activity, FileText];
