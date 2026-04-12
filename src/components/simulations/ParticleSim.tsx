"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import SimCanvas from "./SimCanvas";

interface Props {
  parameters: Record<string, number>;
  onParamChange?: (k: string, v: number) => void;
}

function Particles({ count, speed, attraction }: { count: number; speed: number; attraction: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const velocities = useRef<Float32Array | null>(null);
  const positions = useRef<Float32Array | null>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      vel[i * 3] = (Math.random() - 0.5) * speed * 0.1;
      vel[i * 3 + 1] = (Math.random() - 0.5) * speed * 0.1;
      vel[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.1;
    }
    positions.current = pos;
    velocities.current = vel;
  }, [count, speed]);

  useFrame((_, delta) => {
    if (!meshRef.current || !positions.current || !velocities.current) return;
    const dt = Math.min(delta, 0.05);
    const att = attraction * 0.0005;

    for (let i = 0; i < count; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      const px = positions.current[ix], py = positions.current[iy], pz = positions.current[iz];
      const dist = Math.sqrt(px * px + py * py + pz * pz) || 1;

      velocities.current[ix] += (-px / dist) * att;
      velocities.current[iy] += (-py / dist) * att;
      velocities.current[iz] += (-pz / dist) * att;

      positions.current[ix] += velocities.current[ix] * dt * 60;
      positions.current[iy] += velocities.current[iy] * dt * 60;
      positions.current[iz] += velocities.current[iz] * dt * 60;

      dummy.position.set(positions.current[ix], positions.current[iy], positions.current[iz]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.04, 8, 8]} />
      <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={1} />
    </instancedMesh>
  );
}

function Scene({ parameters }: { parameters: Record<string, number> }) {
  const count = Math.round(((parameters.count ?? 50) / 100) * 200 + 20);
  const speed = (parameters.speed ?? 40) / 20;
  const attraction = parameters.attraction ?? 60;

  return <Particles count={count} speed={speed} attraction={attraction} />;
}

export default function ParticleSim({ parameters }: Props) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0a0a2e] to-background">
      <SimCanvas>
        <Scene parameters={parameters} />
      </SimCanvas>
    </div>
  );
}
