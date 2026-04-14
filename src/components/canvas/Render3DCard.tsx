"use client";

import { useState, useEffect, useRef } from "react";
import type { Render3DArtifact } from "@/lib/tools/types";
import { Box } from "lucide-react";

const RENDER_HEIGHT = 420;

// Sanitise AI code so </script> inside the code block can't break the srcdoc
function sanitiseForScript(code: string): string {
  return code.replace(/<\/script>/gi, "<\\/script>");
}

function buildSrcdoc(artifact: Render3DArtifact): string {
  const camDist = artifact.camera_distance ?? 5;
  const bg = artifact.bg_color ?? "#0a0b14";
  const safeCode = sanitiseForScript(artifact.code);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: ${bg}; overflow: hidden; width: 100vw; height: 100vh; }
canvas { display: block; }
#hint {
  position: fixed;
  bottom: 8px;
  right: 10px;
  font-size: 10px;
  color: rgba(255,255,255,0.18);
  font-family: system-ui, sans-serif;
  pointer-events: none;
  letter-spacing: 0.03em;
  user-select: none;
}
</style>
<script>
window.onerror = function(msg, url, line) {
  window.parent.postMessage({ type: 'render3d_error', message: msg + ' (line ' + line + ')' }, '*');
  return true;
};
</script>
<script type="importmap">
{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}
</script>
</head>
<body>
<div id="hint">drag · rotate &nbsp;|&nbsp; scroll · zoom &nbsp;|&nbsp; right-drag · pan</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Renderer ────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ─── Scene ───────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color("${bg}");

// ─── Camera ──────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 2000);
camera.position.set(0, ${(camDist * 0.3).toFixed(2)}, ${camDist});

// ─── Controls ────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = true;
controls.minDistance = 0.05;
controls.maxDistance = 800;

// ─── Lighting ────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x8ab4f8, 0.35);
fill.position.set(-6, -3, -6);
scene.add(fill);

const accent = new THREE.PointLight(0x7c3aed, 0.9, 80);
accent.position.set(-5, 6, -5);
scene.add(accent);

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── AI-generated scene ──────────────────────────────────────────────────────
${safeCode}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Loop ────────────────────────────────────────────────────────────────────
function loop(t) {
  requestAnimationFrame(loop);
  if (typeof update !== 'undefined') update(t * 0.001);
  controls.update();
  renderer.render(scene, camera);
}
loop(0);
</script>
</body>
</html>`;
}

export default function Render3DCard({ artifact }: { artifact: Render3DArtifact }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "render3d_error") setError(e.data.message as string);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // External embed (Sketchfab etc.) — bypass Three.js scaffold entirely
  if (artifact.embed_url) {
    return (
      <div className="w-full rounded-xl overflow-hidden" style={{ height: RENDER_HEIGHT }}>
        <iframe
          src={artifact.embed_url}
          sandbox="allow-scripts allow-same-origin allow-popups"
          allow="autoplay; fullscreen; xr-spatial-tracking"
          className="w-full h-full border-0"
          title={`3D: ${artifact.title}`}
        />
      </div>
    );
  }

  if (!artifact.code) {
    return (
      <div
        className="w-full flex items-center justify-center rounded-xl"
        style={{ height: RENDER_HEIGHT, background: "#0a0b14" }}
      >
        <div className="text-center">
          <Box className="w-5 h-5 mx-auto mb-2" style={{ color: "rgba(255,255,255,0.15)" }} />
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            Building 3D scene…
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full flex items-center justify-center rounded-xl"
        style={{ height: RENDER_HEIGHT, background: "#0c0d15" }}
      >
        <div className="text-center max-w-xs px-4">
          <div className="text-red-400 text-sm font-medium mb-2">Render Error</div>
          <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl overflow-hidden" style={{ height: RENDER_HEIGHT }}>
      <iframe
        ref={iframeRef}
        srcDoc={buildSrcdoc(artifact)}
        sandbox="allow-scripts"
        className="w-full h-full border-0"
        title={`3D: ${artifact.title}`}
      />
    </div>
  );
}
