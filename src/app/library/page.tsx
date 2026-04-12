"use client";

import Navbar from "@/components/Navbar";
import { motion } from "framer-motion";
import {
  Sparkles,
  Clock,
  MoreHorizontal,
  Plus,
  FolderOpen,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const savedSessions = [
  {
    id: "1",
    title: "Orbital Mechanics Study",
    persona: "Professor",
    lastOpened: "2 hours ago",
    progress: 75,
    color: "bg-blue-500",
  },
  {
    id: "2",
    title: "Intro to Neural Networks",
    persona: "Engineer",
    lastOpened: "Yesterday",
    progress: 45,
    color: "bg-purple-500",
  },
  {
    id: "3",
    title: "Quantum Mechanics Fundamentals",
    persona: "Explorer",
    lastOpened: "3 days ago",
    progress: 90,
    color: "bg-green-500",
  },
  {
    id: "4",
    title: "Philosophy of Consciousness",
    persona: "Philosopher",
    lastOpened: "1 week ago",
    progress: 30,
    color: "bg-orange-500",
  },
];

export default function LibraryPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = savedSessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-50" />

      <main className="relative pt-24 pb-16 px-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold mb-2">Library</h1>
            <p className="text-text-muted text-sm">
              Your thinking environments and saved sessions
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

        {/* Sessions list */}
        <div className="space-y-2">
          {filtered.map((session, i) => (
            <motion.button
              key={session.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() =>
                router.push(
                  `/workspace?q=${encodeURIComponent(session.title)}&persona=${session.persona.toLowerCase()}`
                )
              }
              className="w-full flex items-center gap-4 bg-surface border border-border-subtle rounded-xl p-4 hover:border-border transition-all group text-left"
            >
              <div
                className={`w-10 h-10 rounded-xl ${session.color}/15 flex items-center justify-center flex-shrink-0`}
              >
                <Sparkles className={`w-5 h-5 ${session.color.replace("bg-", "text-")}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium group-hover:text-accent transition-colors truncate">
                  {session.title}
                </h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-text-muted">
                    {session.persona}
                  </span>
                  <span className="text-[10px] text-text-muted flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {session.lastOpened}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-20 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${session.progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-text-muted w-8 text-right">
                  {session.progress}%
                </span>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded-lg hover:bg-surface-hover transition-colors text-text-muted"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </motion.button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <FolderOpen className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
            <p className="text-sm text-text-muted">No sessions found</p>
          </div>
        )}
      </main>
    </div>
  );
}
