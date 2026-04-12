"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import type { ReactNode } from "react";

interface SimCanvasProps {
  children: ReactNode;
  showStars?: boolean;
}

export default function SimCanvas({ children, showStars = true }: SimCanvasProps) {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 60 }} className="!bg-transparent">
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      {showStars && <Stars radius={100} depth={50} count={1000} factor={3} fade speed={1} />}
      <OrbitControls enableZoom enablePan={false} />
      {children}
    </Canvas>
  );
}
