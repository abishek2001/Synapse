"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import SimCanvas from "./SimCanvas";

interface Props {
  parameters: Record<string, number>;
  onParamChange?: (k: string, v: number) => void;
}

function Pendulum({ length, angle, gravity, damping }: { length: number; angle: number; gravity: number; damping: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const velRef = useRef(0);
  const angRef = useRef((angle / 180) * Math.PI);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = gravity * 0.2;
    const d = damping * 0.01;
    const acc = (-g / length) * Math.sin(angRef.current) - d * velRef.current;
    velRef.current += acc * dt;
    angRef.current += velRef.current * dt;
    if (groupRef.current) {
      groupRef.current.rotation.z = angRef.current;
    }
  });

  return (
    <group ref={groupRef} position={[0, 2, 0]}>
      <mesh position={[0, -length / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, length, 8]} />
        <meshStandardMaterial color="#888" />
      </mesh>
      <mesh position={[0, -length, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Scene({ parameters }: { parameters: Record<string, number> }) {
  const length = (parameters.length ?? 50) / 20 + 1;
  const angle = parameters.angle ?? 45;
  const gravity = parameters.gravity ?? 50;
  const damping = parameters.damping ?? 10;

  return (
    <>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[2, 0.1, 0.1]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <Pendulum length={length} angle={angle} gravity={gravity} damping={damping} />
    </>
  );
}

export default function PendulumSim({ parameters }: Props) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0a0a2e] to-background">
      <SimCanvas showStars={false}>
        <Scene parameters={parameters} />
      </SimCanvas>
    </div>
  );
}
