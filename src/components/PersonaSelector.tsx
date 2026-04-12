"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { Persona } from "./InputBar";

interface PersonaSelectorProps {
  personas: Persona[];
  selected: Persona;
  onSelect: (persona: Persona) => void;
}

export default function PersonaSelector({
  personas,
  selected,
  onSelect,
}: PersonaSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.1 }}
      className="absolute left-0 top-full mt-1 w-52 bg-[#111128] border border-border rounded-lg overflow-hidden shadow-xl shadow-black/50 z-50"
    >
      <div className="p-1">
        {personas.map((persona) => {
          const isSelected = persona.id === selected.id;
          return (
            <button
              key={persona.id}
              onClick={() => onSelect(persona)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md transition-all flex items-center justify-between ${
                isSelected
                  ? "bg-accent/15 text-foreground"
                  : "text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <span className="text-xs font-medium">{persona.name}</span>
              {isSelected && (
                <Check className="w-3 h-3 text-accent flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
