"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, Upload, X, FileText, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore, type UploadedFile } from "@/store/session";

export interface Persona {
  id: string;
  name: string;
  description: string;
}

const personas: Persona[] = [
  { id: "professor", name: "Professor", description: "Warm, scholarly, and structured." },
  { id: "explorer", name: "Explorer", description: "Curious, open-ended, Socratic." },
  { id: "engineer", name: "Engineer", description: "Precise, systematic, and hands-on." },
  { id: "friend", name: "Friend", description: "Casual, analogy-driven, relatable." },
  { id: "philosopher", name: "Philosopher", description: "Deep, reflective, and abstract." },
];

export default function InputBar() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(personas[0]);
  const [files, setFiles] = useState<File[]>([]);
  const [personaOpen, setPersonaOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const initSession = useSessionStore((s) => s.initSession);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEnter = async () => {
    if (query.trim()) {
      const uploaded: UploadedFile[] = await Promise.all(
        files.map(
          (f) =>
            new Promise<UploadedFile>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({ name: f.name, size: f.size, type: f.type, dataUrl: reader.result as string });
              reader.onerror = reject;
              reader.readAsDataURL(f);
            }),
        ),
      );
      initSession(query, selectedPersona.id, uploaded);
      const params = new URLSearchParams({ q: query, persona: selectedPersona.id });
      router.push(`/workspace?${params.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnter();
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Input container — everything lives inside one card */}
      <div
        className={`bg-surface border rounded-2xl transition-all duration-200 ${
          expanded
            ? "border-accent/30 shadow-[0_0_40px_rgba(124,58,237,0.08)]"
            : "border-border focus-within:border-accent/30 focus-within:shadow-[0_0_30px_rgba(124,58,237,0.06)]"
        }`}
      >
        {/* Top row: plus + input + play */}
        <div className="flex items-center px-2 py-1">
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (expanded) setPersonaOpen(false);
            }}
            className="flex-shrink-0 w-10 h-10 rounded-xl hover:bg-surface-hover flex items-center justify-center transition-all text-text-muted hover:text-foreground"
          >
            <Plus
              className={`w-5 h-5 transition-transform duration-200 ${expanded ? "rotate-45" : ""}`}
            />
          </button>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Start with a topic, question, or idea"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted outline-none"
          />

          <button
            onClick={handleEnter}
            disabled={!query.trim()}
            className="flex-shrink-0 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:hover:bg-accent rounded-xl text-xs font-semibold tracking-wide uppercase text-white transition-all"
          >
            Enter Synapse
          </button>
        </div>

        {/* Expandable section — seamless inside the card */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="border-t border-border-subtle mx-3" />

              <div className="px-3 py-3 space-y-3">
                {/* Pill buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-surface-hover hover:bg-border/60 rounded-lg text-xs font-medium transition-colors text-text-secondary"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Attach files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <button
                    onClick={() => setPersonaOpen(!personaOpen)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      personaOpen
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-hover hover:bg-border/60 text-text-secondary"
                    }`}
                  >
                    {selectedPersona.name}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-150 ${personaOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {/* Uploaded files */}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {files.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-hover rounded-lg text-[11px] text-text-secondary"
                      >
                        <FileText className="w-3 h-3 text-accent" />
                        <span className="max-w-[100px] truncate">{file.name}</span>
                        <button
                          onClick={() => removeFile(i)}
                          className="text-text-muted hover:text-foreground transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Persona list — flows inline */}
                <AnimatePresence>
                  {personaOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border-subtle pt-2.5 space-y-1">
                        <div className="flex items-center justify-between px-1 pb-1">
                          <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">
                            Persona
                          </span>
                          <span className="text-[10px] font-semibold tracking-widest uppercase text-text-muted">
                            Synapse AI
                          </span>
                        </div>
                        {personas.map((persona) => {
                          const active = persona.id === selectedPersona.id;
                          return (
                            <button
                              key={persona.id}
                              onClick={() => {
                                setSelectedPersona(persona);
                                setPersonaOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center justify-between ${
                                active
                                  ? "bg-accent/10 ring-1 ring-accent/25"
                                  : "hover:bg-surface-hover"
                              }`}
                            >
                              <div>
                                <div className="text-xs font-semibold">{persona.name}</div>
                                <div className="text-[11px] text-text-muted">{persona.description}</div>
                              </div>
                              {active && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Helper text */}
                {!personaOpen && (
                  <p className="text-[11px] text-text-muted">
                    Add supporting files before starting a new session.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    
    </div>
  );
}
