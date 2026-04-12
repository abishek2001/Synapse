"use client";

import { motion } from "framer-motion";

export default function HeroTitle() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="text-center"
    >
      <h1
        className="text-6xl md:text-8xl font-bold tracking-tight"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        <span className="bg-gradient-to-b from-white via-white to-text-muted bg-clip-text text-transparent">
          Synapse
        </span>
      </h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mt-3 text-sm tracking-[0.15em] uppercase text-text-muted"
      >
        Think inside ideas
      </motion.p>
    </motion.div>
  );
}
