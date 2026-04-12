"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  /** Base64 data URI — keeps the file available after navigation */
  dataUrl: string;
}

export interface SessionData {
  query: string;
  persona: string;
  files: UploadedFile[];
}

interface SessionContextValue {
  session: SessionData | null;
  startSession: (query: string, persona: string, files: File[]) => Promise<void>;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function fileToUploadedFile(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: reader.result as string,
      });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);

  const startSession = useCallback(
    async (query: string, persona: string, files: File[]) => {
      const uploaded = await Promise.all(files.map(fileToUploadedFile));
      setSession({ query, persona, files: uploaded });
    },
    [],
  );

  const clearSession = useCallback(() => setSession(null), []);

  return (
    <SessionContext.Provider value={{ session, startSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
