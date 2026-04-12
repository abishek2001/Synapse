"use client";

import { Suspense } from "react";
import WorkspaceView from "@/components/workspace/WorkspaceView";

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-sm text-text-muted">
              Generating environment...
            </span>
          </div>
        </div>
      }
    >
      <WorkspaceView />
    </Suspense>
  );
}
