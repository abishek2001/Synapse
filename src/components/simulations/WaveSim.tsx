"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import SimCanvas from "./SimCanvas";

interface Props {
  parameters: Record<string, number>;
  onParamChange?: (k: string, v: number) => void;
}

function Wave({ frequency, amplitude, speed }: { frequency: number; amplitude: number; speed: number }) {
  const geometryRef = useRef<THREE.PlaneGeometry>(null);

  useFrame(({ clock }) => {
    const geometry = geometryRef.current;
    if (!geometry) return;

    const t = clock.getElapsedTime() * speed;
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = Math.sin(x * frequency + t) * amplitude * 0.3 + Math.sin(y * frequency * 0.5 + t * 0.7) * amplitude * 0.15;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <mesh rotation-x={-Math.PI / 3}>
      <planeGeometry ref={geometryRef} args={[10, 6, 128, 64]} />
      <meshStandardMaterial color="#7c3aed" wireframe transparent opacity={0.6} />
    </mesh>
  );
}

function Scene({ parameters }: { parameters: Record<string, number> }) {
  const frequency = (parameters.frequency ?? 30) / 15;
  const amplitude = (parameters.amplitude ?? 50) / 50;
  const speed = (parameters.speed ?? 40) / 20;

  return <Wave frequency={frequency} amplitude={amplitude} speed={speed} />;
}

export default function WaveSim({ parameters }: Props) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0a0a2e] to-background">
      <SimCanvas showStars={false}>
        <Scene parameters={parameters} />
      </SimCanvas>
    </div>
  );
}
