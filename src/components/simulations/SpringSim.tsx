"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import SimCanvas from "./SimCanvas";

interface Props {
  parameters: Record<string, number>;
  onParamChange?: (k: string, v: number) => void;
}

function Spring({ stiffness, mass, damping }: { stiffness: number; mass: number; damping: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const posRef = useRef(2);
  const velRef = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = stiffness * 0.5;
    const m = mass * 0.5 + 0.5;
    const d = damping * 0.1;
    const restPos = 0;
    const force = -k * (posRef.current - restPos) - d * velRef.current;
    velRef.current += (force / m) * dt;
    posRef.current += velRef.current * dt;
    if (meshRef.current) {
      meshRef.current.position.y = posRef.current;
    }
  });

  return (
    <>
      {/* Anchor */}
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[1.5, 0.1, 0.5]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      {/* Spring visual (simplified as line) */}
      <mesh position={[0, 1.5, 0]} scale-y={1}>
        <cylinderGeometry args={[0.03, 0.03, 3, 8]} />
        <meshStandardMaterial color="#666" />
      </mesh>
      {/* Mass */}
      <mesh ref={meshRef}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.5} />
      </mesh>
    </>
  );
}

function Scene({ parameters }: { parameters: Record<string, number> }) {
  const stiffness = parameters.stiffness ?? 50;
  const mass = parameters.mass ?? 40;
  const damping = parameters.damping ?? 20;

  return <Spring stiffness={stiffness} mass={mass} damping={damping} />;
}

export default function SpringSim({ parameters }: Props) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0a0a2e] to-background">
      <SimCanvas showStars={false}>
        <Scene parameters={parameters} />
      </SimCanvas>
    </div>
  );
}
