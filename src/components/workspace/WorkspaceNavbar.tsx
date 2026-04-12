"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Phone } from "lucide-react";

interface WorkspaceNavbarProps {
  title: string;
  onCallFriend: () => void;
  hasFiles: boolean;
  showSources: boolean;
  onToggleSources: () => void;
}

export default function WorkspaceNavbar({
  title,
  onCallFriend,
  hasFiles,
  showSources,
  onToggleSources,
}: WorkspaceNavbarProps) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-5 h-10 z-40">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="w-6 h-6 rounded-full bg-black/[0.04] flex items-center justify-center text-black/40 hover:text-black/80 hover:bg-black/[0.08] transition-all"
        >
          <ArrowLeft className="w-3 h-3" />
        </Link>
        <span className="text-[12px] font-medium text-black/45 truncate max-w-[280px]">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {hasFiles && (
          <button
            onClick={onToggleSources}
            className={`flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[10px] font-medium transition-all ${
              showSources
                ? "bg-black/[0.07] text-black/70"
                : "text-black/30 hover:text-black/55"
            }`}
          >
            <BookOpen className="w-2.5 h-2.5" />
            Sources
          </button>
        )}
        <button
          onClick={onCallFriend}
          className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-full text-[10px] font-medium bg-green-500/10 text-green-600/70 hover:bg-green-500/15 hover:text-green-600 transition-all"
        >
          <Phone className="w-2.5 h-2.5" />
          Call a Friend
        </button>
      </div>
    </div>
  );
}
