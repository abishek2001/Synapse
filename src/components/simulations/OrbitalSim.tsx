"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import SimCanvas from "./SimCanvas";

interface Props {
  parameters: Record<string, number>;
  onParamChange?: (k: string, v: number) => void;
}

function Sun() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.1;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={2} />
      <pointLight color="#fbbf24" intensity={4} distance={20} />
    </mesh>
  );
}

function Planet({
  radius,
  speed,
  size,
  color,
  offset,
}: {
  radius: number;
  speed: number;
  size: number;
  color: string;
  offset: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime() * speed + offset;
    ref.current.position.x = Math.cos(t) * radius;
    ref.current.position.z = Math.sin(t) * radius;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function OrbitRing({ radius }: { radius: number }) {
  return (
    <mesh rotation-x={Math.PI / 2}>
      <torusGeometry args={[radius, 0.01, 8, 64]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
    </mesh>
  );
}

function Scene({ parameters }: { parameters: Record<string, number> }) {
  const velocity = (parameters.velocity ?? 50) / 50;
  const mass = (parameters.mass ?? 50) / 50;
  const distance = (parameters.distance ?? 50) / 25 + 1.5;

  return (
    <>
      <Sun />
      <OrbitRing radius={distance} />
      <OrbitRing radius={distance + 1.5} />
      <OrbitRing radius={distance + 3.5} />
      <Planet radius={distance} speed={velocity} size={0.2 * mass} color="#3b82f6" offset={0} />
      <Planet radius={distance + 1.5} speed={velocity * 0.6} size={0.15 * mass} color="#ef4444" offset={2} />
      <Planet radius={distance + 3.5} speed={velocity * 0.3} size={0.12 * mass} color="#a855f7" offset={4} />
    </>
  );
}

export default function OrbitalSim({ parameters }: Props) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0a0a2e] to-background">
      <SimCanvas>
        <Scene parameters={parameters} />
      </SimCanvas>
    </div>
  );
}
