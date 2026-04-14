"use client";

import { useRef, useEffect, useState } from "react";

interface SimParam {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

interface SimulationFrameProps {
  code: string;
  onParamsReady?: (params: Record<string, SimParam>) => void;
}

export default function SimulationFrame({ code, onParamsReady }: SimulationFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "init" && e.data.params) {
        onParamsReady?.(e.data.params);
      }
      if (e.data?.type === "error") {
        setError(e.data.message);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onParamsReady]);

  const wrappedCode = wrapWithErrorHandling(code);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0c0d15] rounded-xl">
        <div className="text-center max-w-sm">
          <div className="text-red-400 text-sm font-medium mb-2">Simulation Error</div>
          <p className="text-xs text-white/40 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={wrappedCode}
      sandbox="allow-scripts"
      className="w-full h-full border-0 bg-[#0c0d15] rounded-xl"
      title="Synapse Simulation"
    />
  );
}

export function sendParamUpdate(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  params: Record<string, number>,
) {
  iframeRef.current?.contentWindow?.postMessage(
    { type: "params", params },
    "*",
  );
}

function wrapWithErrorHandling(html: string): string {
  const errorScript = `<script>
window.onerror = function(msg, url, line) {
  window.parent.postMessage({ type: 'error', message: msg + ' (line ' + line + ')' }, '*');
  return true;
};
</script>`;

  return html.replace("</head>", `${errorScript}\n</head>`);
}
