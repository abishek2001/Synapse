"use client";

import Navbar from "@/components/Navbar";
import { motion } from "framer-motion";
import { Sparkles, Users, Eye, Clock } from "lucide-react";
import { useRouter } from "next/navigation";

const categories = [
  "All",
  "Physics",
  "Mathematics",
  "Biology",
  "Computer Science",
  "Philosophy",
  "Economics",
];

const sessions = [
  {
    id: "1",
    title: "Orbital Mechanics — Escape Velocity",
    description:
      "Explore how objects achieve orbit and the physics of escape trajectories through interactive 3D simulation.",
    category: "Physics",
    users: 12,
    views: 342,
    time: "45 min",
    gradient: "from-blue-500/20 to-cyan-500/20",
    accent: "text-blue-400",
  },
  {
    id: "2",
    title: "Neural Network Backpropagation",
    description:
      "Visualize how gradients flow through layers and adjust weights in a live neural network.",
    category: "Computer Science",
    users: 8,
    views: 218,
    time: "30 min",
    gradient: "from-purple-500/20 to-pink-500/20",
    accent: "text-purple-400",
  },
  {
    id: "3",
    title: "Quantum Superposition",
    description:
      "Interact with qubits in superposition states and observe measurement collapse in real time.",
    category: "Physics",
    users: 15,
    views: 567,
    time: "60 min",
    gradient: "from-green-500/20 to-emerald-500/20",
    accent: "text-green-400",
  },
  {
    id: "4",
    title: "Supply and Demand Equilibrium",
    description:
      "Manipulate market variables and watch price discovery unfold in a dynamic economic model.",
    category: "Economics",
    users: 6,
    views: 124,
    time: "25 min",
    gradient: "from-orange-500/20 to-yellow-500/20",
    accent: "text-orange-400",
  },
  {
    id: "5",
    title: "DNA Replication Process",
    description:
      "Step through the molecular machinery of DNA replication with interactive 3D visualizations.",
    category: "Biology",
    users: 9,
    views: 289,
    time: "35 min",
    gradient: "from-red-500/20 to-rose-500/20",
    accent: "text-red-400",
  },
  {
    id: "6",
    title: "Fourier Transform Intuition",
    description:
      "Decompose complex signals into constituent frequencies with real-time waveform manipulation.",
    category: "Mathematics",
    users: 11,
    views: 445,
    time: "40 min",
    gradient: "from-indigo-500/20 to-violet-500/20",
    accent: "text-indigo-400",
  },
];

export default function ExplorePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-50" />

      <main className="relative pt-24 pb-16 px-6 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold mb-2">Explore</h1>
          <p className="text-text-muted text-sm mb-8">
            Discover thinking environments created by the community
          </p>
        </motion.div>

        {/* Categories */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {categories.map((cat, i) => (
            <motion.button
              key={cat}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                i === 0
                  ? "bg-accent text-white"
                  : "bg-surface text-text-muted hover:text-foreground hover:bg-surface-hover border border-border-subtle"
              }`}
            >
              {cat}
            </motion.button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session, i) => (
            <motion.button
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() =>
                router.push(
                  `/workspace?q=${encodeURIComponent(session.title)}&persona=professor`
                )
              }
              className="group text-left bg-surface border border-border-subtle rounded-2xl p-5 hover:border-border transition-all hover:shadow-lg hover:shadow-black/20"
            >
              <div
                className={`w-full h-28 rounded-xl bg-gradient-to-br ${session.gradient} mb-4 flex items-center justify-center`}
              >
                <Sparkles
                  className={`w-8 h-8 ${session.accent} opacity-60 group-hover:opacity-100 transition-opacity`}
                />
              </div>
              <h3 className="font-semibold text-sm mb-1.5 group-hover:text-accent transition-colors">
                {session.title}
              </h3>
              <p className="text-xs text-text-muted leading-relaxed mb-4 line-clamp-2">
                {session.description}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-text-muted">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {session.users}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {session.views}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {session.time}
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      </main>
    </div>
  );
}
