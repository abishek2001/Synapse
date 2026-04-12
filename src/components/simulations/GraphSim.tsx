"use client";

import { useMemo } from "react";
import SimCanvas from "./SimCanvas";
import * as THREE from "three";
import { Line } from "@react-three/drei";

interface Props {
  parameters: Record<string, number>;
  onParamChange?: (k: string, v: number) => void;
}

function Axes() {
  return (
    <>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[10, 0.01, 0.01]} />
        <meshBasicMaterial color="#555" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.01, 8, 0.01]} />
        <meshBasicMaterial color="#555" />
      </mesh>
    </>
  );
}

function Curve({ slope, intercept, curvature }: { slope: number; intercept: number; curvature: number }) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let x = -5; x <= 5; x += 0.05) {
      const y = curvature * x * x + slope * x + intercept;
      if (Math.abs(y) < 5) {
        pts.push([x, y, 0]);
      }
    }
    return pts;
  }, [slope, intercept, curvature]);

  if (points.length < 2) return null;

  return <Line points={points} color="#7c3aed" lineWidth={2} />;
}

function GridLines() {
  const lines = useMemo(() => {
    const arr: { points: [number, number, number][] }[] = [];
    for (let i = -5; i <= 5; i++) {
      arr.push({ points: [[i, -4, 0], [i, 4, 0]] });
      arr.push({ points: [[-5, i, 0], [5, i, 0]] });
    }
    return arr;
  }, []);

  return (
    <>
      {lines.map((l, i) => (
        <Line key={i} points={l.points} color="#222" lineWidth={0.5} />
      ))}
    </>
  );
}

function Scene({ parameters }: { parameters: Record<string, number> }) {
  const slope = ((parameters.slope ?? 50) - 50) / 25;
  const intercept = ((parameters.intercept ?? 25) - 50) / 25;
  const curvature = (parameters.curvature ?? 0) / 100;

  return (
    <>
      <GridLines />
      <Axes />
      <Curve slope={slope} intercept={intercept} curvature={curvature} />
    </>
  );
}

export default function GraphSim({ parameters }: Props) {
  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0a0a2e] to-background">
      <SimCanvas showStars={false}>
        <Scene parameters={parameters} />
      </SimCanvas>
    </div>
  );
}
