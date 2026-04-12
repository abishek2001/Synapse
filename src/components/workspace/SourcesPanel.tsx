"use client";

import { FileText, X } from "lucide-react";
import { motion } from "framer-motion";
import type { UploadedFile } from "@/store/session";

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
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="w-56 bg-white/90 backdrop-blur-2xl border border-black/[0.06] rounded-2xl overflow-hidden shadow-xl"
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-[11px] font-medium text-black/50">Sources</span>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded-full bg-black/[0.04] flex items-center justify-center text-black/25 hover:text-black/60 transition-all"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      <div className="px-2 pb-2 space-y-0.5">
        {files.map((file, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-black/[0.03] transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-black/25 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-black/60 truncate">
                {file.name}
              </p>
              <p className="text-[9px] text-black/25">{formatSize(file.size)}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
