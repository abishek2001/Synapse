"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Clock, RefreshCw, X } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useUIStore } from "@/store/ui";
import { useAIChat } from "@/hooks/useAIChat";
import { errorTitle } from "@/lib/agents/error-classify";

/**
 * Floating side banner for recoverable chat errors (rate limits, model
 * timeouts). Replaces the old "Something went wrong. Let me try again…"
 * tutor message that used to appear in the latest-tutor bubble for transient
 * upstream blips. Renders only when `useSessionStore().chatError` is set;
 * disappears automatically when the user retries successfully or dismisses.
 *
 * Position: bottom-left of the canvas area, above the canvas tool palette,
 * so it doesn't fight with the centred tutor bubble / input pill.
 */
export default function ChatErrorBanner() {
  const { chatError, setChatError, isStreaming } = useSessionStore();
  const { darkMode } = useUIStore();
  const { sendMessage } = useAIChat();
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Tick down a "ready in Xs" hint when the upstream gave us a Retry-After.
  useEffect(() => {
    if (!chatError?.retryAfterMs) {
      setSecondsLeft(0);
      return;
    }
    const readyAt = chatError.timestamp + chatError.retryAfterMs;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [chatError]);

  if (!chatError) return null;

  const cooling = secondsLeft > 0;
  const canRetry = !isStreaming && !cooling;

  const handleRetry = () => {
    if (!canRetry) return;
    // sendMessage's first action is `setChatError(null)`, so the banner will
    // exit on retry-start and only re-appear if the next attempt fails too.
    sendMessage(chatError.retryPrompt);
  };

  const handleDismiss = () => setChatError(null);

  // Theme tokens
  const surface = darkMode ? "rgba(28,28,40,0.95)" : "rgba(255,255,255,0.96)";
  const ring = darkMode ? "rgba(244,63,94,0.35)" : "rgba(244,63,94,0.4)";
  const titleColor = darkMode ? "text-white/90" : "text-black/85";
  const bodyColor = darkMode ? "text-white/55" : "text-black/55";
  const subtleColor = darkMode ? "text-white/35" : "text-black/40";
  const dismissBtn = darkMode
    ? "text-white/30 hover:text-white/70 hover:bg-white/10"
    : "text-black/30 hover:text-black/70 hover:bg-black/5";

  const Icon = chatError.code === "timeout" ? Clock : AlertTriangle;

  return (
    <AnimatePresence>
      {chatError && (
        <motion.div
          key={`chat-error-${chatError.timestamp}`}
          initial={{ opacity: 0, x: -16, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="absolute bottom-20 left-4 z-40 pointer-events-auto"
          style={{ maxWidth: "min(380px, calc(100vw - 32px))" }}
        >
          <div
            role="alert"
            className="rounded-xl shadow-xl p-3 flex items-start gap-2.5"
            style={{
              backgroundColor: surface,
              backdropFilter: "blur(20px)",
              border: `1px solid ${ring}`,
              boxShadow: `0 8px 30px rgba(244,63,94,0.18)`,
            }}
          >
            <div
              className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: "rgba(244,63,94,0.15)" }}
            >
              <Icon className="w-3.5 h-3.5 text-rose-400" />
            </div>

            <div className="flex-1 min-w-0">
              <div className={`text-[12.5px] font-medium ${titleColor}`}>
                {errorTitle(chatError.code)}
              </div>
              <p className={`text-[11px] mt-0.5 leading-snug ${bodyColor} line-clamp-3`}>
                {chatError.code === "rate_limit"
                  ? "The model is throttling our requests. Hold on a moment, then retry."
                  : chatError.code === "timeout"
                    ? "The model didn't respond in time. The network may be slow — try again."
                    : chatError.message}
              </p>

              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleRetry}
                  disabled={!canRetry}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${
                    canRetry
                      ? "bg-violet-600 hover:bg-violet-700 text-white shadow-sm"
                      : "bg-violet-600/40 text-white/70 cursor-not-allowed"
                  }`}
                  title={cooling ? `Retry in ${secondsLeft}s` : "Retry this turn"}
                >
                  <RefreshCw className={`w-3 h-3 ${isStreaming ? "animate-spin" : ""}`} />
                  {isStreaming
                    ? "Retrying…"
                    : cooling
                      ? `Retry in ${secondsLeft}s`
                      : "Retry"}
                </button>

                {chatError.retryPrompt && (
                  <span
                    className={`text-[10.5px] truncate ${subtleColor}`}
                    title={chatError.retryPrompt}
                    style={{ maxWidth: 200 }}
                  >
                    “{chatError.retryPrompt}”
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${dismissBtn}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
