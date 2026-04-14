"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Text, Line } from "@react-three/drei";
import * as THREE from "three";
import type { SceneConfig, SceneObject, SceneAnimation, SceneConnection } from "@/lib/scene-types";

interface UniversalSceneProps {
  config: SceneConfig;
}

export default function UniversalScene({ config }: UniversalSceneProps) {
  const env = config.environment ?? "space";
  const cam = config.camera?.position ?? [0, 4, 10];

  return (
    <div className="w-full h-full bg-gradient-to-b from-[#0a0a2e] to-background">
      <Canvas camera={{ position: cam, fov: 55 }} className="!bg-transparent">
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1.2} />
        <directionalLight position={[-5, 5, 5]} intensity={0.6} />

        {env === "space" && <Stars radius={80} depth={50} count={800} factor={3} fade speed={0.8} />}
        {env === "grid" && <GridFloor />}
        {env === "lab" && <LabEnv />}

        {config.objects.map((obj) => (
          <SceneObj key={obj.id} obj={obj} />
        ))}

        {config.connections?.map((conn, i) => (
          <Connection key={i} conn={conn} objects={config.objects} />
        ))}

        <OrbitControls enableZoom enablePan dampingFactor={0.1} />
      </Canvas>
    </div>
  );
}

function GridFloor() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -2, 0]}>
      <planeGeometry args={[30, 30, 30, 30]} />
      <meshBasicMaterial color="#7c3aed" wireframe transparent opacity={0.06} />
    </mesh>
  );
}

function LabEnv() {
  return (
    <>
      <GridFloor />
      <mesh rotation-x={-Math.PI / 2} position={[0, -2.01, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#0a0b14" />
      </mesh>
    </>
  );
}

function SceneObj({ obj }: { obj: SceneObject }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current || !obj.animate) return;
    const t = clock.getElapsedTime();
    applyAnimation(groupRef.current, obj.animate, t, obj.position);
  });

  const sizeArr = typeof obj.size === "number"
    ? [obj.size, obj.size, obj.size] as [number, number, number]
    : (obj.size ?? [1, 1, 1]);

  if (obj.shape === "text") {
    return (
      <group position={obj.position}>
        <Text
          fontSize={sizeArr[0] * 0.3 || 0.3}
          color={obj.color}
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {obj.label || ""}
        </Text>
      </group>
    );
  }

  if (obj.shape === "arrow") {
    return <ArrowObj obj={obj} />;
  }

  return (
    <group ref={groupRef} position={obj.position}>
      <mesh>
        <ShapeGeometry shape={obj.shape} size={sizeArr} />
        <meshStandardMaterial
          color={obj.color}
          emissive={obj.emissive ? obj.color : "#000000"}
          emissiveIntensity={obj.emissiveIntensity ?? (obj.emissive ? 1.5 : 0)}
          transparent={obj.opacity !== undefined && obj.opacity < 1}
          opacity={obj.opacity ?? 1}
          wireframe={obj.wireframe ?? false}
        />
      </mesh>
      {obj.emissive && (
        <pointLight color={obj.color} intensity={2} distance={sizeArr[0] * 5 || 5} />
      )}
      {obj.label && (
        <Text
          position={[0, sizeArr[1] * 0.6 + 0.4, 0]}
          fontSize={0.2}
          color="#aaaacc"
          anchorX="center"
          anchorY="bottom"
          font={undefined}
        >
          {obj.label}
        </Text>
      )}
    </group>
  );
}

function ShapeGeometry({ shape, size }: { shape: string; size: [number, number, number] }) {
  switch (shape) {
    case "sphere":
      return <sphereGeometry args={[size[0] * 0.5, 32, 32]} />;
    case "box":
      return <boxGeometry args={size} />;
    case "cylinder":
      return <cylinderGeometry args={[size[0] * 0.3, size[0] * 0.3, size[1], 16]} />;
    case "cone":
      return <coneGeometry args={[size[0] * 0.5, size[1], 16]} />;
    case "torus":
      return <torusGeometry args={[size[0] * 0.5, size[0] * 0.1, 16, 48]} />;
    case "ring":
      return <torusGeometry args={[size[0] * 0.5, 0.02, 8, 64]} />;
    case "plane":
      return <planeGeometry args={[size[0], size[1]]} />;
    default:
      return <sphereGeometry args={[size[0] * 0.5, 16, 16]} />;
  }
}

function ArrowObj({ obj }: { obj: SceneObject }) {
  const size = typeof obj.size === "number" ? obj.size : (obj.size?.[0] ?? 1);

  return (
    <group position={obj.position}>
      <mesh>
        <cylinderGeometry args={[0.02, 0.02, size, 8]} />
        <meshStandardMaterial color={obj.color} />
      </mesh>
      <mesh position={[0, size / 2, 0]}>
        <coneGeometry args={[0.08, 0.2, 8]} />
        <meshStandardMaterial color={obj.color} />
      </mesh>
      {obj.label && (
        <Text
          position={[0.3, size / 2, 0]}
          fontSize={0.15}
          color={obj.color}
          anchorX="left"
          anchorY="middle"
          font={undefined}
        >
          {obj.label}
        </Text>
      )}
    </group>
  );
}

function Connection({ conn, objects }: { conn: SceneConnection; objects: SceneObject[] }) {
  const from = objects.find((o) => o.id === conn.from);
  const to = objects.find((o) => o.id === conn.to);
  if (!from || !to) return null;

  return (
    <Line
      points={[from.position, to.position]}
      color={conn.color ?? "#555"}
      lineWidth={conn.dashed ? 1 : 1.5}
      dashed={conn.dashed ?? false}
      dashSize={0.15}
      gapSize={0.1}
    />
  );
}

function applyAnimation(group: THREE.Group, anim: SceneAnimation, t: number, basePos: [number, number, number]) {
  if (anim.orbit) {
    const { center, radius, speed, axis = "y" } = anim.orbit;
    const angle = t * speed;
    if (axis === "y") {
      group.position.x = center[0] + Math.cos(angle) * radius;
      group.position.z = center[2] + Math.sin(angle) * radius;
      group.position.y = center[1];
    } else if (axis === "x") {
      group.position.y = center[1] + Math.cos(angle) * radius;
      group.position.z = center[2] + Math.sin(angle) * radius;
      group.position.x = center[0];
    } else {
      group.position.x = center[0] + Math.cos(angle) * radius;
      group.position.y = center[1] + Math.sin(angle) * radius;
      group.position.z = center[2];
    }
  }

  if (anim.oscillate) {
    const { axis, amplitude, speed } = anim.oscillate;
    const offset = Math.sin(t * speed) * amplitude;
    const idx = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    const pos = [...basePos] as [number, number, number];
    pos[idx] += offset;
    if (!anim.orbit) {
      group.position.set(pos[0], pos[1], pos[2]);
    }
  }

  if (anim.rotate) {
    const { axis, speed } = anim.rotate;
    if (axis === "y") group.rotation.y = t * speed;
    else if (axis === "x") group.rotation.x = t * speed;
    else group.rotation.z = t * speed;
  }

  if (anim.pulse) {
    const { min, max, speed } = anim.pulse;
    const s = min + (max - min) * (0.5 + 0.5 * Math.sin(t * speed));
    group.scale.setScalar(s);
  }

  if (anim.float) {
    const { amplitude, speed } = anim.float;
    if (!anim.orbit && !anim.oscillate) {
      group.position.y = basePos[1] + Math.sin(t * speed) * amplitude;
    }
  }
}
