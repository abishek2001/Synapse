export interface SceneObject {
  id: string;
  shape: "sphere" | "box" | "cylinder" | "cone" | "torus" | "plane" | "arrow" | "text" | "ring";
  position: [number, number, number];
  color: string;
  size?: number | [number, number, number];
  label?: string;
  emissive?: boolean;
  emissiveIntensity?: number;
  opacity?: number;
  wireframe?: boolean;
  animate?: SceneAnimation;
}

export interface SceneAnimation {
  orbit?: { center: [number, number, number]; radius: number; speed: number; axis?: "y" | "x" | "z" };
  oscillate?: { axis: "x" | "y" | "z"; amplitude: number; speed: number };
  rotate?: { axis: "x" | "y" | "z"; speed: number };
  pulse?: { min: number; max: number; speed: number };
  float?: { amplitude: number; speed: number };
}

export interface SceneConnection {
  from: string;
  to: string;
  color?: string;
  label?: string;
  dashed?: boolean;
  animated?: boolean;
}

export interface SceneParameter {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  affects: string;
}

export interface SceneConfig {
  objects: SceneObject[];
  connections?: SceneConnection[];
  parameters?: SceneParameter[];
  environment?: "space" | "lab" | "grid" | "void";
  camera?: { position: [number, number, number]; lookAt?: [number, number, number] };
  title?: string;
}

export function isSceneConfig(v: unknown): v is SceneConfig {
  return typeof v === "object" && v !== null && "objects" in v && Array.isArray((v as SceneConfig).objects);
}
