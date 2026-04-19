"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, FileText, Check, Mic, MicOff, ChevronDown, Upload, Link } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore, type UploadedFile } from "@/store/session";
import { useCanvasStore } from "@/store/canvas";
import { useGroundingStore } from "@/store/grounding";
import { isLikelyUrl, stripUrl, detectUrls } from "@/lib/utils/detect-url";
import { startListening, stopListening, isRecognitionSupported } from "@/lib/voice/speech";

export interface Persona { id: string; name: string; desc: string; }

const personas: Persona[] = [
  { id: "professor",   name: "Professor",   desc: "Warm and scholarly" },
  { id: "explorer",   name: "Explorer",    desc: "Socratic and curious" },
  { id: "engineer",   name: "Engineer",    desc: "Precise and systematic" },
  { id: "friend",     name: "Friend",      desc: "Casual and relatable" },
  { id: "philosopher",name: "Philosopher", desc: "Deep and reflective" },
];

export default function InputBar() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [persona, setPersona] = useState(personas[0]);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionOk = useRef(false);
  const router = useRouter();
  const initSession = useSessionStore((s) => s.initSession);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const resetGrounding = useGroundingStore((s) => s.reset);

  useEffect(() => { recognitionOk.current = isRecognitionSupported(); }, []);

  const removeFile = (i: number) => setFiles((f) => f.filter((_, idx) => idx !== i));

  const handleEnter = async () => {
    if (!query.trim()) return;
    const uploaded: UploadedFile[] = await Promise.all(
      files.map((f) =>
        new Promise<UploadedFile>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: f.name, size: f.size, type: f.type, dataUrl: reader.result as string });
          reader.onerror = reject;
          reader.readAsDataURL(f);
        }),
      ),
    );

    // Extract any URLs embedded in the query text
    const detectedUrls = detectUrls(query);

    // Snapshot the previous session into the archive before we wipe the stores
    try {
      const { archiveCurrentSession } = await import("@/lib/session-archive");
      archiveCurrentSession();
    } catch (err) {
      console.warn("[archive] snapshot failed", err);
    }

    clearCanvas();
    resetGrounding();
    initSession(query, persona.id, uploaded, detectedUrls);
    router.push("/workspace");
  };

  const toggleVoice = () => {
    if (isListening) {
      stopListening();
      setIsListening(false);
    } else {
      const ok = startListening((text) => { setQuery(text); setIsListening(false); }, () => setIsListening(false));
      if (ok) setIsListening(true);
    }
  };

  const urlDetected = isLikelyUrl(query);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.06)] overflow-hidden transition-shadow focus-within:shadow-[0_4px_28px_rgba(124,58,237,0.12),0_0_0_1px_rgba(124,58,237,0.2)]">

        {/* Main input row */}
        <div className="flex items-center px-2 py-1 gap-1">
          {/* Expand toggle */}
          <button
            onClick={() => { setExpanded((v) => !v); if (expanded) setPersonaOpen(false); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-black/25 hover:text-black/60 hover:bg-black/[0.04] transition-all flex-shrink-0"
          >
            <Plus className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-45" : ""}`} />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleEnter()}
            placeholder="Topic, question, URL, or idea…"
            className="flex-1 bg-transparent text-[14.5px] text-black/80 placeholder:text-black/25 outline-none py-2.5 min-w-0"
          />

          {/* Mic */}
          {recognitionOk.current && (
            <button
              onClick={toggleVoice}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                isListening
                  ? "bg-red-500/15 text-red-500 ring-1 ring-red-400/40 animate-pulse"
                  : "text-black/25 hover:text-black/60 hover:bg-black/[0.04]"
              }`}
            >
              {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Enter button */}
          <button
            onClick={handleEnter}
            disabled={!query.trim()}
            className="flex-shrink-0 px-4 h-8 bg-violet-600 hover:bg-violet-700 disabled:opacity-30 rounded-xl text-[12px] font-semibold text-white transition-all"
          >
            Enter Synapse
          </button>
        </div>

        {/* URL detected banner */}
        <AnimatePresence>
          {urlDetected && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 pb-2.5">
                <Link className="w-3 h-3 text-violet-500 flex-shrink-0" />
                <span className="text-[11.5px] text-black/40">
                  URL detected — <span className="text-violet-600">{stripUrl(query)}</span> will be fetched
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expanded: files + persona */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="border-t border-black/[0.05] mx-3" />
              <div className="px-4 py-3 space-y-3">

                {/* Controls row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-black/50 hover:text-black/70 hover:bg-black/[0.04] transition-all border border-black/[0.07]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Attach files
                  </button>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg" onChange={(e) => { if (e.target.files) setFiles((p) => [...p, ...Array.from(e.target.files!)]); }} className="hidden" />

                  <button
                    onClick={() => setPersonaOpen((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
                      personaOpen
                        ? "bg-violet-50 text-violet-600 border-violet-200"
                        : "text-black/50 hover:text-black/70 hover:bg-black/[0.04] border-black/[0.07]"
                    }`}
                  >
                    {persona.name}
                    <ChevronDown className={`w-3 h-3 transition-transform ${personaOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {/* Attached files */}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-black/[0.04] rounded-lg text-[11.5px] text-black/55">
                        <FileText className="w-3 h-3 text-violet-500" />
                        <span className="max-w-[100px] truncate">{f.name}</span>
                        <button onClick={() => removeFile(i)} className="text-black/30 hover:text-black/60 transition-colors">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Persona picker */}
                <AnimatePresence>
                  {personaOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-black/[0.05] pt-2.5 space-y-0.5">
                        {personas.map((p) => {
                          const active = p.id === persona.id;
                          return (
                            <button
                              key={p.id}
                              onClick={() => { setPersona(p); setPersonaOpen(false); }}
                              className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between ${
                                active ? "bg-violet-50 text-violet-700" : "hover:bg-black/[0.03] text-black/60"
                              }`}
                            >
                              <div>
                                <div className={`text-[12.5px] font-semibold ${active ? "text-violet-700" : "text-black/70"}`}>{p.name}</div>
                                <div className="text-[11px] opacity-60">{p.desc}</div>
                              </div>
                              {active && <Check className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!personaOpen && (
                  <p className="text-[11.5px] text-black/30">
                    Attach files or switch your learning persona before starting.
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
