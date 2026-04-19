"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Library, Bell, Sparkles } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 bg-background/80 backdrop-blur-xl border-b border-border-subtle">
      <Link href="/" className="flex items-center gap-2 group min-w-0">
        <div className="relative w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center group-hover:bg-accent/30 transition-colors flex-shrink-0">
          <Sparkles className="w-4 h-4 text-accent" />
        </div>
        <span className="text-base sm:text-lg font-semibold tracking-tight">Synapse</span>
      </Link>

      <div className="flex items-center gap-1">
        <NavLink href="/explore" active={pathname === "/explore"}>
          <Compass className="w-4 h-4" />
          <span className="hidden sm:inline">Explore</span>
        </NavLink>
        <NavLink href="/library" active={pathname === "/library"}>
          <Library className="w-4 h-4" />
          <span className="hidden sm:inline">Library</span>
        </NavLink>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button className="hidden sm:inline-flex p-2 rounded-lg hover:bg-surface-hover transition-colors text-text-muted hover:text-foreground">
          <Bell className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-purple-400 flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0">
          S
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-sm transition-all ${
        active
          ? "text-foreground bg-surface"
          : "text-text-muted hover:text-text-secondary hover:bg-surface-hover"
      }`}
    >
      {children}
    </Link>
  );
}
