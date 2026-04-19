"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Phone, PanelLeftOpen, PanelRightOpen, Sun, Moon, Download } from "lucide-react";
import { useUIStore } from "@/store/ui";
import VoiceIsland from "./VoiceIsland";
import { downloadStudyGuide } from "@/lib/export-session";

interface WorkspaceNavbarProps {
  title: string;
  onCallFriend: () => void;
  hasFiles: boolean;
  showSources: boolean;
  onToggleSources: () => void;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export default function WorkspaceNavbar({
  title,
  onCallFriend,
  hasFiles,
  showSources,
  onToggleSources,
  onToggleSidebar,
  sidebarOpen,
}: WorkspaceNavbarProps) {
  const { darkMode, toggleDarkMode, rightSidebarOpen, setRightSidebarOpen } = useUIStore();

  const surface = darkMode
    ? "bg-[#0a0a18] border-white/[0.05] text-white/40"
    : "bg-white border-black/[0.06] text-black/40";
  const btn = darkMode
    ? "text-white/30 hover:text-white/70 hover:bg-white/[0.06]"
    : "text-black/30 hover:text-black/70 hover:bg-black/[0.05]";
  const btnActive = darkMode
    ? "bg-white/[0.08] text-white/70"
    : "bg-black/[0.06] text-black/60";

  return (
    <div className={`relative flex-shrink-0 flex items-center justify-between px-3 h-11 z-40 border-b ${surface}`}>
      {/* Voice notch — Apple-style, drops down from the top edge */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
        <VoiceIsland />
      </div>

      {/* Left */}
      <div className="flex items-center gap-1.5">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title="Table of Contents"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              sidebarOpen ? btnActive : btn
            }`}
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>
        )}
        <Link
          href="/"
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${btn}`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <span className={`text-[13px] font-medium truncate max-w-[320px] ml-1 ${darkMode ? "text-white/50" : "text-black/50"}`}>
          {title}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {hasFiles && (
          <button
            onClick={onToggleSources}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
              showSources ? btnActive : btn
            }`}
          >
            <BookOpen className="w-3 h-3" />
            Sources
          </button>
        )}

        {/* Export study guide */}
        <button
          onClick={downloadStudyGuide}
          title="Export session as study guide (Markdown)"
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${btn}`}
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${btn}`}
        >
          {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* Right sidebar toggle */}
        <button
          onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
          title="Transcript & Updates"
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
            rightSidebarOpen ? btnActive : btn
          }`}
        >
          <PanelRightOpen className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onCallFriend}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
            darkMode
              ? "bg-green-500/10 text-green-400/70 hover:bg-green-500/15 hover:text-green-400"
              : "bg-green-500/10 text-green-600/70 hover:bg-green-500/15 hover:text-green-600"
          }`}
        >
          <Phone className="w-3 h-3" />
          Call a Friend
        </button>
      </div>
    </div>
  );
}
