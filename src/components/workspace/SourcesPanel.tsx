"use client";

import { FileText, X } from "lucide-react";
import { motion } from "framer-motion";
import type { UploadedFile } from "@/store/session";
import { useUIStore } from "@/store/ui";

interface SourcesPanelProps {
  files: UploadedFile[];
  onClose: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SourcesPanel({ files, onClose }: SourcesPanelProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  const surface = darkMode
    ? "bg-[#0d0d18]/90 border-white/[0.08]"
    : "bg-white/90 border-black/[0.06]";
  const heading = darkMode ? "text-white/55" : "text-black/50";
  const closeBtn = darkMode
    ? "bg-white/[0.06] text-white/40 hover:text-white/80"
    : "bg-black/[0.04] text-black/25 hover:text-black/60";
  const rowHover = darkMode ? "hover:bg-white/[0.04]" : "hover:bg-black/[0.03]";
  const fileIcon = darkMode ? "text-white/30" : "text-black/25";
  const fileName = darkMode ? "text-white/75" : "text-black/60";
  const fileMeta = darkMode ? "text-white/35" : "text-black/25";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`w-56 backdrop-blur-2xl border rounded-2xl overflow-hidden shadow-xl ${surface}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className={`text-[11px] font-medium ${heading}`}>Sources</span>
        <button
          onClick={onClose}
          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${closeBtn}`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      <div className="px-2 pb-2 space-y-0.5">
        {files.map((file, i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${rowHover}`}
          >
            <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${fileIcon}`} />
            <div className="min-w-0">
              <p className={`text-[11px] font-medium truncate ${fileName}`}>
                {file.name}
              </p>
              <p className={`text-[9px] ${fileMeta}`}>{formatSize(file.size)}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
