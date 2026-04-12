/**
 * Gesture detection from MediaPipe hand landmarks.
 *
 * Landmarks used:
 *  0  = wrist
 *  4  = thumb tip
 *  8  = index tip
 *  12 = middle tip
 *  5  = index MCP (knuckle)
 *  6  = index PIP
 */

export interface Point {
  x: number;
  y: number;
  z: number;
}

export type GestureType = "point" | "pinch" | "open" | "fist" | "none";

export interface GestureResult {
  gesture: GestureType;
  cursor: { x: number; y: number };
  pinchDistance: number;
  confidence: number;
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function isExtended(tip: Point, pip: Point, mcp: Point): boolean {
  return dist(tip, mcp) > dist(pip, mcp) * 1.3;
}

const PINCH_THRESHOLD = 0.06;
const PINCH_RELEASE = 0.09;

let wasPinching = false;

export function detectGesture(landmarks: Point[]): GestureResult {
  if (landmarks.length < 21) {
    return { gesture: "none", cursor: { x: 0, y: 0 }, pinchDistance: 1, confidence: 0 };
  }

  const thumb = landmarks[4];
  const index = landmarks[8];
  const middle = landmarks[12];
  const ring = landmarks[16];
  const pinky = landmarks[20];
  const indexPip = landmarks[6];
  const indexMcp = landmarks[5];
  const middlePip = landmarks[10];
  const middleMcp = landmarks[9];
  const ringPip = landmarks[14];
  const ringMcp = landmarks[13];
  const pinkyPip = landmarks[18];
  const pinkyMcp = landmarks[17];

  const cursorX = (index.x + thumb.x) / 2;
  const cursorY = (index.y + thumb.y) / 2;

  const pinchDist = dist(thumb, index);

  const indexUp = isExtended(index, indexPip, indexMcp);
  const middleUp = isExtended(middle, middlePip, middleMcp);
  const ringUp = isExtended(ring, ringPip, ringMcp);
  const pinkyUp = isExtended(pinky, pinkyPip, pinkyMcp);

  // Hysteresis for pinch detection
  const pinchThresh = wasPinching ? PINCH_RELEASE : PINCH_THRESHOLD;

  if (pinchDist < pinchThresh) {
    wasPinching = true;
    return { gesture: "pinch", cursor: { x: cursorX, y: cursorY }, pinchDistance: pinchDist, confidence: 0.9 };
  }

  wasPinching = false;

  const allUp = indexUp && middleUp && ringUp && pinkyUp;
  if (allUp) {
    return { gesture: "open", cursor: { x: cursorX, y: cursorY }, pinchDistance: pinchDist, confidence: 0.8 };
  }

  if (indexUp && !middleUp && !ringUp && !pinkyUp) {
    return { gesture: "point", cursor: { x: index.x, y: index.y }, pinchDistance: pinchDist, confidence: 0.85 };
  }

  if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
    return { gesture: "fist", cursor: { x: cursorX, y: cursorY }, pinchDistance: pinchDist, confidence: 0.7 };
  }

  return { gesture: "point", cursor: { x: index.x, y: index.y }, pinchDistance: pinchDist, confidence: 0.5 };
}

export function resetGestureState() {
  wasPinching = false;
}
